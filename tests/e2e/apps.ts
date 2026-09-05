import type { Page } from "@playwright/test";

export const applicationOrigins = [
  { name: "client", origin: "http://localhost:41730" },
  { name: "dashboard", origin: "http://localhost:41731" },
  { name: "platform-admin", origin: "http://localhost:41732" },
] as const;

export const tenantApplications = [
  {
    name: "client",
    origin: "http://localhost:41730",
    headings: {
      en: "Book the right time, without the back-and-forth.",
      ar: "احجز الموعد المناسب دون مراسلات متكررة.",
    },
  },
  {
    name: "dashboard",
    origin: "http://localhost:41731",
    headings: {
      en: "Today stays clear, even when the schedule is full.",
      ar: "يبقى يومك واضحًا حتى عندما يمتلئ الجدول.",
    },
  },
] as const;

export const tenantBrandSurfaces = [
  {
    name: "client",
    origin: "http://localhost:41730",
    routeSuffix: "",
  },
  {
    name: "dashboard",
    origin: "http://localhost:41731",
    routeSuffix: "",
  },
  {
    name: "dashboard-brand-preview",
    origin: "http://localhost:41731",
    routeSuffix: "/brand-preview",
  },
] as const;

export const locales = [
  {
    locale: "en",
    direction: "ltr",
    languageNavigation: "Language",
    switchLanguage: "Arabic",
  },
  {
    locale: "ar",
    direction: "rtl",
    languageNavigation: "اللغة",
    switchLanguage: "الإنجليزية",
  },
] as const;

export const responsiveProfiles = [
  { name: "desktop", viewport: { height: 900, width: 1440 } },
  { name: "mobile", viewport: { height: 844, width: 390 } },
] as const;

export const brandCases = [{ name: "default" }, { name: "warm" }] as const;

export function getBrandSurfaceOrigin(
  surface: (typeof tenantBrandSurfaces)[number],
  brand: (typeof brandCases)[number],
) {
  if (brand.name === "default") return surface.origin;
  return surface.name === "client"
    ? "http://localhost:41733"
    : "http://localhost:41734";
}

export async function settleBrandRender(page: Page) {
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  });
}
