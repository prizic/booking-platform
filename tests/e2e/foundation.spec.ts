import { expect, test, type Page } from "@playwright/test";
import { locales, responsiveProfiles, tenantApplications } from "./apps";

for (const profile of responsiveProfiles) {
  test.describe(`${profile.name} semantic layout`, () => {
    test.use({ viewport: profile.viewport });

    for (const application of tenantApplications) {
      for (const language of locales) {
        test(`${application.name} renders a complete ${language.locale} document`, async ({
          page,
        }) => {
          const runtimeErrors: string[] = [];
          page.on("pageerror", (error) => runtimeErrors.push(error.message));

          const response = await page.goto(`${application.origin}/${language.locale}`);

          expect(response?.ok()).toBe(true);
          await expect(page.locator("html")).toHaveAttribute("lang", language.locale);
          await expect(page.locator("html")).toHaveAttribute("dir", language.direction);
          await expect(
            page.getByRole("heading", {
              level: 1,
              name: application.headings[language.locale],
            }),
          ).toBeVisible();
          await expect(
            page.getByRole("navigation", {
              name: language.languageNavigation,
            }),
          ).toBeVisible();
          await expect(
            page.getByRole("link", { name: language.switchLanguage }),
          ).toHaveAttribute("href", language.locale === "en" ? "/ar" : "/en");

          const horizontalOverflow = await page.evaluate(
            () =>
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          );
          expect(horizontalOverflow).toBeLessThanOrEqual(1);
          expect(runtimeErrors).toEqual([]);
        });
      }
    }
  });
}

for (const application of tenantApplications) {
  test(`${application.name} desktop composition follows document direction`, async ({
    page,
  }) => {
    await page.setViewportSize({ height: 900, width: 1440 });

    await page.goto(`${application.origin}/en`);
    const englishBoxes = await getCompositionBoxes(page, application.name);

    await page.goto(`${application.origin}/ar`);
    const arabicBoxes = await getCompositionBoxes(page, application.name);

    expect(englishBoxes.leading.x).toBeLessThan(englishBoxes.trailing.x);
    expect(arabicBoxes.leading.x).toBeGreaterThan(arabicBoxes.trailing.x);
  });
}

for (const application of tenantApplications) {
  for (const language of locales) {
    test(`${application.name} ${language.locale} reflows at a 200 percent zoom equivalent`, async ({
      page,
    }) => {
      await page.setViewportSize({ height: 900, width: 640 });
      await page.goto(`${application.origin}/${language.locale}`);

      await expect(page.getByRole("main")).toBeVisible();
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(1);
    });

    test(`${application.name} ${language.locale} contains long names and copy without horizontal clipping`, async ({
      page,
    }) => {
      await page.setViewportSize({ height: 844, width: 390 });
      await page.goto(`${application.origin}/${language.locale}`);

      const longCopy =
        language.locale === "ar"
          ? "اسم منشأة طويل للاختبار المتجاوب ومحتوى تفصيلي يظل مقروءًا دون اقتطاع أو تمرير أفقي غير مقصود ".repeat(
              3,
            )
          : "A deliberately long organization name and detailed responsive message that remains readable without clipping or unintended horizontal scrolling ".repeat(
              3,
            );
      await page.getByRole("heading", { level: 1 }).evaluate((heading, value) => {
        heading.textContent = value;
      }, longCopy);

      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(1);
      await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
    });
  }
}

async function getCompositionBoxes(
  page: Page,
  application: (typeof tenantApplications)[number]["name"],
) {
  const leading =
    application === "client"
      ? page.locator(".client-intro")
      : page.locator(".dashboard-sidebar");
  const trailing =
    application === "client"
      ? page.locator(".booking-preview")
      : page.locator(".dashboard-main");
  const [leadingBox, trailingBox] = await Promise.all([
    leading.boundingBox(),
    trailing.boundingBox(),
  ]);

  expect(leadingBox).not.toBeNull();
  expect(trailingBox).not.toBeNull();

  return {
    leading: leadingBox!,
    trailing: trailingBox!,
  };
}
