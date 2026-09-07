import { expect, type Page } from "@playwright/test";

// Shared booking-journey fixtures. The Client is driven through its own route
// handlers with platform DTO responses; the database side of the same tracer is
// proven in supabase/tests/database/booking_test.sql.
export const clientOrigin = "http://localhost:41730";
// A service page deep-links into its own journey. The identifiers are only a
// hint; every one of them is re-read and authorized in the database.
export const bookingQuery =
  "?service=a7200000-0000-0000-0000-000000000001&location=a5000000-0000-0000-0000-000000000001";

const slotStart = "2035-09-24T13:00:00.000Z";
const slotEnd = "2035-09-24T13:45:00.000Z";

const availability = {
  advisory: true,
  displayTimeZone: "Asia/Riyadh",
  locationTimeZone: "America/New_York",
  noSlotReason: null,
  providerHealth: "not_applicable",
  slots: [
    {
      allocationKind: "appointment",
      endAt: slotEnd,
      staffId: "a8000000-0000-0000-0000-000000000001",
      startAt: slotStart,
    },
  ],
};

const heldSlot = {
  form: {
    consentText: "Cancellations are free up to 24 hours before.",
    consentVersion: "2",
    fields: [
      { key: "reason", label: "Reason for visit", maxLength: 500, required: true },
    ],
    locationName: "Downtown",
    serviceName: "Initial consultation",
  },
  hold: {
    allocationKind: "appointment",
    expiresAt: "2035-09-24T12:50:00.000Z",
    holdId: "0a3f2b64-0000-4000-8000-000000000001",
    price: { currency: "SAR", minorUnits: 18_000 },
    replayed: false,
    slotEnd,
    slotStart,
    staffId: "a8000000-0000-0000-0000-000000000001",
    state: "active",
  },
};

export const confirmed = {
  approvalStatus: "not_required",
  bookingId: "0a3f2b64-0000-4000-8000-000000000002",
  bookingRevision: 1,
  calendarStatus: "pending",
  consentVersion: "2",
  customerTimeZone: "Asia/Riyadh",
  endAt: slotEnd,
  locale: "en",
  locationName: "Downtown",
  locationTimeZone: "America/New_York",
  notificationStatus: "queued",
  paymentStatus: "not_required",
  price: { currency: "SAR", minorUnits: 18_000 },
  publicReference: "K3M9P2T7XY",
  replayed: false,
  serviceName: "Initial consultation",
  startAt: slotStart,
  status: "confirmed",
  taxRateBps: 1500,
};

export interface StubOptions {
  readonly confirmations?: readonly (
    | { readonly body: unknown; readonly status: 200 }
    | { readonly code: string; readonly status: number }
  )[];
}

export async function stubBookingApi(page: Page, options: StubOptions = {}) {
  const submissions: unknown[] = [];
  const queue = [
    ...(options.confirmations ?? [{ body: confirmed, status: 200 as const }]),
  ];

  await page.route("**/api/availability**", (route) =>
    route.fulfill({ json: availability }),
  );
  await page.route("**/api/holds", (route) => route.fulfill({ json: heldSlot }));
  await page.route("**/api/bookings", (route) => {
    submissions.push(JSON.parse(route.request().postData() ?? "null"));
    const next = queue.length > 1 ? queue.shift()! : queue[0]!;
    if ("body" in next) return route.fulfill({ json: next.body, status: next.status });
    return route.fulfill({
      json: { error: { code: next.code, messageKey: `booking.error.${next.code}` } },
      status: next.status,
    });
  });
  return submissions;
}

export async function reachDetailsStep(page: Page, locale: "en" | "ar") {
  await page.goto(`${clientOrigin}/${locale}/book${bookingQuery}`);
  await page.locator('input[name="date"]').fill("2035-09-24");
  await page.getByRole("button", { name: /find times|البحث عن أوقات/iu }).click();
  await page
    .getByRole("button", { name: /^(select|اختيار)$/iu })
    .first()
    .click();
  await page.getByRole("button", { name: /hold this time|احجز هذا الوقت/iu }).click();
  await expect(page.getByLabel(/reason for visit/iu)).toBeVisible();
}

export async function fillDetails(page: Page) {
  await page.getByLabel(/full name|الاسم الكامل/iu).fill("Test Guest");
  await page.getByLabel(/^(email|البريد الإلكتروني)/iu).fill("guest@example.invalid");
  await page.getByLabel(/reason for visit/iu).fill("First visit");
  await page.getByRole("checkbox").check();
}
