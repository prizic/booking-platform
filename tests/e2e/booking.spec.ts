import { expect, test } from "@playwright/test";
import { locales, responsiveProfiles } from "./apps";
import {
  bookingQuery,
  clientOrigin,
  confirmed,
  fillDetails,
  reachDetailsStep,
  requested,
  slotEnd,
  slotStart,
  stubBookingApi,
} from "./booking-fixtures";

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
