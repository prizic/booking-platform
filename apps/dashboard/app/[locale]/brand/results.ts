import type { Locale } from "@wlbp/i18n";
import { getDashboardMessage, type DashboardMessageKey } from "../../_lib/copy";
import { dashboardFormMessages } from "../../_lib/form-messages";

export const brandResultKeys = {
  "backend-unavailable": "requestsResultUnavailable",
  "invalid-request": "requestsResultInvalid",
  "not-authorized": "requestsResultNotAuthorized",
  "revision-conflict": "requestsResultConflict",
  // The two refusals this surface adds.
  "unsafe-content": "brandResultUnsafe",
  "not-publishable": "brandResultNotPublishable",
  drafted: "brandResultDrafted",
  published: "brandResultPublished",
  "rolled-back": "brandResultRolledBack",
} as const satisfies Record<string, DashboardMessageKey>;

export const positiveBrandResults: ReadonlySet<string> = new Set([
  "drafted",
  "published",
  "rolled-back",
]);

/** Error codes the brand forms render, in one language. */
export function brandFormMessages(locale: Locale): Readonly<Record<string, string>> {
  const m = (en: string, ar: string) => (locale === "ar" ? ar : en);
  return {
    ...dashboardFormMessages(locale),
    ...Object.fromEntries(
      Object.entries(brandResultKeys).map(([code, key]) => [
        code,
        getDashboardMessage(locale, key),
      ]),
    ),
    invalid: getDashboardMessage(locale, "requestsResultInvalid"),
    brand_review: m(
      "Review identity, legal links, colors and fonts.",
      "راجع الهوية والروابط القانونية والألوان والخطوط.",
    ),
    brand_link_invalid: m(
      "Enter a complete https:// link without a user name or password.",
      "أدخل رابطًا كاملًا يبدأ بـ https:// دون اسم مستخدم أو كلمة مرور.",
    ),
    brand_color_invalid: m(
      "Enter a colour as # followed by six hexadecimal digits, for example #1a2b3c.",
      "أدخل اللون بالعلامة # متبوعة بستة أرقام سداسية عشرية، مثل ‎#1a2b3c.",
    ),
  };
}
