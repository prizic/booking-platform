import type { TenantConfigurationV1 } from "../../_lib/dashboard-access";
export const settingsRoutes = [
  "/",
  "/book",
  "/manage",
  "/contact",
  "/privacy",
  "/terms",
  "/accessibility",
] as const;
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("invalid");
  return { ...(value as Record<string, unknown>) };
}
export interface NavigationItem {
  readonly rowKey: string;
  readonly label: { readonly en: string; readonly ar: string };
  readonly route?: string;
  readonly href?: string;
  readonly original?: Readonly<Record<string, unknown>>;
}
export function settingsNavigation(document: unknown): NavigationItem[] {
  const base = object(document);
  if (base.items === undefined) return [];
  if (!Array.isArray(base.items) || base.items.length > 50) throw new Error("invalid");
  return base.items.map((value, index) => {
    const row = object(value);
    const label = object(row.label);
    if (
      typeof label.en !== "string" ||
      typeof label.ar !== "string" ||
      (!row.route && !row.href)
    )
      throw new Error("invalid");
    return {
      rowKey: `existing-${index}`,
      label: { en: label.en, ar: label.ar },
      ...(typeof row.route === "string" ? { route: row.route } : {}),
      ...(typeof row.href === "string" ? { href: row.href } : {}),
      original: row,
    };
  });
}
export function mergeSettingsFields(base: TenantConfigurationV1, form: FormData) {
  const settings = object(base.settings),
    navigation = object(base.navigation),
    features = object(base.featureConfiguration);
  const value = (key: string) => String(form.get(key) ?? "").trim();
  for (const key of [
    "currency",
    "defaultLocale",
    "taxRateBps",
    "replyToEmail",
    "bookingHorizonDays",
  ]) {
    if (!form.has(key)) continue;
    const v = value(key);
    if (!v) {
      delete settings[key];
      continue;
    }
    if (key === "currency" && v !== "USD" && v !== base.settings.currency)
      throw new Error(key);
    if (key === "defaultLocale" && v !== "en" && v !== "ar") throw new Error(key);
    if (
      key === "replyToEmail" &&
      (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(v) || v.length > 254)
    )
      throw new Error(key);
    if (key === "taxRateBps" || key === "bookingHorizonDays") {
      const n = Number(v);
      if (
        !/^\d+$/u.test(v) ||
        !Number.isSafeInteger(n) ||
        n < (key === "taxRateBps" ? 0 : 1) ||
        n > (key === "taxRateBps" ? 3000 : 730)
      )
        throw new Error(key);
      settings[key] = n;
    } else settings[key] = v;
  }
  const count = Number(value("navigationCount"));
  if (!Number.isInteger(count) || count < 0 || count > 50)
    throw new Error("navigation");
  const old = settingsNavigation(base.navigation);
  navigation.items = Array.from({ length: count }, (_, index) => {
    const rowKey = value(`nav-${index}-key`);
    const prior = old.find((row) => row.rowKey === rowKey);
    const en = value(`nav-${index}-en`),
      ar = value(`nav-${index}-ar`),
      destination = value(`nav-${index}-destination`);
    if (
      !en ||
      !ar ||
      en.length > 160 ||
      ar.length > 160 ||
      !(
        settingsRoutes.includes(destination as (typeof settingsRoutes)[number]) ||
        /^https:\/\/[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:\/|$)/u.test(destination)
      ) ||
      /[<>]/u.test(destination) ||
      [...destination].some((c) => c.charCodeAt(0) < 32) ||
      destination.length > 2048
    )
      throw new Error("navigation");
    const original = { ...(prior?.original ?? {}) };
    delete original.route;
    delete original.href;
    return {
      ...original,
      label: { ...object(prior?.original?.label ?? {}), en, ar },
      ...(destination.startsWith("/") ? { route: destination } : { href: destination }),
    };
  });
  for (const key of Object.keys(base.entitlements)) {
    const current = object(features[key] ?? {});
    features[key] = {
      ...current,
      enabled: base.entitlements[key] === true && form.get(`feature-${key}`) === "yes",
    };
  }
  return { settings, navigation, featureConfiguration: features };
}
