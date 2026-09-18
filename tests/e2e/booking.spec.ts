import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import {
  bookingQuery,
  clientOrigin,
  confirmed,
  fillDetails,
  managementView,
  reachDetailsStep,
  requested,
  slotEnd,
  slotStart,
  stubBookingApi,
  stubDepositCheckout,
} from "./booking-fixtures";
import { locales, responsiveProfiles } from "./apps";

for (const profile of responsiveProfiles) {
  test.describe(`${profile.name} booking journey`, () => {
    test.use({ viewport: profile.viewport });

    for (const language of locales) {
      test(`${language.locale} guest completes a no-payment booking`, async ({
        page,
      }) => {
        await stubBookingApi(page);
        await page.goto(`${clientOrigin}/${language.locale}/book${bookingQuery}`);
        await expect(page.locator("html")).toHaveAttribute("dir", language.direction);

        await reachDetailsStep(page, language.locale);
        await fillDetails(page);
        await page
          .getByRole("button", { name: /confirm booking|تأكيد الحجز/iu })
          .click();

        // Confirmation is rendered from committed state the database returned.
        await expect(
          page.getByRole("heading", {
            name: /your booking is confirmed|تم تأكيد حجزك/iu,
          }),
        ).toBeVisible();
        await expect(page.getByText("K3M9P2T7XY")).toBeVisible();
        await expect(page.getByText(/SAR|ر\.س/u).first()).toBeVisible();
      });
    }
  });
}

test("an incomplete submission never reaches the booking endpoint", async ({
  page,
}) => {
  const submissions = await stubBookingApi(page);
  await reachDetailsStep(page, "en");
  await page.getByRole("button", { name: /confirm booking/iu }).click();

  await expect(page.locator("#booking-error")).toContainText(/enter your full name/iu);
  await expect(page.locator("#booking-error")).toContainText(/accept the policy/iu);
  expect(submissions).toEqual([]);
});

test("a duplicate submission stays one booking", async ({ page }) => {
  const submissions = await stubBookingApi(page, {
    confirmations: [
      { body: confirmed, status: 200 },
      { body: { ...confirmed, replayed: true }, status: 200 },
    ],
  });
  await reachDetailsStep(page, "en");
  await fillDetails(page);
  const submit = page.getByRole("button", { name: /confirm booking/iu });
  await submit.click();

  await expect(
    page.getByRole("heading", { name: /your booking is confirmed/iu }),
  ).toBeVisible();
  // Every submission carries the same hold-derived key, so the database
  // replays the one committed booking instead of creating a second.
  const keys = new Set(
    submissions.map((body) => (body as { idempotencyKey: string }).idempotencyKey),
  );
  expect(keys.size).toBe(1);
});

test("a lost slot keeps the answers the guest already typed", async ({ page }) => {
  await stubBookingApi(page, {
    confirmations: [{ code: "slot_unavailable", status: 409 }],
  });
  await reachDetailsStep(page, "en");
  await fillDetails(page);
  await page.getByRole("button", { name: /confirm booking/iu }).click();

  await expect(page.locator("#booking-error")).toContainText(/that time was taken/iu);
  await expect(page.getByLabel(/full name/iu)).toHaveValue("Test Guest");
  await expect(page.getByLabel(/reason for visit/iu)).toHaveValue("First visit");
  await page
    .getByRole("button", { name: /choose another time/iu })
    .first()
    .click();
  await expect(page.getByRole("button", { name: /find times/iu })).toBeVisible();
});

test("a service that needs payment is refused with a safe explanation", async ({
  page,
}) => {
  await stubBookingApi(page, {
    confirmations: [{ code: "payment_pending", status: 402 }],
  });
  await reachDetailsStep(page, "en");
  await fillDetails(page);
  await page.getByRole("button", { name: /confirm booking/iu }).click();

  await expect(page.locator("#booking-error")).toContainText(/needs payment/iu);
  await expect(
    page.getByRole("heading", { name: /your booking is confirmed/iu }),
  ).toHaveCount(0);
});

test("an approval-gated service tells the customer the time is not booked yet", async ({
  page,
}) => {
  await stubBookingApi(page, {
    confirmations: [{ body: requested, status: 200 }],
  });
  await reachDetailsStep(page, "en");
  await fillDetails(page);
  await page.getByRole("button", { name: /confirm booking/iu }).click();

  await expect(
    page.getByRole("heading", { name: /your request has been sent/iu }),
  ).toBeVisible();
  await expect(page.getByText(/awaiting approval/iu).first()).toBeVisible();
  await expect(page.getByText("R7Q2M4T9XZ")).toBeVisible();
  // The decision deadline is shown, so "pending" is never open-ended.
  await expect(page.getByText(/decision due by/iu)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /your booking is confirmed/iu }),
  ).toHaveCount(0);
});

test.describe("staff proposal link", () => {
  const token = "b".repeat(64);

  test("a customer accepts a suggested time", async ({ page }) => {
    await page.route("**/api/proposals", (route) =>
      route.fulfill({
        json: {
          bookingId: requested.bookingId,
          endAt: "2035-09-25T14:45:00.000Z",
          proposalState: "accepted",
          publicReference: requested.publicReference,
          startAt: "2035-09-25T14:00:00.000Z",
          status: "confirmed",
        },
      }),
    );
    await page.goto(`${clientOrigin}/en/proposal?token=${token}`);
    await page.getByRole("button", { name: /accept the new time/iu }).click();

    await expect(
      page.getByRole("heading", { name: /your booking is confirmed/iu }),
    ).toBeVisible();
  });

  test("a customer keeps the original request", async ({ page }) => {
    await page.route("**/api/proposals", (route) =>
      route.fulfill({
        json: {
          bookingId: requested.bookingId,
          endAt: requested.endAt,
          proposalState: "declined",
          publicReference: requested.publicReference,
          startAt: requested.startAt,
          status: "requested",
        },
      }),
    );
    await page.goto(`${clientOrigin}/ar/proposal?token=${token}`);
    await page.getByRole("button", { name: /الإبقاء على طلبي الأصلي/u }).click();

    await expect(
      page.getByRole("heading", { name: /طلبك الأصلي ما زال قائمًا/u }),
    ).toBeVisible();
  });

  test("a spent link explains itself without disclosing anything", async ({ page }) => {
    await page.route("**/api/proposals", (route) =>
      route.fulfill({
        json: { error: { code: "revision_conflict", messageKey: "booking.error" } },
        status: 409,
      }),
    );
    await page.goto(`${clientOrigin}/en/proposal?token=${token}`);
    await page.getByRole("button", { name: /accept the new time/iu }).click();

    await expect(page.locator("#proposal-error")).toContainText(
      /no longer available/iu,
    );
  });

  test("a page opened without a link offers no action", async ({ page }) => {
    await page.goto(`${clientOrigin}/en/proposal`);
    await expect(page.getByText(/open the link from your email/iu)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /accept the new time/iu }),
    ).toHaveCount(0);
  });
});

test.describe("guest management link", () => {
  const token = "d".repeat(64);
  const grantedView = {
    booking: {
      approvalStatus: "not_required",
      bookingId: "0a3f2b64-0000-4000-8000-000000000004",
      bookingRevision: 1,
      consentVersion: "2",
      customerTimeZone: "Asia/Riyadh",
      endAt: slotEnd,
      locale: "en",
      locationName: "Downtown",
      locationTimeZone: "America/New_York",
      paymentStatus: "not_required",
      price: { currency: "SAR", minorUnits: 18_000 },
      publicReference: "M4T7XZK3Q2",
      serviceName: "Initial consultation",
      startAt: slotStart,
      status: "confirmed",
    },
    canCancel: true,
    canReschedule: true,
    intent: "view",
    outcome: "granted",
    stepUpRequired: false,
    stepUpVerified: false,
    tokenExpiresAt: "2035-09-30T13:00:00.000Z",
  };

  test("a valid link shows only that booking", async ({ page }) => {
    await page.route("**/api/manage", (route) => route.fulfill({ json: grantedView }));
    await page.goto(`${clientOrigin}/en/manage?token=${token}`);

    await expect(page.getByText("M4T7XZK3Q2")).toBeVisible();
    await expect(page.getByText(/you can cancel this booking/iu)).toBeVisible();
    // A view link never offers step-up, because it can never act.
    await expect(page.getByRole("button", { name: /email me a code/iu })).toHaveCount(
      0,
    );
  });

  test("every refusal looks the same and discloses nothing", async ({ page }) => {
    await page.route("**/api/manage", (route) =>
      route.fulfill({ json: { outcome: "unavailable" } }),
    );
    await page.goto(`${clientOrigin}/ar/manage?token=${token}`);

    await expect(
      page.getByRole("heading", { name: /لا يمكن استخدام هذا الرابط/u }),
    ).toBeVisible();
    await expect(page.getByText("M4T7XZK3Q2")).toHaveCount(0);
  });

  test("an action link asks for a code before it may act", async ({ page }) => {
    let verified = false;
    await page.route("**/api/manage", (route) => {
      const body = JSON.parse(route.request().postData() ?? "{}") as {
        action?: string;
        code?: string;
      };
      if (body.action === "request-step-up") {
        return route.fulfill({
          json: { expiresAt: "2035-09-24T12:40:00.000Z", outcome: "sent" },
        });
      }
      if (body.action === "verify-step-up") {
        verified = body.code === "123456";
        return route.fulfill({ json: { verified } });
      }
      return route.fulfill({
        json: {
          ...grantedView,
          intent: "cancel",
          stepUpRequired: true,
          stepUpVerified: verified,
        },
      });
    });
    await page.goto(`${clientOrigin}/en/manage?token=${token}`);

    await page.getByRole("button", { name: /email me a code/iu }).click();
    await expect(page.getByText(/a code is on its way/iu)).toBeVisible();

    await page.getByLabel(/six-digit code/iu).fill("000000");
    await page.getByRole("button", { name: /confirm code/iu }).click();
    await expect(page.locator("#manage-step-up-error")).toContainText(
      /that code did not work/iu,
    );

    await page.getByLabel(/six-digit code/iu).fill("123456");
    await page.getByRole("button", { name: /confirm code/iu }).click();
    await expect(page.getByText(/confirmed\. you can continue/iu)).toBeVisible();
  });

  test("the link never travels in the URL of a request", async ({ page }) => {
    const urls: string[] = [];
    await page.route("**/api/manage", (route) => {
      urls.push(route.request().url());
      return route.fulfill({ json: grantedView });
    });
    await page.goto(`${clientOrigin}/en/manage?token=${token}`);
    await expect(page.getByText("M4T7XZK3Q2")).toBeVisible();

    expect(urls.every((url) => !url.includes(token))).toBe(true);
  });

  test("a page opened without a link offers nothing", async ({ page }) => {
    await page.goto(`${clientOrigin}/en/manage`);
    await expect(
      page.getByText(/open the link from your booking email/iu),
    ).toBeVisible();
  });
});

test.describe("guest booking changes", () => {
  const token = "f".repeat(64);

  async function stubManage(page: Page, applied: Record<string, unknown>) {
    await page.route("**/api/manage", (route) => {
      const body = JSON.parse(route.request().postData() ?? "{}") as {
        action?: string;
      };
      if (body.action === "cancel" || body.action === "reschedule") {
        return route.fulfill({ json: applied });
      }
      return route.fulfill({
        json: {
          ...managementView,
          intent: body.action === "reschedule" ? "reschedule" : "cancel",
          stepUpRequired: true,
          stepUpVerified: true,
        },
      });
    });
  }

  test("a verified guest cancels and is told the refund", async ({ page }) => {
    await stubManage(page, {
      bookingId: managementView.booking.bookingId,
      bookingRevision: 2,
      outcome: "applied",
      refund: { currency: "SAR", minorUnits: 18_000 },
      refundPercentBps: 10_000,
      startAt: null,
      status: "cancelled",
    });
    await page.goto(`${clientOrigin}/en/manage?token=${token}`);
    await page.getByRole("button", { name: /^cancel this booking$/iu }).click();

    await expect(
      page.getByRole("heading", { name: /your booking is cancelled/iu }),
    ).toBeVisible();
    await expect(page.getByText(/refunds/iu)).toBeVisible();
  });

  test("a change that lost a race changes nothing and says so", async ({ page }) => {
    await stubManage(page, { outcome: "unavailable" });
    await page.goto(`${clientOrigin}/en/manage?token=${token}`);
    await page.getByRole("button", { name: /^cancel this booking$/iu }).click();

    await expect(page.locator("#manage-action-error")).toContainText(
      /your booking changed while this page was open/iu,
    );
    // The booking facts are still on screen: nothing was applied.
    await expect(page.getByText(managementView.booking.publicReference)).toBeVisible();
  });
});

// Issue #22. A deposit-backed booking: what is owed is stated before the
// customer goes anywhere, and every way the payment can end has a sentence.
test.describe("deposit checkout", () => {
  test("states the deposit and the balance before asking for payment", async ({
    page,
  }) => {
    await stubDepositCheckout(page);
    await reachDetailsStep(page, "en");

    await expect(page.getByText(/due today/iu)).toBeVisible();
    await expect(page.getByText(/balance due at your appointment/iu)).toBeVisible();
    // The server's figures, rendered as money in the customer's locale.
    await expect(page.getByText(/45\.00/u)).toBeVisible();
    await expect(page.getByText(/135\.00/u)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /continue to payment/iu }),
    ).toBeVisible();
  });

  test("shows a recoverable message when the provider cannot be reached", async ({
    page,
  }) => {
    await stubDepositCheckout(page, { redirectUrl: null });
    await reachDetailsStep(page, "en");
    await fillDetails(page);
    await page.getByRole("button", { name: /continue to payment/iu }).click();

    await expect(
      page.getByRole("heading", { name: /payment is temporarily unavailable/iu }),
    ).toBeVisible();
    // Nothing was charged and the customer is not stranded.
    await expect(page.getByText(/nothing was charged/iu)).toBeVisible();
  });

  test("tells a customer plainly when their slot went while they paid", async ({
    page,
  }) => {
    await stubDepositCheckout(page);
    await page.goto(
      `${clientOrigin}/en/book${bookingQuery}&checkout=return&hold=0a3f2b64-0000-4000-8000-000000000001`,
    );

    await expect(
      page.getByRole("heading", { name: /could not hold your time/iu }),
    ).toBeVisible();
    await expect(page.getByText(/refund has been started/iu)).toBeVisible();
    // A booking that does not exist is never shown as one.
    await expect(page.getByText(/your booking is confirmed/iu)).toHaveCount(0);
  });

  test("keeps the Arabic recovery path complete", async ({ page }) => {
    await stubDepositCheckout(page);
    await page.goto(
      `${clientOrigin}/ar/book${bookingQuery}&checkout=return&hold=0a3f2b64-0000-4000-8000-000000000001`,
    );

    await expect(
      page.getByRole("heading", { name: /لم نتمكّن من تثبيت موعدك/u }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });
});

// Issue #94. These cases use the Client's own route handlers against a
// separately seeded local tenant. They deliberately share no mocked booking
// DTOs with the broader browser suite above.
test.describe("live database booking journey", () => {
  const dashboardOrigin = "http://localhost:41731";
  const liveServiceId = "e7200000-0000-0000-0000-000000000001";
  const liveLocationId = "e5000000-0000-0000-0000-000000000001";
  const tenantAServiceId = "a7200000-0000-0000-0000-000000000001";
  const tenantALocationId = "a5000000-0000-0000-0000-000000000001";

  test.skip(
    process.env.LIVE_BOOKING_E2E !== "1",
    "requires the isolated local Supabase fixture",
  );
  test.describe.configure({ mode: "serial" });

  function futureDate(daysFromNow: number): string {
    return new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
  }

  async function chooseLiveSlot(page: Page, daysFromNow: number) {
    await page.goto(
      `${clientOrigin}/en/book?service=${liveServiceId}&location=${liveLocationId}`,
    );
    await page.locator('input[name="date"]').fill(futureDate(daysFromNow));
    await page.getByRole("button", { name: /find times/iu }).click();
    await page
      .getByRole("button", { name: /^select$/iu })
      .first()
      .click();
  }

  async function holdLiveSlot(page: Page): Promise<string> {
    const holdResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/holds" &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: /hold this time/iu }).click();
    const response = await holdResponse;
    expect(response.status()).toBe(200);
    const payload = (await response.json()) as { hold: { holdId: string } };
    await expect(page.getByLabel(/reason for visit/iu)).toBeVisible();
    return payload.hold.holdId;
  }

  async function reachLiveDetails(page: Page, daysFromNow: number): Promise<string> {
    await chooseLiveSlot(page, daysFromNow);
    return holdLiveSlot(page);
  }

  async function fillLiveDetails(page: Page, email = "live-guest@example.invalid") {
    await page.getByLabel(/full name/iu).fill("Live Booking Guest");
    await page.getByLabel(/email/iu).fill(email);
    await page.getByLabel(/reason for visit/iu).fill("Live browser coverage");
    await page.getByRole("checkbox").check();
  }

  async function signInLiveDashboard(context: BrowserContext) {
    const credentialFile = process.env.LIVE_BOOKING_CREDENTIAL_FILE;
    if (credentialFile === undefined || credentialFile === "") {
      throw new Error("Live booking E2E requires its credential-file path.");
    }
    execFileSync("node", ["scripts/live-booking-e2e.mjs", "dashboard-session"], {
      cwd: process.cwd(),
      stdio: "ignore",
    });
    const sessionFile = join(dirname(credentialFile), "dashboard-storage-state.json");
    const storageState = JSON.parse(readFileSync(sessionFile, "utf8")) as {
      cookies: Parameters<BrowserContext["addCookies"]>[0];
    };
    await context.addCookies(storageState.cookies);
  }

  function expireFixtureHold(holdId: string) {
    execFileSync("node", ["scripts/live-booking-e2e.mjs", "expire-hold", holdId], {
      cwd: process.cwd(),
      stdio: "ignore",
    });
  }

  async function createWinningBooking(browser: Browser, daysFromNow: number) {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await reachLiveDetails(page, daysFromNow);
      await fillLiveDetails(page, "live-winning-guest@example.invalid");
      await page.getByRole("button", { name: /confirm booking/iu }).click();
      await expect(
        page.getByRole("heading", { name: /your booking is confirmed/iu }),
      ).toBeVisible();
    } finally {
      await context.close();
    }
  }

  test("Client commits a live booking that the authenticated Dashboard lists", async ({
    page,
    context,
  }) => {
    await reachLiveDetails(page, 1);
    await fillLiveDetails(page);
    await page.getByRole("button", { name: /confirm booking/iu }).click();

    await expect(
      page.getByRole("heading", { name: /your booking is confirmed/iu }),
    ).toBeVisible();
    await expect(page.getByText(/live consultation/iu)).toBeVisible();

    await signInLiveDashboard(context);
    await page.goto(`${dashboardOrigin}/en/bookings`);
    await expect(page.getByRole("heading", { name: /bookings/iu })).toBeVisible();
    await expect(page.getByText(/live consultation/iu)).toBeVisible();
  });

  test("Client validation blocks an incomplete live submission before the booking route", async ({
    page,
  }) => {
    await reachLiveDetails(page, 2);
    let bookingRequests = 0;
    page.on("request", (request) => {
      if (request.url().endsWith("/api/bookings") && request.method() === "POST") {
        bookingRequests += 1;
      }
    });

    await page.getByRole("button", { name: /confirm booking/iu }).click();
    await expect(page.locator("#booking-error")).toContainText(
      /enter your full name/iu,
    );
    await expect(page.locator("#booking-error")).toContainText(/accept the policy/iu);
    expect(bookingRequests).toBe(0);
  });

  test("Client duplicate submits converge on one live booking", async ({
    page,
    context,
  }) => {
    await reachLiveDetails(page, 3);
    await fillLiveDetails(page, "live-duplicate-guest@example.invalid");

    const confirmations: { readonly body: unknown; readonly status: number }[] = [];
    page.on("response", async (response) => {
      if (
        new URL(response.url()).pathname === "/api/bookings" &&
        response.request().method() === "POST"
      ) {
        confirmations.push({
          body: await response.json(),
          status: response.status(),
        });
      }
    });

    await page.getByRole("button", { name: /confirm booking/iu }).evaluate((button) => {
      button.click();
      button.click();
    });

    await expect(
      page.getByRole("heading", { name: /your booking is confirmed/iu }),
    ).toBeVisible();
    await expect.poll(() => confirmations.length).toBe(2);
    expect(confirmations.map(({ status }) => status)).toEqual([200, 200]);

    const results = confirmations.map(
      ({ body }) =>
        body as {
          bookingId: string;
          publicReference: string;
          replayed: boolean;
        },
    );
    expect(new Set(results.map(({ bookingId }) => bookingId)).size).toBe(1);
    expect(results.filter(({ replayed }) => replayed)).toHaveLength(1);
    const publicReference = results[0]!.publicReference;

    await signInLiveDashboard(context);
    await page.goto(`${dashboardOrigin}/en/bookings`);
    await expect(page.getByRole("heading", { name: /bookings/iu })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: new RegExp(publicReference, "u") }),
    ).toBeVisible();
  });

  test("Client preserves details after its real hold expires", async ({ page }) => {
    const holdId = await reachLiveDetails(page, 4);
    await fillLiveDetails(page, "live-expired-guest@example.invalid");
    expireFixtureHold(holdId);

    await page.getByRole("button", { name: /confirm booking/iu }).click();
    await expect(page.locator("#booking-error")).toContainText(/that time was taken/iu);
    await expect(page.getByLabel(/full name/iu)).toHaveValue("Live Booking Guest");
    await expect(page.getByLabel(/reason for visit/iu)).toHaveValue(
      "Live browser coverage",
    );
  });

  test("Client keeps answers when another guest commits after its hold has expired", async ({
    browser,
    page,
  }) => {
    const holdId = await reachLiveDetails(page, 5);
    await fillLiveDetails(page, "live-stale-guest@example.invalid");
    expireFixtureHold(holdId);
    await createWinningBooking(browser, 5);

    await page.getByRole("button", { name: /confirm booking/iu }).click();
    await expect(page.locator("#booking-error")).toContainText(/that time was taken/iu);
    await expect(page.getByLabel(/full name/iu)).toHaveValue("Live Booking Guest");
    await expect(page.getByLabel(/reason for visit/iu)).toHaveValue(
      "Live browser coverage",
    );
    await page
      .locator("#booking-error")
      .getByRole("button", { name: /choose another time/iu })
      .click();
    await expect(page.getByRole("button", { name: /find times/iu })).toBeVisible();
  });

  test("Client rejects another tenant's catalog identifiers without disclosing them", async ({
    page,
  }) => {
    await page.goto(`${clientOrigin}/en`);
    const response = await page.evaluate(
      async ({ locationId: foreignLocationId, serviceId: foreignServiceId }) => {
        const nonce = crypto.randomUUID();
        const result = await fetch("/api/holds", {
          body: JSON.stringify({
            expectedCacheTag: null,
            idempotencyKey: `cross-tenant-hold-${nonce}`,
            locale: "en",
            locationId: foreignLocationId,
            partySize: 1,
            serviceId: foreignServiceId,
            sessionToken: `cross-tenant-session-${nonce}`,
            staffPreferenceId: null,
            startAt: "2035-01-02T13:00:00.000Z",
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        return { body: await result.json(), status: result.status };
      },
      { locationId: tenantALocationId, serviceId: tenantAServiceId },
    );

    expect(response).toEqual({
      body: {
        error: {
          code: "not_authorized",
          messageKey: "booking.error.not_authorized",
        },
      },
      status: 403,
    });
  });
});
