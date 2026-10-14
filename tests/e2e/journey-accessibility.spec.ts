import AxeBuilder from "@axe-core/playwright";
import { test, expect, journey, requireJourney } from "./journey-fixtures";
import { completionOrigin, signInCompletion } from "./dashboard-completion-fixtures";

test.skip(
  process.env.WLBP_JOURNEY_E2E !== "1",
  "Requires the documented isolated journey campaign",
);
test.beforeEach(requireJourney);
for (const locale of ["en", "ar"] as const)
  for (const theme of ["light", "dark"] as const)
    for (const width of [390, 1440]) {
      test(`R2 R3 R10 R11 keyboard axe reflow (${locale}, ${theme}, ${width})`, async ({
        page,
        context,
      }) => {
        test.setTimeout(180000);
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
        await context.addCookies([
          { name: "wlbp-theme", value: theme, url: journey.client },
          { name: "wlbp-theme", value: theme, url: completionOrigin },
        ]);
        for (const route of ["contact", "about", "find-booking"]) {
          await page.goto(`${journey.client}/${locale}/${route}`);
          await expect(page.locator("html")).toHaveAttribute(
            "dir",
            locale === "ar" ? "rtl" : "ltr",
          );
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
          await page.keyboard.press("Tab");
          const focused = page.locator(":focus");
          await expect(focused).toHaveCount(1);
          expect(
            await focused.evaluate((el) => {
              const s = getComputedStyle(el);
              return (
                s.outlineStyle !== "none" ||
                s.boxShadow !== "none" ||
                s.textDecorationLine.includes("underline")
              );
            }),
          ).toBe(true);
        }
        await signInCompletion(page, "admin", locale);
        await expect(
          page.getByRole("main").getByText("JRNY136ABC", { exact: true }).first(),
        ).toBeVisible();
        if (width > 1000) {
          const collapse = page.getByRole("button", {
            name:
              locale === "en"
                ? /Collapse (?:navigation|sidebar)/u
                : /طي.*(?:التنقل|القائمة)/u,
          });
          await collapse.focus();
          await page.keyboard.press("Enter");
          await expect(
            page.getByRole("button", {
              name:
                locale === "en"
                  ? /Expand (?:navigation|sidebar)/u
                  : /توسيع.*(?:التنقل|القائمة)/u,
            }),
          ).toBeFocused();
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
