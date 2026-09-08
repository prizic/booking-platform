import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  applicationOrigins,
  brandCases,
  getBrandSurfaceOrigin,
  locales,
  responsiveProfiles,
  tenantBrandSurfaces,
} from "./apps";
import {
  bookingQuery,
  clientOrigin,
  fillDetails,
  managementView,
  reachDetailsStep,
  requested,
  stubBookingApi,
} from "./booking-fixtures";

for (const profile of responsiveProfiles) {
  test.describe(`${profile.name} tenant accessibility`, () => {
    test.use({ viewport: profile.viewport });

    for (const surface of tenantBrandSurfaces) {
      for (const language of locales) {
        for (const brand of brandCases) {
          test(`${surface.name} ${language.locale} ${brand.name} has no automated WCAG A/AA violations`, async ({
            page,
          }) => {
            await page.goto(
              `${getBrandSurfaceOrigin(surface, brand)}/${language.locale}${surface.routeSuffix}`,
            );

            const results = await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
              .analyze();

            expect(results.violations).toEqual([]);
          });
        }
      }
    }
  });
}

const platformAdmin = applicationOrigins.find(
  (application) => application.name === "platform-admin",
)!;
for (const language of locales) {
  test(`platform-admin ${language.locale} retains its automated WCAG A/AA smoke`, async ({
    page,
  }) => {
    await page.goto(`${platformAdmin.origin}/${language.locale}`);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(results.violations).toEqual([]);
  });
}

// Issue #12. The booking journey has steps a static page visit never reaches,
// so each step is scanned where the customer actually stands.
for (const profile of responsiveProfiles) {
  test.describe(`${profile.name} booking journey accessibility`, () => {
    test.use({ viewport: profile.viewport });

    for (const language of locales) {
      test(`client booking ${language.locale} has no automated WCAG A/AA violations`, async ({
        page,
      }) => {
        await stubBookingApi(page);
        await page.goto(`${clientOrigin}/${language.locale}/book${bookingQuery}`);
        const scan = () =>
          new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
            .analyze();

        expect((await scan()).violations).toEqual([]);
        await reachDetailsStep(page, language.locale);
        expect((await scan()).violations).toEqual([]);

        // The error summary and the confirmation are separate views a scan of
        // the entry page would never see.
        await page
          .getByRole("button", { name: /confirm booking|تأكيد الحجز/iu })
          .click();
        await expect(page.locator("#booking-error")).toBeVisible();
        expect((await scan()).violations).toEqual([]);

        await fillDetails(page);
        await page
          .getByRole("button", { name: /confirm booking|تأكيد الحجز/iu })
          .click();
        await expect(
          page.getByRole("heading", {
            name: /your booking is confirmed|تم تأكيد حجزك/iu,
          }),
        ).toBeVisible();
        expect((await scan()).violations).toEqual([]);
      });
    }
  });
}

// Issue #13. The request outcome and the proposal link are separate views a
// scan of the booking entry page would never reach.
for (const language of locales) {
  test(`client request outcome ${language.locale} has no automated WCAG A/AA violations`, async ({
    page,
  }) => {
    await stubBookingApi(page, { confirmations: [{ body: requested, status: 200 }] });
    await reachDetailsStep(page, language.locale);
    await fillDetails(page);
    await page.getByRole("button", { name: /confirm booking|تأكيد الحجز/iu }).click();
    await expect(
      page.getByRole("heading", {
        name: /your request has been sent|تم إرسال طلبك/iu,
      }),
    ).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test(`client proposal link ${language.locale} has no automated WCAG A/AA violations`, async ({
    page,
  }) => {
    await page.goto(
      `${clientOrigin}/${language.locale}/proposal?token=${"c".repeat(64)}`,
    );
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}

// The Dashboard queue closes rather than opening empty when the secure
// connection is incomplete, and that closed state is what an unauthenticated
// reader sees, so it is scanned too.
for (const language of locales) {
  test(`dashboard bookings ${language.locale} has no automated WCAG A/AA violations`, async ({
    page,
  }) => {
    await page.goto(`http://localhost:41731/${language.locale}/bookings`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test(`dashboard requests ${language.locale} has no automated WCAG A/AA violations`, async ({
    page,
  }) => {
    await page.goto(`http://localhost:41731/${language.locale}/requests`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}

// Issue #14. The guest management surface has three states a visitor can land
// in — granted, refused, and step-up — and each is scanned in both locales.
for (const language of locales) {
  test(`client manage booking ${language.locale} has no automated WCAG A/AA violations`, async ({
    page,
  }) => {
    await page.route("**/api/manage", (route) => {
      const body = JSON.parse(route.request().postData() ?? "{}") as {
        action?: string;
      };
      if (body.action === "request-step-up") {
        return route.fulfill({
          json: { expiresAt: "2035-09-24T12:40:00.000Z", outcome: "sent" },
        });
      }
      return route.fulfill({ json: managementView });
    });
    await page.goto(
      `${clientOrigin}/${language.locale}/manage?token=${"e".repeat(64)}`,
    );
    await expect(page.getByText(managementView.booking.publicReference)).toBeVisible();
    const scan = () =>
      new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
    expect((await scan()).violations).toEqual([]);

    await page.getByRole("button", { name: /email me a code|أرسل لي رمزًا/iu }).click();
    expect((await scan()).violations).toEqual([]);
  });

  test(`client manage refusal ${language.locale} has no automated WCAG A/AA violations`, async ({
    page,
  }) => {
    await page.route("**/api/manage", (route) =>
      route.fulfill({ json: { outcome: "unavailable" } }),
    );
    await page.goto(
      `${clientOrigin}/${language.locale}/manage?token=${"e".repeat(64)}`,
    );
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}
