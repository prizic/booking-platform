/*
 * Reads the stored settings documents into editor rows and merges validated
 * editor values back without losing anything the editor does not represent.
 * Validation of the editor's input lives in settings-schema.ts.
 */
import type { TenantConfigurationV1 } from "../../_lib/dashboard-access";
import type { SettingsValues } from "./settings-schema";

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

/** A value the stored configuration refuses even though its shape is valid. */
export class SettingsFieldError extends Error {
  constructor(readonly field: string) {
    super(field);
  }
}

export function mergeSettings(base: TenantConfigurationV1, values: SettingsValues) {
  const settings = object(base.settings),
    navigation = object(base.navigation),
    features = object(base.featureConfiguration);
  const preferences = {
    currency: values.currency,
    defaultLocale: values.defaultLocale,
    taxRateBps: values.taxRateBps,
    replyToEmail: values.replyToEmail,
    bookingHorizonDays: values.bookingHorizonDays,
  };
  for (const [key, value] of Object.entries(preferences)) {
    if (value === "") {
      delete settings[key];
      continue;
    }
    if (key === "currency" && value !== "USD" && value !== base.settings.currency)
      throw new SettingsFieldError(key);
    settings[key] =
      key === "taxRateBps" || key === "bookingHorizonDays" ? Number(value) : value;
  }
  const old = settingsNavigation(base.navigation);
  navigation.items = values.navigation.map((row) => {
    const prior = old.find((candidate) => candidate.rowKey === row.rowKey);
    const original = { ...(prior?.original ?? {}) };
    delete original.route;
    delete original.href;
    return {
      ...original,
      label: { ...object(prior?.original?.label ?? {}), en: row.en, ar: row.ar },
      ...(row.destination.startsWith("/")
        ? { route: row.destination }
        : { href: row.destination }),
    };
  });
  for (const key of Object.keys(base.entitlements)) {
    const current = object(features[key] ?? {});
    // Runtime entitlements from the control plane win over the request.
    features[key] = {
      ...current,
      enabled:
        base.entitlements[key] === true &&
        values.features.some((feature) => feature.key === key && feature.enabled),
    };
  }
  return { settings, navigation, featureConfiguration: features };
}
