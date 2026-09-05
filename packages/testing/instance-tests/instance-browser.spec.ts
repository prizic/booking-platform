import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

const applications = [
  { name: "client", origin: "http://127.0.0.1:41730" },
  { name: "dashboard", origin: "http://127.0.0.1:41731" },
] as const;

const locales = [
  { direction: "ltr", locale: "en" },
  { direction: "rtl", locale: "ar" },
] as const;

for (const application of applications) {
  for (const language of locales) {
    test(`${application.name} ${language.locale} renders its semantic document @e2e`, async ({
      page,
    }) => {
      const runtimeErrors: string[] = [];
      page.on("pageerror", (error) => runtimeErrors.push(error.message));

      const response = await page.goto(`${application.origin}/${language.locale}`);

      expect(response?.ok()).toBe(true);
      await expect(page.locator("html")).toHaveAttribute("lang", language.locale);
      await expect(page.locator("html")).toHaveAttribute("dir", language.direction);
      await expect(page.getByRole("main")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(runtimeErrors).toEqual([]);
    });
  }

  test(`${application.name} exposes release identity @e2e`, async ({ request }) => {
    const response = await request.get(
      `${application.origin}/.well-known/platform-release`,
    );
    expect(response.ok()).toBe(true);
    const identity = (await response.json()) as Record<string, unknown>;
    expect(identity.application).toBe(application.name);
    expect(identity.backendContract).toEqual(
      expect.objectContaining({ min: expect.any(Number), max: expect.any(Number) }),
    );
  });
}

test("Client exposes recoverable form validation @component", async ({ page }) => {
  await page.goto(`${applications[0].origin}/en`);
  const form = page.getByRole("main").locator("form").first();
  const field = form.getByRole("textbox");
  const submit = form.getByRole("button");

  await expect(field).toHaveAccessibleName(/.+/u);
  await reachWithTab(page, field);
  await page.keyboard.press("Enter");
  const alert = form.getByRole("alert");
  await expect(alert).toBeFocused();
  await expect(field).toHaveAttribute("aria-invalid", "true");

  const errorLink = alert.getByRole("link");
  await page.keyboard.press("Tab");
  await expect(errorLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(field).toBeFocused();

  await field.fill("Test customer");
  await reachWithTab(page, submit);
  await page.keyboard.press("Enter");
  await expect(form.getByRole("status")).toBeVisible();
  await expect(field).not.toHaveAttribute("aria-invalid", "true");
});

test("Dashboard exposes its schedule list without drag interaction @component", async ({
  page,
}) => {
  await page.goto(`${applications[1].origin}/en`);
  const viewButtons = page.getByRole("main").locator("button[aria-pressed]");
  const schedule = page.getByRole("main").locator("ol[aria-label]");

  await expect(viewButtons).toHaveCount(2);
  await expect(schedule).toBeVisible();
  await expect(schedule.getByRole("listitem")).not.toHaveCount(0);
  await reachWithTab(page, viewButtons.nth(1));
  await page.keyboard.press("Enter");
  await expect(viewButtons.nth(1)).toHaveAttribute("aria-pressed", "true");
});

for (const application of applications) {
  test(`${application.name} exposes visible keyboard focus @component`, async ({
    page,
  }) => {
    await page.goto(`${application.origin}/en`);
    await page.keyboard.press("Tab");

    const focus = await page.evaluate(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return undefined;
      const style = getComputedStyle(active);
      return {
        focusVisible: active.matches(":focus-visible"),
        outlineStyle: style.outlineStyle,
        outlineWidth: Number.parseFloat(style.outlineWidth),
      };
    });

    expect(focus?.focusVisible).toBe(true);
    expect(focus?.outlineStyle).not.toBe("none");
    expect(focus?.outlineWidth).toBeGreaterThanOrEqual(2);
  });
}

for (const application of applications) {
  test(`${application.name} keeps English and Arabic distinct @i18n`, async ({
    page,
  }) => {
    await page.goto(`${application.origin}/en`);
    const english = await page.getByRole("main").innerText();
    await page.goto(`${application.origin}/ar`);
    const arabic = await page.getByRole("main").innerText();

    expect(english).toMatch(/[A-Za-z]/u);
    expect(arabic).toMatch(/[\u0600-\u06ff]/u);
    expect(arabic).toMatch(/[٠-٩]/u);
    expect(arabic).toContain("Asia/Riyadh");
    expect(arabic).not.toBe(english);
  });

  for (const language of locales) {
    test(`${application.name} ${language.locale} has no automated WCAG A or AA violations @a11y`, async ({
      page,
    }) => {
      await page.goto(`${application.origin}/${language.locale}`);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();

      expect(results.violations).toEqual([]);
    });

    test(`${application.name} ${language.locale} removes motion when requested @a11y`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(`${application.origin}/${language.locale}`);

      const animatedElements = await page
        .locator(".wlbp-brand-shell, .wlbp-brand-shell *")
        .evaluateAll((elements) =>
          elements.filter((element) => {
            const style = getComputedStyle(element);
            return [style.animationDuration, style.transitionDuration]
              .flatMap((value) => value.split(","))
              .some((value) => Number.parseFloat(value) > 0.001);
          }),
        );
      expect(animatedElements).toEqual([]);
    });
  }
}

const visualSurfaces = [
  ...applications.map((application) => ({
    name: application.name,
    origin: application.origin,
    route: "",
  })),
  {
    name: "dashboard-brand-preview",
    origin: applications[1].origin,
    route: "/brand-preview",
  },
] as const;

for (const profile of [
  { name: "desktop", viewport: { height: 900, width: 1440 } },
  { name: "mobile", viewport: { height: 844, width: 390 } },
] as const) {
  for (const surface of visualSurfaces) {
    for (const language of locales) {
      test(`${surface.name} ${language.locale} ${profile.name} captures visual evidence @visual`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize(profile.viewport);
        await page.goto(`${surface.origin}/${language.locale}${surface.route}`);
        await page.evaluate(() => document.fonts.ready);

        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(1);

        await testInfo.attach(`${surface.name}-${language.locale}-${profile.name}`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: "image/png",
        });
      });
    }
  }
}

async function reachWithTab(page: Page, target: Locator, limit = 20) {
  for (let attempt = 0; attempt < limit; attempt += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) {
      return;
    }
    await page.keyboard.press("Tab");
  }

  throw new Error("Keyboard focus did not reach the expected control");
}
