"use server";

import { auditRange, toCsv } from "../audit-csv";
import type { AuditRow } from "../audit-copy";
import { localeOf, optional, uuid } from "../form-data";
import { runOperatorAction, type ActionResult } from "../operator-action";

const dates = /^\d{4}-\d{2}-\d{2}$/u;

export async function exportAuditAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const from = optional(form, "from");
  const to = optional(form, "to");
  const range = auditRange(
    from && dates.test(from) ? from : undefined,
    to && dates.test(to) ? to : undefined,
  );
  const { result, data } = await runOperatorAction({
    action: "audit.export",
    fn: "export_audit_events_v1",
    args: {
      p_search: optional(form, "q"),
      p_action: optional(form, "family"),
      p_tenant_id: uuid(form, "tenant"),
      p_outcome: optional(form, "outcome"),
      p_from: range.from,
      p_to: range.to,
    },
    targetKind: "audit",
  });
  if (result.kind !== "success") return result;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/gu, "-");
  return {
    ...result,
    download: {
      filename: `audit-${stamp}.csv`,
      body: toCsv((data ?? []) as unknown as AuditRow[], localeOf(form)),
    },
  };
}
