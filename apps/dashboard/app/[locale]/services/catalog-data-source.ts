import type { Locale } from "@wlbp/i18n";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { DashboardRpcError } from "../../_lib/dashboard-data-source";
export async function loadCatalogWorkspace(locale: Locale) {
  const request = await loadDashboardRequestAccess(locale);
  if (request.state.kind !== "ready" || !request.source?.getCatalogWorkspace)
    return { kind: "denied" as const };
  try {
    const workspace = await request.source.getCatalogWorkspace(
      request.state.context.tenantId,
    );
    if (workspace.tenantId !== request.state.context.tenantId)
      return { kind: "unavailable" as const };
    return { kind: "ready" as const, workspace, request };
  } catch (error) {
    if (error instanceof DashboardRpcError && error.stableMessage === "not_authorized")
      return { kind: "denied" as const };
    return { kind: "unavailable" as const };
  }
}
