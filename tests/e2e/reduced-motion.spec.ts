import { expect, test } from "@playwright/test";
import { locales, tenantApplications } from "./apps";

for (const application of tenantApplications) {
  for (const language of locales) {
    test(`${application.name} ${language.locale} removes authored motion when reduced motion is requested`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(`${application.origin}/${language.locale}`);

      const animatedElements = await page
        .locator(".wlbp-brand-shell, .wlbp-brand-shell *")
        .evaluateAll((elements) =>
          elements.flatMap((element) => {
            const style = getComputedStyle(element);
            const hasDuration = [style.animationDuration, style.transitionDuration]
              .flatMap((value) => value.split(","))
              .some((value) => Number.parseFloat(value) > 0.001);

            return hasDuration
              ? [
                  {
                    animationDuration: style.animationDuration,
                    element: element.tagName.toLowerCase(),
                    transitionDuration: style.transitionDuration,
                  },
                ]
              : [];
          }),
        );

      expect(animatedElements).toEqual([]);
      expect(
        await page
          .locator("html")
          .evaluate((element) => getComputedStyle(element).scrollBehavior),
      ).not.toBe("smooth");
    });
  }
}
