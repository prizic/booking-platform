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
  reachDetailsStep,
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
        await stubBookingApi(page, { locale: language.locale });
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
          page.getByRole("heading", { name: /your booking is confirmed|تم تأكيد حجزك/iu }),
        ).toBeVisible();
        expect((await scan()).violations).toEqual([]);
      });
    }
  });
}
