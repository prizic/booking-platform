import type { BookingContextV1 } from "@wlbp/api-contracts";
import type { Locale } from "@wlbp/i18n";
export function canDisplayBookingContact(
  context: BookingContextV1 | null,
  customer: { erased: boolean; restricted: boolean } | null,
) {
  if (context === null || context.contactAccess !== "allowed") return false;
  if (context.customer.access !== "allowed") return false;
  if (context.customer.state !== "active") return false;
  if (customer === null) return false;
  if (customer.erased || customer.restricted) return false;
  return true;
}
export function intakeLabel(
  schema: Readonly<Record<string, unknown>>,
  key: string,
  locale: Locale,
) {
  if (!Array.isArray(schema.fields)) return key;
  const field = schema.fields.find(
    (value) =>
      typeof value === "object" &&
      value !== null &&
      "key" in value &&
      value.key === key,
  );
  if (!field || typeof field.label !== "object" || field.label === null) return key;
  const label = (field.label as Record<string, unknown>)[locale];
  return typeof label === "string" && label.trim() ? label : key;
}
