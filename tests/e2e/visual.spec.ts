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
              // Brand tokens ship as validated `--brand-*` custom properties
              // on <html> (createBrandStyle in both tenant layouts); the
              // shared theme bridge paints them onto <html>/<body>
              // (bg-background/text-foreground in
              // @wlbp/ui-foundation theme.css). Assert both layers so the
              // check proves the warm fixture is actually rendered, not just
              // parsed. page.evaluate fails fast; the removed
              // `.wlbp-brand-shell` locator hung the suite for 60s per warm
              // test instead.
              const applied = await page.evaluate(() => {
                const rootStyle = getComputedStyle(document.documentElement);
                const bodyStyle = getComputedStyle(document.body);
                return {
                  tokenBackground: rootStyle
                    .getPropertyValue("--brand-color-background")
                    .trim(),
                  tokenText: rootStyle.getPropertyValue("--brand-color-text").trim(),
                  background: bodyStyle.backgroundColor,
                  text: bodyStyle.color,
                };
              });
              expect(applied).toEqual({
                tokenBackground: "#f7f2e8",
                tokenText: "#20170f",
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
