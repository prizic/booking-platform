import type { Locale } from "@wlbp/i18n";
import { copyFor, say } from "../copy";
import { supportCopy } from "../health-support-copy";
import { reviewCopy as c } from "../lifecycle-copy";
import { Facts } from "./facts";
import { TimeValue } from "./time";
import { StatusBadge } from "./status-badge";
/** Display only reviewed request fields; no arbitrary private JSON or provider payloads. */
export function ReviewDetails({
  locale,
  detail,
}: {
  locale: Locale;
  detail: Record<string, unknown>;
}) {
  const fields = {
    scope: ["Scope", "النطاق"],
    location_id: ["Location", "الموقع"],
    ticket_reference: ["Ticket reference", "مرجع التذكرة"],
    approved_by: c.operator,
    approved_at: ["Approved at", "وقت الموافقة"],
    expires_at: ["Expires at", "تنتهي في"],
    revoked_at: ["Access ended at", "وقت انتهاء الوصول"],
    instance_id: ["Instance", "النسخة"],
    kind: c.action,
    reason: c.reason,
    status: c.status,
  } as const;
  const parameters =
    typeof detail.parameters === "object" &&
    detail.parameters !== null &&
    !Array.isArray(detail.parameters)
      ? (detail.parameters as Record<string, unknown>)
      : {};
  const parameterFields = {
    domain_id: ["Domain ID", "معرّف النطاق"],
    replacement_domain_id: ["Replacement domain ID", "معرّف النطاق البديل"],
  } as const;
  const parameterItems = Object.entries(parameterFields).flatMap(([key, label]) => {
    const value = parameters[key];
    return typeof value === "string" && /^[0-9a-f-]{36}$/u.test(value)
      ? [[say(locale, label), <bdi key={key}>{value}</bdi>] as const]
      : [];
  });
  return (
    <Facts
      items={[
        ...parameterItems,
        ...Object.entries(fields).flatMap(([key, label]) => {
          const value = detail[key];
          if (typeof value !== "string") return [];
          return [
            [
              say(locale, label),
              ["expires_at", "approved_at", "revoked_at"].includes(key) ? (
                <TimeValue key={key} locale={locale} value={value} />
              ) : key === "status" ? (
                <StatusBadge key={key} locale={locale} status={value} />
              ) : key === "kind" ? (
                copyFor(c, value, locale)
              ) : key === "scope" ? (
                copyFor(
                  { read: supportCopy.readOnly, write: c.writeScope },
                  value,
                  locale,
                )
              ) : (
                <bdi key={key}>{value}</bdi>
              ),
            ] as const,
          ];
        }),
      ]}
    />
  );
}
