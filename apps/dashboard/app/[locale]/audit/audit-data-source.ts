import type { Locale } from "@wlbp/i18n";
import { createDashboardAuthClient } from "../../_lib/auth-server";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import type { auditFilters } from "./audit-filters";
export interface AuditRow {
  id: string;
  time: string;
  stream: string;
  action: string;
  target_id: string;
  target_kind: string;
  target_reference: string | null;
  outcome: string;
  actor: string | null;
  effective_actor: string | null;
  correlation: string | null;
  actor_name: string;
}
export async function loadAudit(
  locale: Locale,
  filters: ReturnType<typeof auditFilters>,
) {
  const request = await loadDashboardRequestAccess(locale);
  if (request.state.kind !== "ready")
    return { kind: "access" as const, state: request.state };
  try {
    const client = await createDashboardAuthClient(false);
    if (!client) throw new Error();
    const api = client.schema("api_v1") as unknown as {
      rpc(
        name: string,
        args: Record<string, unknown>,
      ): PromiseLike<{ data: unknown; error: unknown }>;
    };
    const { data, error } = await api.rpc("list_dashboard_audit_v1", {
      p_tenant_id: request.state.context.tenantId,
      p_stream: filters.stream,
      p_from: filters.from,
      p_to: filters.to,
      p_actor: filters.actor,
      p_cursor: filters.cursor,
    });
    if (
      error ||
      typeof data !== "object" ||
      data === null ||
      !("rows" in data) ||
      !Array.isArray(data.rows) ||
      data.rows.length > 50
    )
      throw new Error();
    const rows = data.rows.map((v: unknown) => {
      if (typeof v !== "object" || v === null) throw new Error();
      const r = v as Record<string, unknown>;
      for (const key of [
        "id",
        "time",
        "stream",
        "action",
        "target_id",
        "target_kind",
        "outcome",
        "actor_name",
      ])
        if (typeof r[key] !== "string") throw new Error();
      for (const key of ["target_reference", "actor", "effective_actor", "correlation"])
        if (r[key] !== null && typeof r[key] !== "string") throw new Error();
      return r as unknown as AuditRow;
    });
    const cursor = "cursor" in data ? data.cursor : null;
    return { kind: "ready" as const, rows, cursor };
  } catch {
    return { kind: "unavailable" as const };
  }
}
