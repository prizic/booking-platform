import { expect, test, type Page } from "@playwright/test";

import { hasLocalSupabase } from "./local-supabase";
import {
  bookableDate,
  bookingCount,
  cleanupJourneyState,
  fixtureLocationId,
  fixtureServiceId,
  otherTenantServiceId,
  sql,
} from "./live-database";

// Issue #94. The booking tracer, driven by a browser, through the Client's own
// route handlers, into the real local database.
//
// `booking.spec.ts` proves the Client's own behaviour against stubbed DTOs,
// which is the right tool for rendering and validation. It cannot prove the two
// things that actually matter about a booking — that one was committed, and
// that only one was — because nothing it talks to remembers anything. These
// cases assert against the rows.
//
// Serial by construction: every case shares one database, and the interesting
// failures are exactly the ones about two things happening at once.
test.describe.configure({ mode: "serial" });

test.skip(
  !hasLocalSupabase(),
  "the live booking journey needs the local Supabase stack; run pnpm supabase:start",
);

// The Client dev server that has a database behind it. Separate from the one
// every other project uses, whose stable empty state is what their baselines
// are taken against.
const liveClientOrigin = "http://localhost:41735";
const bookingQuery = `?service=${fixtureServiceId}&location=${fixtureLocationId}`;

async function chooseFirstSlot(page: Page, date: string) {
  await page.locator('input[name="date"]').fill(date);
  await page.getByRole("button", { name: /find times/iu }).click();
  await page
    .getByRole("button", { name: /^select$/iu })
    .first()
    .click();
  await page.getByRole("button", { name: /hold this time/iu }).click();
  await expect(page.getByLabel(/full name/iu)).toBeVisible();
}

async function fillDetails(page: Page) {
  await page.getByLabel(/full name/iu).fill("Live Journey Guest");
  await page.getByLabel(/^email/iu).fill("live-guest@example.invalid");
  await page.getByRole("checkbox").check();
}

test.beforeEach(() => cleanupJourneyState());
test.afterAll(() => cleanupJourneyState());

test("a guest books a real slot and the database holds exactly one booking", async ({
  page,
}) => {
  await page.goto(`${liveClientOrigin}/en/book${bookingQuery}`);
  await chooseFirstSlot(page, bookableDate());
  await fillDetails(page);
  await page.getByRole("button", { name: /confirm booking/iu }).click();

  await expect(
    page.getByRole("heading", { name: /your booking is confirmed/iu }),
  ).toBeVisible();

  // The reference on screen is the one the database minted, not one the browser
  // made up: it is read back by value.
  const reference = (
    await page.locator("[data-public-reference], main").first().innerText()
  ).match(/[A-Z0-9]{10}/u)?.[0];
  expect(reference).toBeTruthy();

  const row = sql(
    `select status || '|' || public_reference from app.bookings
     where public_reference='${reference}';`,
  );
  expect(row).toBe(`confirmed|${reference}`);
  expect(bookingCount()).toBe(1);

  // Notification intent is part of committing a booking, not a later best
  // effort: the outbox row is written in the same transaction.
  expect(
    Number(
      sql(
        `select count(*) from app.outbox_events o join app.bookings b on b.id=o.booking_id
         where b.public_reference='${reference}';`,
      ),
    ),
  ).toBeGreaterThan(0);
});

test("a slot taken while the guest was typing is refused, not overbooked", async ({
  page,
}) => {
  await page.goto(`${liveClientOrigin}/en/book${bookingQuery}`);
  await chooseFirstSlot(page, bookableDate());
  await fillDetails(page);

  // Somebody else wins the slot: their booking takes the allocation this hold
  // was holding. The exclusion constraint on allocations is what capacity
  // actually is, so this is the real contention rather than a simulated code
  // path.
  sql(`
    update app.assignment_allocations a
    set state = 'confirmed', hold_id = null
    from app.booking_holds h
    where a.hold_id = h.id
      and h.tenant_id = '${"a0000000-0000-0000-0000-000000000001"}'
      and h.state = 'active';
  `);

  await page.getByRole("button", { name: /confirm booking/iu }).click();
  await expect(page.locator("#booking-error")).toBeVisible();
  // No booking, and the guest is told rather than shown a confirmation.
  expect(bookingCount()).toBe(0);
});

test("a hold that expired while the guest was typing cannot be confirmed", async ({
  page,
}) => {
  await page.goto(`${liveClientOrigin}/en/book${bookingQuery}`);
  await chooseFirstSlot(page, bookableDate());
  await fillDetails(page);

  sql(`
    update app.booking_holds
    set expires_at = statement_timestamp() - interval '1 minute'
    where tenant_id='a0000000-0000-0000-0000-000000000001' and state='active';
  `);

  await page.getByRole("button", { name: /confirm booking/iu }).click();
  await expect(page.locator("#booking-error")).toBeVisible();
  expect(bookingCount()).toBe(0);
});

test("a duplicate submission commits one booking, not two", async ({ page }) => {
  await page.goto(`${liveClientOrigin}/en/book${bookingQuery}`);
  await chooseFirstSlot(page, bookableDate());
  await fillDetails(page);

  // The submission is sent twice, byte for byte, which is what a retried request
  // after a timeout actually is. Nothing is stubbed: both copies reach the real
  // route handler and the real database, and the idempotency key they share is
  // what has to make the second one free.
  let delivered = 0;
  await page.route("**/api/bookings", async (route) => {
    const first = await route.fetch();
    delivered += 1;
    await route.fetch();
    delivered += 1;
    await route.fulfill({ response: first });
  });

  await page.getByRole("button", { name: /confirm booking/iu }).click();
  await expect(
    page.getByRole("heading", { name: /your booking is confirmed/iu }),
  ).toBeVisible();

  expect(delivered).toBe(2);
  expect(bookingCount()).toBe(1);
});

test("an incomplete submission never reaches the database", async ({ page }) => {
  await page.goto(`${liveClientOrigin}/en/book${bookingQuery}`);
  await chooseFirstSlot(page, bookableDate());
  await page.getByRole("button", { name: /confirm booking/iu }).click();

  await expect(page.locator("#booking-error")).toContainText(/enter your full name/iu);
  expect(bookingCount()).toBe(0);
});

test("another tenant's service is not bookable from this tenant's host", async ({
  page,
}) => {
  // The identifiers in the URL are a hint. Authorization is the hostname the
  // request arrived on, re-read in the database — so asking tenant A's site for
  // tenant B's service resolves to nothing rather than to tenant B.
  const response = await page.request.get(`${liveClientOrigin}/api/availability`, {
    params: {
      endBefore: `${bookableDate()}T23:00:00.000Z`,
      locale: "en",
      locationId: fixtureLocationId,
      partySize: 1,
      serviceId: otherTenantServiceId,
      startAfter: `${bookableDate()}T14:00:00.000Z`,
      timeZone: "America/Chicago",
    },
  });
  const body = (await response.json()) as {
    error?: { code?: string };
    slots?: unknown[];
  };
  expect(body.slots ?? []).toHaveLength(0);
  expect(bookingCount()).toBe(0);
});

test("the booking a guest just made is not visible to an unauthenticated Dashboard", async ({
  page,
}) => {
  await page.goto(`${liveClientOrigin}/en/book${bookingQuery}`);
  await chooseFirstSlot(page, bookableDate());
  await fillDetails(page);
  await page.getByRole("button", { name: /confirm booking/iu }).click();
  await expect(
    page.getByRole("heading", { name: /your booking is confirmed/iu }),
  ).toBeVisible();

  const reference = sql(
    `select public_reference from app.bookings
     where tenant_id='a0000000-0000-0000-0000-000000000001' limit 1;`,
  );
  expect(reference).toMatch(/^[A-Z0-9]{10}$/u);

  // The workspace is server-rendered and fails closed. A visitor with no
  // session sees an access panel, not somebody's customer — which is the half
  // of "the Dashboard sees the booking" that can be asserted before the
  // Dashboard has a sign-in path at all.
  await page.goto("http://localhost:41731/en/today");
  await expect(page.getByText(reference)).toHaveCount(0);
  await expect(page.getByText(/live-guest@example.invalid/iu)).toHaveCount(0);
});
