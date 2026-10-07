/*
 * WhatsApp opt-in phone numbers. Shared by the booking form (browser) and the
 * booking routes (server), so both normalize a number the same way. The
 * database re-checks the result against the same E.164 rule.
 */

/** E.164: a plus, a non-zero country code, at most fifteen digits in all. */
export const e164Pattern = /^\+[1-9][0-9]{7,14}$/u;

export interface WhatsAppCountry {
  /** ISO 3166-1 alpha-2 region, named for the customer with Intl.DisplayNames. */
  readonly region: string;
  /** Country calling code, digits only. */
  readonly dialCode: string;
}

/**
 * The countries offered in the picker. Any other country is reachable by
 * typing the full international number starting with "+".
 */
export const whatsAppCountries: readonly WhatsAppCountry[] = [
  { region: "SA", dialCode: "966" },
  { region: "AE", dialCode: "971" },
  { region: "KW", dialCode: "965" },
  { region: "QA", dialCode: "974" },
  { region: "BH", dialCode: "973" },
  { region: "OM", dialCode: "968" },
  { region: "EG", dialCode: "20" },
  { region: "JO", dialCode: "962" },
];

/** The instance default when the location's country is not known. */
export const defaultWhatsAppRegion = "SA";

// Time zones that name exactly one of the offered countries. The public
// catalog carries a location's time zone but not its country.
const regionByTimeZone: Readonly<Record<string, string>> = {
  "Africa/Cairo": "EG",
  "Asia/Amman": "JO",
  "Asia/Bahrain": "BH",
  "Asia/Dubai": "AE",
  "Asia/Kuwait": "KW",
  "Asia/Muscat": "OM",
  "Asia/Qatar": "QA",
  "Asia/Riyadh": "SA",
};

/** The location's country when its time zone names one, else the instance default. */
export function whatsAppRegionForTimeZone(timeZone: string): string {
  return regionByTimeZone[timeZone] ?? defaultWhatsAppRegion;
}

export function dialCodeForRegion(region: string): string {
  return (
    whatsAppCountries.find((country) => country.region === region)?.dialCode ??
    whatsAppCountries[0]!.dialCode
  );
}

/**
 * Turns what a customer typed into an E.164 candidate. Spaces, dashes, dots
 * and brackets are dropped, Arabic-Indic digits become ASCII digits, a leading
 * "00" becomes "+". A national number (no "+") takes the chosen country's
 * calling code after its trunk zeros are removed; with no country (the route)
 * it is returned as typed and fails the E.164 check. Idempotent: an E.164
 * number comes back unchanged.
 */
export function normalizeWhatsAppNumber(raw: string, dialCode: string | null): string {
  const compact = raw
    .replace(/[\u0660-\u0669]/gu, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/gu, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[\s().\u00a0\u200e\u200f-]/gu, "");
  if (compact.startsWith("+")) return compact;
  if (compact.startsWith("00")) return `+${compact.slice(2)}`;
  if (dialCode !== null && /^[0-9]+$/u.test(compact)) {
    return `+${dialCode}${compact.replace(/^0+/u, "")}`;
  }
  return compact;
}
