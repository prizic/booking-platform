import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { applicationOrigins, locales } from "./apps";

for (const application of applicationOrigins) {
  for (const language of locales) {
    test(`${application.name} ${language.locale} has no automated WCAG A/AA violations`, async ({
      page,
    }) => {
      await page.goto(`${application.origin}/${language.locale}`);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();

      expect(results.violations).toEqual([]);
    });
  }
}
