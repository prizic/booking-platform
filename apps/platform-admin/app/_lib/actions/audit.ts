"use server";

import { parseActionInput } from "@wlbp/ui-foundation/actions";
import { auditRange, toCsv } from "../audit-csv";
import type { AuditRow } from "../audit-copy";
import {
  operatorOk,
  runOperatorAction,
  type OperatorActionResult,
} from "../operator-action";
import { exportAuditSchema, type ExportAuditInput } from "../schemas/audit";

/** Exports the filtered audit log; the browser downloads the returned CSV. */
export async function exportAuditAction(
  input: ExportAuditInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(exportAuditSchema, input);
  if (!parsed.ok) return parsed.result;
  const { q, family, tenant, outcome, from, to, locale } = parsed.data;
  const range = auditRange(from, to);
  const { result, data } = await runOperatorAction({
    action: "audit.export",
    fn: "export_audit_events_v1",
    args: {
      p_search: q,
      p_action: family,
      p_tenant_id: tenant,
      p_outcome: outcome,
      p_from: range.from,
      p_to: range.to,
    },
    targetKind: "audit",
  });
  if (!result.ok) return result;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/gu, "-");
  return operatorOk({
    download: {
      filename: `audit-${stamp}.csv`,
      body: toCsv((data ?? []) as unknown as AuditRow[], locale),
    },
  });
}
