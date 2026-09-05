import { expect, test } from "@playwright/test";
import { locales, tenantApplications } from "./apps";

for (const application of tenantApplications) {
  test(`${application.name} keeps English and Arabic copy distinct and complete`, async ({
    page,
  }) => {
    const visibleText: Record<(typeof locales)[number]["locale"], string> = {
      en: "",
      ar: "",
    };

    for (const language of locales) {
      await page.goto(`${application.origin}/${language.locale}`);
      visibleText[language.locale] = await page.getByRole("main").innerText();
      expect(visibleText[language.locale]).toContain(
        application.headings[language.locale],
      );
    }

    expect(visibleText.en).not.toBe(visibleText.ar);
    expect(visibleText.en).toMatch(/[A-Za-z]/u);
    expect(visibleText.ar).toMatch(/[\u0600-\u06ff]/u);
    expect(visibleText.ar).not.toContain(application.headings.en);
  });
}

test("Client localizes appointment, currency, and digits while retaining the IANA zone", async ({
  page,
}) => {
  await page.goto("http://localhost:41730/ar");

  const main = await page.getByRole("main").innerText();
  expect(main).toContain("Asia/Riyadh");
  expect(main).toMatch(/[٠-٩]/u);
  expect(main).toContain("ر.س");
});

test("Dashboard localizes its fail-closed private state", async ({ page }) => {
  await page.goto("http://localhost:41731/ar");

  const main = await page.getByRole("main").innerText();
  expect(main).toContain("إعداد مساحة العمل غير متاح");
  expect(main).toContain("تظل مساحة العمل الخاصة مغلقة");
  expect(main).not.toContain("Asia/Riyadh");
  expect(page.getByRole("list")).toHaveCount(0);
});
