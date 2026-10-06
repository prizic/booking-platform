import { formatDateTime, type Locale } from "@wlbp/i18n";
import { auditActionCopy, outcomeCopy, type AuditRow } from "./audit-copy";
import { copyFor, say, type Copy } from "./copy";

const headers = [
  ["Time (UTC)", "الوقت (بالتوقيت العالمي)"],
  ["Timestamp (UTC ISO)", "الطابع الزمني (UTC ISO)"],
  ["Operator", "المشغّل"],
  ["Action", "الإجراء"],
  ["Action code", "رمز الإجراء"],
  ["Outcome", "النتيجة"],
  ["Outcome code", "رمز النتيجة"],
  ["Tenant", "المستأجر"],
  ["Target kind", "نوع الهدف"],
  ["Target ID", "معرّف الهدف"],
  ["Reason", "السبب"],
  ["Detail", "التفاصيل"],
] as const satisfies readonly Copy[];

function cell(value: unknown): string {
  let text =
    value === null || value === undefined
      ? ""
      : typeof value === "string"
        ? value
        : JSON.stringify(value);
  // A leading =, +, - or @ is executed as a formula by spreadsheet software.
  if (/^[=+\-@\t\r]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/gu, '""')}"`;
}

export function toCsv(rows: readonly AuditRow[], locale: Locale): string {
  const lines = rows.map((r) =>
    [
      formatDateTime(r.created_at, locale, "UTC"),
      r.created_at,
      r.operator_email ?? r.operator_id,
      copyFor(auditActionCopy, r.action, locale),
      r.action,
      copyFor(outcomeCopy, r.outcome, locale),
      r.outcome,
      r.tenant_name ?? r.tenant_id,
      r.target_kind,
      r.target_id,
      r.reason,
      r.detail,
    ]
      .map(cell)
      .join(","),
  );
  // UTF-8 BOM lets spreadsheet applications decode Arabic when opening the file.
  return (
    "\uFEFF" +
    [headers.map((header) => cell(say(locale, header))).join(","), ...lines].join(
      "\r\n",
    ) +
    "\r\n"
  );
}

export function auditRange(from?: string, to?: string): { from?: string; to?: string } {
  const range: { from?: string; to?: string } = {};
  if (from) range.from = new Date(`${from}T00:00:00Z`).toISOString();
  if (to) {
    const end = new Date(`${to}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    range.to = end.toISOString();
  }
  return range;
}
