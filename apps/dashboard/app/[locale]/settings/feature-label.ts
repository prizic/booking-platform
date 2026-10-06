import type { Locale } from "@wlbp/i18n";

const labels: Record<string, readonly [string, string]> = {
  "booking.online": ["Online booking", "الحجز عبر الإنترنت"],
  "booking.guest_management": ["Guest booking management", "إدارة حجوزات الضيوف"],
  "booking.request_to_book": ["Booking requests", "طلبات الحجز"],
  "brand.custom_domain": ["Custom domain", "نطاق مخصص"],
  "payments.deposits": ["Booking deposits", "عربون الحجز"],
  "reports.operational": ["Operational reports", "التقارير التشغيلية"],
};

export function featureLabel(locale: Locale, key: string): string {
  return labels[key]?.[locale === "ar" ? 1 : 0] ?? key;
}
