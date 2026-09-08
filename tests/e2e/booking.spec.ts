import { expect, test } from "@playwright/test";
import { locales, responsiveProfiles } from "./apps";
import {
  bookingQuery,
  clientOrigin,
  confirmed,
  fillDetails,
  reachDetailsStep,
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
