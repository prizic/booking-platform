export const locales = ["en", "ar"] as const;

export type Locale = (typeof locales)[number];
export type Direction = "ltr" | "rtl";
export type MessageValues = Readonly<Record<string, string | number>>;
export type Messages = Readonly<Record<string, string>>;
export type Translator = (key: string, values?: MessageValues) => string;
export type PluralForms = Readonly<Partial<Record<Intl.LDMLPluralRule, string>>> & {
  readonly other: string;
};
export type ValidationMessage =
  | {
      readonly code: "required" | "invalidEmail" | "invalidDate" | "invalidTimeZone";
    }
  | {
      readonly code: "nonexistentLocalTime" | "ambiguousLocalTime";
      readonly timeZone: string;
    };
export type LocalDateTime = Readonly<{
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second?: number;
}>;
export type ZonedLocalDateTimeResolution =
  | { readonly kind: "gap"; readonly instants: readonly [] }
  | { readonly kind: "exact"; readonly instants: readonly [string] }
  | {
      readonly kind: "ambiguous";
      readonly instants: readonly [string, string];
    };

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

const validationMessages = {
  en: {
    "validation.required": "This field is required.",
    "validation.invalidEmail": "Enter a valid email address.",
    "validation.invalidDate": "Enter a valid date.",
    "validation.invalidTimeZone": "Choose a valid timezone.",
    "validation.nonexistentLocalTime":
      "This time does not exist in {timeZone} because the clock moves forward. Choose another time.",
    "validation.ambiguousLocalTime":
      "This time occurs twice in {timeZone}. Choose the first or second occurrence.",
  },
  ar: {
    "validation.required": "هذا الحقل مطلوب.",
    "validation.invalidEmail": "أدخل عنوان بريد إلكتروني صالحًا.",
    "validation.invalidDate": "أدخل تاريخًا صالحًا.",
    "validation.invalidTimeZone": "اختر منطقة زمنية صالحة.",
    "validation.nonexistentLocalTime":
      "هذا الوقت غير موجود في {timeZone} بسبب تقديم الساعة. اختر وقتًا آخر.",
    "validation.ambiguousLocalTime":
      "يتكرر هذا الوقت مرتين في {timeZone}. اختر المرة الأولى أو الثانية.",
  },
} as const satisfies Record<Locale, Messages>;

function getIntlLocale(locale: Locale): string {
  return locale === "ar" ? "ar-u-nu-arab" : "en";
}

const explicitInstantOffset = /(?:Z|[+-]\d{2}:\d{2})$/u;
const millisecondsPerDay = 24 * 60 * 60 * 1_000;

type CompleteLocalDateTime = Required<LocalDateTime>;

function localDateTimeToUtcMilliseconds(localDateTime: CompleteLocalDateTime): number {
  const date = new Date(0);
  date.setUTCFullYear(localDateTime.year, localDateTime.month - 1, localDateTime.day);
  date.setUTCHours(localDateTime.hour, localDateTime.minute, localDateTime.second, 0);
  return date.valueOf();
}

function validateLocalDateTime(localDateTime: LocalDateTime): CompleteLocalDateTime {
  const complete = { ...localDateTime, second: localDateTime.second ?? 0 };
  const values = Object.values(complete);

  if (values.some((value) => !Number.isSafeInteger(value))) {
    throw new RangeError("Expected integer local date and time fields");
  }

  if (
    complete.year < 1 ||
    complete.year > 9999 ||
    complete.month < 1 ||
    complete.month > 12 ||
    complete.day < 1 ||
    complete.day > 31 ||
    complete.hour < 0 ||
    complete.hour > 23 ||
    complete.minute < 0 ||
    complete.minute > 59 ||
    complete.second < 0 ||
    complete.second > 59
  ) {
    throw new RangeError("Expected a valid local date and time");
  }

  const roundTrip = new Date(localDateTimeToUtcMilliseconds(complete));
  if (
    roundTrip.getUTCFullYear() !== complete.year ||
    roundTrip.getUTCMonth() + 1 !== complete.month ||
    roundTrip.getUTCDate() !== complete.day ||
    roundTrip.getUTCHours() !== complete.hour ||
    roundTrip.getUTCMinutes() !== complete.minute ||
    roundTrip.getUTCSeconds() !== complete.second
  ) {
    throw new RangeError("Expected a valid local date and time");
  }

  return complete;
}

function getZonedLocalDateTime(
  instantMilliseconds: number,
  timeZone: string,
): CompleteLocalDateTime {
  const parts = new Intl.DateTimeFormat("en-CA-u-ca-gregory-nu-latn", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(instantMilliseconds);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const read = (name: Intl.DateTimeFormatPartTypes): number => {
    const value = values.get(name);
    if (value === undefined) {
      throw new RangeError(`Unable to read timezone ${name}`);
    }
    return Number(value);
  };

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

function localDateTimesMatch(
  left: CompleteLocalDateTime,
  right: CompleteLocalDateTime,
): boolean {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute &&
    left.second === right.second
  );
}

function parseInstant(instant: Date | number | string): Date {
  if (typeof instant === "string" && !explicitInstantOffset.test(instant)) {
    throw new RangeError("Expected an instant with an explicit UTC offset");
  }

  const date =
    instant instanceof Date ? new Date(instant.valueOf()) : new Date(instant);
  if (Number.isNaN(date.valueOf())) {
    throw new RangeError("Expected a valid instant");
  }

  return date;
}

export function isolateBidi(value: string | number): string {
  return `\u2068${String(value)}\u2069`;
}

export function canonicalizeTimeZone(timeZone: string): string {
  if (
    timeZone.trim() !== timeZone ||
    timeZone.length === 0 ||
    /^[+-]\d{2}:\d{2}$/u.test(timeZone)
  ) {
    throw new RangeError("Expected a valid IANA timezone identifier");
  }

  try {
    return new Intl.DateTimeFormat("en", { timeZone }).resolvedOptions().timeZone;
  } catch {
    throw new RangeError("Expected a valid IANA timezone identifier");
  }
}

export function formatTimeZone(
  instant: Date | number | string,
  locale: Locale,
  timeZone: string,
): string {
  const date = parseInstant(instant);
  const canonicalTimeZone = canonicalizeTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat(getIntlLocale(locale), {
    timeZone: canonicalTimeZone,
    timeZoneName: "longOffset",
  }).formatToParts(date);
  const offset = parts.find((part) => part.type === "timeZoneName")?.value;

  if (offset === undefined) {
    throw new RangeError("Unable to format the IANA timezone offset");
  }

  return `${offset} (${isolateBidi(canonicalTimeZone)})`;
}

export function resolveZonedLocalDateTime(
  localDateTime: LocalDateTime,
  timeZone: string,
): ZonedLocalDateTimeResolution {
  const expected = validateLocalDateTime(localDateTime);
  const canonicalTimeZone = canonicalizeTimeZone(timeZone);
  const localMilliseconds = localDateTimeToUtcMilliseconds(expected);
  const candidateOffsets = new Set<number>();

  for (const dayOffset of [-2, -1, 0, 1, 2]) {
    const sampleInstant = localMilliseconds + dayOffset * millisecondsPerDay;
    const zonedSample = getZonedLocalDateTime(sampleInstant, canonicalTimeZone);
    candidateOffsets.add(localDateTimeToUtcMilliseconds(zonedSample) - sampleInstant);
  }

  const instants = [...candidateOffsets]
    .map((offset) => localMilliseconds - offset)
    .filter((instant) =>
      localDateTimesMatch(getZonedLocalDateTime(instant, canonicalTimeZone), expected),
    )
    .filter((instant, index, all) => all.indexOf(instant) === index)
    .sort((left, right) => left - right)
    .map((instant) => new Date(instant).toISOString());

  if (instants.length === 0) {
    return { kind: "gap", instants: [] };
  }
  if (instants.length === 1) {
    return { kind: "exact", instants: [instants[0]!] };
  }
  if (instants.length === 2) {
    return { kind: "ambiguous", instants: [instants[0]!, instants[1]!] };
  }

  throw new RangeError("A local time resolved to more than two instants");
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && locales.some((locale) => locale === value);
}

export function getDirection(locale: Locale): Direction {
  return locale === "ar" ? "rtl" : "ltr";
}

export function assertMessageParity(
  catalogs: Readonly<Record<Locale, Messages>>,
): void {
  const englishKeys = new Set(Object.keys(catalogs.en));
  const arabicKeys = new Set(Object.keys(catalogs.ar));
  const englishMissing = [...arabicKeys].filter((key) => !englishKeys.has(key)).sort();
  const arabicMissing = [...englishKeys].filter((key) => !arabicKeys.has(key)).sort();
  const gaps = [
    englishMissing.length > 0 ? `en missing [${englishMissing.join(", ")}]` : "",
    arabicMissing.length > 0 ? `ar missing [${arabicMissing.join(", ")}]` : "",
  ].filter(Boolean);

  if (gaps.length > 0) {
    throw new Error(`Message catalogs do not have locale parity: ${gaps.join("; ")}`);
  }
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

    return message.replaceAll(
      /\{([a-zA-Z][a-zA-Z0-9_]*)\}/g,
      (_token, name: string) => {
        if (!Object.hasOwn(values, name)) {
          throw new Error(`Missing ${locale} message value: ${name}`);
        }

        return String(values[name]);
      },
    );
  };
}

export function formatValidationMessage(
  validation: ValidationMessage,
  locale: Locale,
): string {
  const translate = createTranslator(locale, validationMessages[locale]);

  switch (validation.code) {
    case "nonexistentLocalTime":
    case "ambiguousLocalTime": {
      const timeZone = canonicalizeTimeZone(validation.timeZone);
      return translate(`validation.${validation.code}`, {
        timeZone: isolateBidi(timeZone),
      });
    }
    default:
      return translate(`validation.${validation.code}`);
  }
}

export function formatNumber(
  value: number,
  locale: Locale,
  options: Intl.NumberFormatOptions = {},
): string {
  return new Intl.NumberFormat(getIntlLocale(locale), options).format(value);
}

export function formatPlural(
  value: number,
  locale: Locale,
  forms: PluralForms,
): string {
  if (!Number.isFinite(value)) {
    throw new RangeError("Expected a finite plural value");
  }

  const category = new Intl.PluralRules(getIntlLocale(locale)).select(value);
  const message = forms[category] ?? forms.other;
  return createTranslator(locale, { plural: message })("plural", {
    count: formatNumber(value, locale),
  });
}

export function formatDate(
  instant: Date | number | string,
  locale: Locale,
  timeZone: string,
): string {
  return new Intl.DateTimeFormat(getIntlLocale(locale), {
    dateStyle: "medium",
    timeZone: canonicalizeTimeZone(timeZone),
  }).format(parseInstant(instant));
}

export function formatTime(
  instant: Date | number | string,
  locale: Locale,
  timeZone: string,
): string {
  const date = parseInstant(instant);
  const canonicalTimeZone = canonicalizeTimeZone(timeZone);

  const time = new Intl.DateTimeFormat(getIntlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: canonicalTimeZone,
  }).format(date);

  return `${time} ${formatTimeZone(date, locale, canonicalTimeZone)}`;
}

export function formatDateTime(
  instant: Date | number | string,
  locale: Locale,
  timeZone: string,
): string {
  const date = parseInstant(instant);
  const canonicalTimeZone = canonicalizeTimeZone(timeZone);

  const dateTime = new Intl.DateTimeFormat(getIntlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: canonicalTimeZone,
  }).format(date);

  return `${dateTime} ${formatTimeZone(date, locale, canonicalTimeZone)}`;
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
