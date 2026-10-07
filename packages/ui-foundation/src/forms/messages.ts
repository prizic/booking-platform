/**
 * Bilingual messages for the generic validation codes schemas emit. Apps pass
 * their own dictionary for domain codes; unknown codes fall back to "invalid".
 */
export type FormLocale = "ar" | "en";

export const formErrorCodes = [
  "required",
  "invalid",
  "invalid_email",
  "invalid_phone",
  "invalid_url",
  "invalid_number",
  "invalid_integer",
  "invalid_date",
  "invalid_time",
  "invalid_time_zone",
  "too_short",
  "too_long",
  "too_small",
  "too_large",
  "not_in_past",
  "end_before_start",
  "mismatch",
  "choose_one",
] as const;

export type FormErrorCode = (typeof formErrorCodes)[number];

const messages: Record<FormLocale, Record<FormErrorCode, string>> = {
  en: {
    required: "This field is required.",
    invalid: "Check this value and try again.",
    invalid_email: "Enter a valid email address.",
    invalid_phone: "Enter a valid phone number.",
    invalid_url: "Enter a valid web address.",
    invalid_number: "Enter a number.",
    invalid_integer: "Enter a whole number.",
    invalid_date: "Choose a valid date.",
    invalid_time: "Choose a valid time.",
    invalid_time_zone: "Choose a valid time zone.",
    too_short: "This is too short.",
    too_long: "This is too long.",
    too_small: "This value is too small.",
    too_large: "This value is too large.",
    not_in_past: "Choose a time that has not passed.",
    end_before_start: "The end must be after the start.",
    mismatch: "The values do not match.",
    choose_one: "Choose at least one option.",
  },
  ar: {
    required: "هذا الحقل مطلوب.",
    invalid: "تحقّق من هذه القيمة وحاول مرة أخرى.",
    invalid_email: "أدخل بريدًا إلكترونيًا صحيحًا.",
    invalid_phone: "أدخل رقم هاتف صحيحًا.",
    invalid_url: "أدخل عنوان موقع صحيحًا.",
    invalid_number: "أدخل رقمًا.",
    invalid_integer: "أدخل عددًا صحيحًا.",
    invalid_date: "اختر تاريخًا صحيحًا.",
    invalid_time: "اختر وقتًا صحيحًا.",
    invalid_time_zone: "اختر منطقة زمنية صحيحة.",
    too_short: "القيمة قصيرة جدًا.",
    too_long: "القيمة طويلة جدًا.",
    too_small: "القيمة أصغر من المسموح.",
    too_large: "القيمة أكبر من المسموح.",
    not_in_past: "اختر وقتًا لم يمضِ بعد.",
    end_before_start: "يجب أن تكون النهاية بعد البداية.",
    mismatch: "القيمتان غير متطابقتين.",
    choose_one: "اختر خيارًا واحدًا على الأقل.",
  },
};

/** Resolves an error code to a message: app dictionary first, then the generic set. */
export function formErrorMessage(
  code: string | undefined,
  locale: FormLocale,
  appMessages?: Readonly<Record<string, string>>,
): string | undefined {
  if (code === undefined || code === "") return undefined;
  return (
    appMessages?.[code] ??
    (messages[locale] as Record<string, string>)[code] ??
    messages[locale].invalid
  );
}
