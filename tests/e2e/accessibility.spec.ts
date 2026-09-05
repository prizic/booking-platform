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
