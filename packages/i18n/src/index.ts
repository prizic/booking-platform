export const locales = ["en", "ar"] as const;

export type Locale = (typeof locales)[number];
export type Direction = "ltr" | "rtl";
export type MessageValues = Readonly<Record<string, string | number>>;
export type Messages = Readonly<Record<string, string>>;
export type Translator = (key: string, values?: MessageValues) => string;

const coreMessages = {
  en: {
    "identity.client.eyebrow": "Public booking",
    "identity.client.title": "Client",
    "identity.client.description": "The customer-facing booking experience.",
    "identity.dashboard.eyebrow": "Tenant workspace",
    "identity.dashboard.title": "Dashboard",
    "identity.dashboard.description": "The operational workspace for tenant staff.",
    "identity.platformAdmin.eyebrow": "Private control plane",
    "identity.platformAdmin.title": "Platform Admin",
    "identity.platformAdmin.description":
      "The private workspace for platform operators.",
    "identity.status": "Bootstrap ready",
    "identity.localeLabel": "العربية",
  },
  ar: {
    "identity.client.eyebrow": "الحجز العام",
    "identity.client.title": "واجهة العميل",
    "identity.client.description": "تجربة الحجز المخصصة للعملاء.",
    "identity.dashboard.eyebrow": "مساحة عمل المنشأة",
    "identity.dashboard.title": "لوحة التحكم",
    "identity.dashboard.description": "مساحة التشغيل الخاصة بفريق المنشأة.",
    "identity.platformAdmin.eyebrow": "منظومة التحكم الخاصة",
    "identity.platformAdmin.title": "إدارة المنصة",
    "identity.platformAdmin.description": "مساحة خاصة لمشغلي المنصة.",
    "identity.status": "التهيئة جاهزة",
    "identity.localeLabel": "English",
  },
} as const satisfies Record<Locale, Messages>;

function getIntlLocale(locale: Locale): string {
  return locale === "ar" ? "ar-u-nu-arab" : "en";
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && locales.some((locale) => locale === value);
}

export function getDirection(locale: Locale): Direction {
  return locale === "ar" ? "rtl" : "ltr";
}

export function createTranslator(
  locale: Locale,
  messages: Messages = coreMessages[locale],
): Translator {
  return (key, values = {}) => {
    const message = messages[key];

    if (message === undefined) {
      throw new Error(`Missing ${locale} message: ${key}`);
    }

    return message.replaceAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (token, name: string) =>
      Object.hasOwn(values, name) ? String(values[name]) : token,
    );
  };
}

export function formatNumber(
  value: number,
  locale: Locale,
  options: Intl.NumberFormatOptions = {},
): string {
  return new Intl.NumberFormat(getIntlLocale(locale), options).format(value);
}

export function formatTime(
  instant: Date | number | string,
  locale: Locale,
  timeZone: string,
): string {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.valueOf())) {
    throw new RangeError("Expected a valid instant");
  }

  return new Intl.DateTimeFormat(getIntlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(date);
}

export function formatDateTime(
  instant: Date | number | string,
  locale: Locale,
  timeZone: string,
): string {
  const date = instant instanceof Date ? instant : new Date(instant);

  if (Number.isNaN(date.valueOf())) {
    throw new RangeError("Expected a valid instant");
  }

  return new Intl.DateTimeFormat(getIntlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
    timeZoneName: "short",
  }).format(date);
}

export function formatCurrency(
  minorUnits: number,
  currency: string,
  locale: Locale,
): string {
  if (!Number.isSafeInteger(minorUnits)) {
    throw new RangeError("Money must be a safe integer count of minor units");
  }

  const formatter = new Intl.NumberFormat(getIntlLocale(locale), {
    currency,
    style: "currency",
  });
  const exponent = formatter.resolvedOptions().maximumFractionDigits ?? 0;

  return formatter.format(minorUnits / 10 ** exponent);
}
