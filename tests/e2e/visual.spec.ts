import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  brandCases,
  getBrandSurfaceOrigin,
  locales,
  responsiveProfiles,
  settleBrandRender,
  tenantBrandSurfaces,
} from "./apps";

const visualStylePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "visual-regression.css",
);

for (const profile of responsiveProfiles) {
  test.describe(`${profile.name} visual matrix`, () => {
    test.use({ viewport: profile.viewport });

    for (const surface of tenantBrandSurfaces) {
      for (const language of locales) {
        for (const brand of brandCases) {
          test(`${surface.name} ${language.locale} ${brand.name} visual snapshot`, async ({
            page,
          }) => {
            await page.goto(
              `${getBrandSurfaceOrigin(surface, brand)}/${language.locale}${surface.routeSuffix}`,
            );
            await settleBrandRender(page);
            await page.evaluate(() => document.fonts.ready);

            const horizontalOverflow = await page.evaluate(
              () =>
                document.documentElement.scrollWidth -
                document.documentElement.clientWidth,
            );
            expect(horizontalOverflow).toBeLessThanOrEqual(1);

            if (brand.name === "warm") {
              const colors = await page
                .locator(".wlbp-brand-shell")
                .evaluate((element) => {
                  const style = getComputedStyle(element);
                  return {
                    background: style.backgroundColor,
                    text: style.color,
                  };
                });
              expect(colors).toEqual({
                background: "rgb(247, 242, 232)",
                text: "rgb(32, 23, 15)",
              });
            }

            await expect(page).toHaveScreenshot(
              `${surface.name}-${language.locale}-${profile.name}-${brand.name}.png`,
              {
                fullPage: true,
                stylePath: visualStylePath,
              },
            );
          });
        }
      }
    }
  });
}
