import type { Locale } from "@wlbp/i18n";

import { instanceText } from "./instance-text";

/** What the booking form shows next to the WhatsApp box, from instance content. */
export interface WhatsAppConsentContent {
  readonly consentText: string;
  readonly consentVersion: string;
  readonly label: string;
}

export function whatsAppConsentContent(locale: Locale): WhatsAppConsentContent {
  const text = instanceText(locale);
  return {
    consentText: text("whatsapp.optIn.consent").trim(),
    consentVersion: text("whatsapp.optIn.consentVersion").trim(),
    label: text("whatsapp.optIn.label"),
  };
}

/**
 * True only when the submitted consent is exactly the text and version this
 * instance shows in the booking's language. The snapshot is evidence of what
 * the customer agreed to, so a body carrying any other wording is refused
 * rather than stored.
 */
export function isShownWhatsAppConsent(
  optIn: { readonly consentText: string; readonly consentVersion: string },
  locale: Locale,
): boolean {
  const shown = whatsAppConsentContent(locale);
  return (
    optIn.consentText === shown.consentText &&
    optIn.consentVersion === shown.consentVersion
  );
}
