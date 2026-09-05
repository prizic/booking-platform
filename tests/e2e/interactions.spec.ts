import { expect, test, type Locator, type Page } from "@playwright/test";
import { brandCases, getBrandSurfaceOrigin, locales, responsiveProfiles } from "./apps";

const clientCopy = {
  en: {
    alert: "We could not review your booking",
    field: "Your name",
    name: "Maha",
    required: "Enter your name to continue.",
    status: "Booking preview ready for Maha.",
    submit: "Review booking",
  },
  ar: {
    alert: "تعذّرت مراجعة حجزك",
    field: "اسمك",
    name: "مها",
    required: "أدخل اسمك للمتابعة.",
    status: "معاينة الحجز جاهزة باسم مها.",
    submit: "مراجعة الحجز",
  },
} as const;

const dashboardCopy = {
  en: {
    grid: "Grid view",
    list: "List view",
    listAlternative: "Accessible schedule list",
    listStatus: "Schedule shown as an accessible list.",
    timeZone: "Time zone: Asia/Riyadh",
  },
  ar: {
    grid: "عرض شبكي",
    list: "عرض كقائمة",
    listAlternative: "قائمة الجدول الميسّرة",
    listStatus: "يُعرض الجدول في قائمة ميسّرة.",
    timeZone: "المنطقة الزمنية: Asia/Riyadh",
  },
} as const;

for (const profile of responsiveProfiles) {
  test.describe(`${profile.name} keyboard behavior`, () => {
    test.use({ viewport: profile.viewport });

    for (const language of locales) {
      test(`Client ${language.locale} announces and recovers from a validation error`, async ({
        page,
      }) => {
        const copy = clientCopy[language.locale];
        await page.goto(`http://localhost:41730/${language.locale}`);

        const field = page.getByRole("textbox", { name: copy.field });
        const submit = page.getByRole("button", { name: copy.submit });
        await reachWithTab(page, field);
        await page.keyboard.press("Enter");

        const errorLink = page.getByRole("link", { name: copy.required });
        const alert = page.getByRole("alert").filter({ has: errorLink });
        await expect(alert).toContainText(copy.alert);
        await expect(alert).toContainText(copy.required);
        await expect(alert).toBeFocused();
        await expect(field).toHaveAttribute("aria-invalid", "true");
        await expect(field).toHaveAccessibleDescription(
          new RegExp(copy.required.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"),
        );

        await page.keyboard.press("Tab");
        await expect(errorLink).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(field).toBeFocused();

        await field.fill(copy.name);
        await reachWithTab(page, submit);
        await page.keyboard.press("Enter");

        const status = page.getByRole("status");
        await expect(status).toHaveText(copy.status);
        await expect(status).toHaveAttribute("aria-live", "polite");
        await expect(status).toHaveAttribute("aria-atomic", "true");
        await expect(field).not.toHaveAttribute("aria-invalid", "true");
      });

      test(`Dashboard ${language.locale} exposes a keyboard list alternative`, async ({
        page,
      }) => {
        const copy = dashboardCopy[language.locale];
        await page.goto(`http://localhost:41731/${language.locale}`);

        const gridButton = page.getByRole("button", { name: copy.grid });
        const listButton = page.getByRole("button", { name: copy.list });
        const scheduleList = page.getByRole("list", {
          name: copy.listAlternative,
        });

        await expect(scheduleList).toBeVisible();
        await expect(scheduleList.getByRole("listitem")).toHaveCount(2);
        await expect(gridButton).toHaveAttribute("aria-pressed", "true");
        await expect(listButton).toHaveAttribute("aria-pressed", "false");
        await expect(listButton).toHaveAttribute(
          "aria-controls",
          await scheduleList.getAttribute("id"),
        );
        await expect(page.getByText(copy.timeZone, { exact: true })).toBeVisible();

        await reachWithTab(page, listButton);
        await page.keyboard.press("Enter");

        await expect(listButton).toHaveAttribute("aria-pressed", "true");
        await expect(gridButton).toHaveAttribute("aria-pressed", "false");
        await expect(page.getByRole("status")).toHaveText(copy.listStatus);
        await expect(scheduleList).toBeVisible();
      });
    }
  });
}

for (const application of [
  { name: "Client", origin: "http://localhost:41730" },
  { name: "Dashboard", origin: "http://localhost:41731" },
] as const) {
  test(`${application.name} exposes a visible keyboard focus indicator`, async ({
    page,
  }) => {
    await page.goto(`${application.origin}/en`);
    await page.keyboard.press("Tab");

    const focusEvidence = await page.evaluate(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return undefined;
      const style = getComputedStyle(active);

      return {
        focusVisible: active.matches(":focus-visible"),
        outlineStyle: style.outlineStyle,
        outlineWidth: Number.parseFloat(style.outlineWidth),
      };
    });

    expect(focusEvidence).toBeDefined();
    expect(focusEvidence?.focusVisible).toBe(true);
    expect(focusEvidence?.outlineStyle).not.toBe("none");
    expect(focusEvidence?.outlineWidth).toBeGreaterThanOrEqual(2);
  });
}

for (const language of locales) {
  for (const brand of brandCases) {
    test(`Dashboard desktop sidebar ${language.locale} ${brand.name} focus indicators meet non-text contrast`, async ({
      page,
    }) => {
      await page.setViewportSize({ height: 900, width: 1440 });
      await page.goto(
        `${getBrandSurfaceOrigin(
          { name: "dashboard", origin: "http://localhost:41731", routeSuffix: "" },
          brand,
        )}/${language.locale}`,
      );

      const sidebarControls = page.locator(
        ".dashboard-sidebar :is(a, button:not(:disabled))",
      );
      const controlCount = await sidebarControls.count();
      expect(controlCount).toBeGreaterThan(0);

      for (let index = 0; index < controlCount; index += 1) {
        const control = sidebarControls.nth(index);
        await reachWithTab(page, control);

        const evidence = await control.evaluate((element) => {
          const sidebar = element.closest(".dashboard-sidebar");
          if (!(sidebar instanceof HTMLElement)) return undefined;

          const controlStyle = getComputedStyle(element);
          return {
            backgroundColor: getComputedStyle(sidebar).backgroundColor,
            focusVisible: element.matches(":focus-visible"),
            outlineColor: controlStyle.outlineColor,
            outlineWidth: Number.parseFloat(controlStyle.outlineWidth),
          };
        });

        expect(evidence).toBeDefined();
        expect(evidence?.focusVisible).toBe(true);
        expect(evidence?.outlineWidth).toBeGreaterThanOrEqual(2);
        expect(
          contrastRatio(evidence!.outlineColor, evidence!.backgroundColor),
        ).toBeGreaterThanOrEqual(3);
      }
    });
  }
}

async function reachWithTab(page: Page, target: Locator, limit = 20) {
  for (let attempt = 0; attempt < limit; attempt += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }

  throw new Error(
    `Keyboard focus did not reach ${await target.evaluate((element) => element.outerHTML)}`,
  );
}

function contrastRatio(first: string, second: string) {
  const [red, green, blue, alpha] = parseComputedColor(first);
  const background = parseComputedColor(second);
  const renderedFocus = [red, green, blue].map(
    (channel, index) => channel * alpha + background[index] * (1 - alpha),
  );
  const [lighter, darker] = [
    relativeLuminance(renderedFocus),
    relativeLuminance(background),
  ].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

function parseComputedColor(color: string) {
  const channels = color
    .match(/[\d.]+/gu)
    ?.slice(0, 4)
    .map(Number);
  if (!channels || channels.length < 3) {
    throw new Error(`Expected a computed RGB color, received ${color}`);
  }

  return [channels[0], channels[1], channels[2], channels[3] ?? 1] as const;
}

function relativeLuminance(channels: readonly number[]) {
  const [red, green, blue] = channels.slice(0, 3).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}
