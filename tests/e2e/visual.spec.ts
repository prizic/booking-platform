import { expect, test } from "@playwright/test";
import { applicationOrigins, locales } from "./apps";

for (const application of applicationOrigins) {
  for (const language of locales) {
    test(`${application.name} ${language.locale} visual evidence`, async ({
      page,
    }, testInfo) => {
      await page.goto(`${application.origin}/${language.locale}`);

      const documentWidth = await page.evaluate(
        () => document.documentElement.scrollWidth,
      );
      const viewportWidth = page.viewportSize()?.width;
      expect(viewportWidth).toBeDefined();
      expect(documentWidth).toBeLessThanOrEqual(viewportWidth ?? 0);

      const screenshot = await page.screenshot({
        animations: "disabled",
        fullPage: true,
      });
      expect(screenshot.byteLength).toBeGreaterThan(0);
      await testInfo.attach(`${application.name}-${language.locale}`, {
        body: screenshot,
        contentType: "image/png",
      });
    });
  }
}
