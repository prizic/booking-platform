import AxeBuilder from "@axe-core/playwright";
import { test, expect, ready, requireJourney } from "./journey-fixtures";
import {
  adminOrigin,
  signIn,
  signOut,
  revokeApiSessions,
} from "./platform-admin-fixtures";

test.skip(
  process.env.WLBP_JOURNEY_E2E !== "1",
  "Requires the isolated journey campaign",
);
test.beforeEach(() => {
  requireJourney();
  if (process.env.WLBP_JOURNEY_A11Y !== "1" || process.env.PLATFORM_ADMIN_E2E !== "1")
    throw new Error("Run the documented combined journey a11y server profile");
});
test.afterEach(async ({ page }) => {
  await signOut(page);
  await revokeApiSessions();
});
for (const locale of ["en", "ar"] as const)
  for (const theme of ["light", "dark"] as const)
    for (const width of [390, 1440]) {
      test(`R11 R16 Admin sidebar keyboard persistence axe reflow (${locale}, ${theme}, ${width})`, async ({
        page,
        context,
      }) => {
        test.setTimeout(180000);
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
        await context.addCookies([
          { name: "wlbp-theme", value: theme, url: adminOrigin },
        ]);
        await signIn(page, "viewer", locale);
        await page.goto(`${adminOrigin}/${locale}/tenants`);
        await ready(page);
        await expect(page.locator("html")).toHaveAttribute(
          "dir",
          locale === "ar" ? "rtl" : "ltr",
        );
        if (width === 1440) {
          const collapse = page.getByRole("button", {
            name: locale === "en" ? "Collapse sidebar" : "طي الشريط الجانبي",
            exact: true,
          });
          const expand = page.getByRole("button", {
            name: locale === "en" ? "Expand sidebar" : "توسيع الشريط الجانبي",
            exact: true,
          });
          await collapse.focus();
          await page.keyboard.press("Enter");
          await expect(expand).toBeFocused();
          await expect(expand).toHaveAttribute("aria-expanded", "false");
          await page.locator(`nav a[href="/${locale}/plans"]`).first().click();
          await ready(page);
          await expect(expand).toHaveAttribute("aria-expanded", "false");
          await page.reload();
          await ready(page);
          await expect(expand).toHaveAttribute("aria-expanded", "false");
          await expect(
            page.locator(`nav a[href="/${locale}/plans"]`).first(),
          ).toHaveAttribute("aria-current", "page");
        } else {
          const menu = page.getByRole("button", {
            name: locale === "en" ? "Menu" : "القائمة",
            exact: true,
          });
          await menu.focus();
          await page.keyboard.press("Enter");
          const sheet = page.getByRole("dialog");
          await expect(sheet).toBeVisible();
          await expect(sheet.locator(`a[href="/${locale}/plans"]`)).toBeVisible();
          await page.keyboard.press("Escape");
          await expect(sheet).toBeHidden();
          await expect(menu).toBeFocused();
          await menu.click();
          await sheet.locator(`a[href="/${locale}/plans"]`).click();
          await ready(page);
          await expect(sheet).toBeHidden();
        }
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze();
        expect(
          results.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            nodes: v.nodes.length,
          })),
        ).toEqual([]);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth + 1,
          ),
        ).toBe(true);
      });
    }
