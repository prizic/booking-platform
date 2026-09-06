import type { DashboardContextV1, StaffResourceWorkspaceV1 } from "@wlbp/api-contracts";
import type { Locale } from "@wlbp/i18n";

import type { TeamResourcesDataSource } from "./dashboard-data-source";
import {
  getTeamResourcesAccess,
  type TeamResourcesAccess,
} from "./team-resources-access";

export type TeamResourcesWorkspaceState =
  | { readonly kind: "backend-unavailable" }
  | {
      readonly kind: "access-unavailable";
      readonly reason: Exclude<TeamResourcesAccess, "ready">;
    }
  | {
      readonly context: DashboardContextV1;
      readonly kind: "ready";
      readonly workspace: StaffResourceWorkspaceV1;
    };

export async function loadTeamResourcesWorkspace(
  access: { readonly context: DashboardContextV1; readonly kind: "ready" },
  source: TeamResourcesDataSource,
  locale: Locale = access.context.defaultLocale,
): Promise<TeamResourcesWorkspaceState> {
  const authorization = getTeamResourcesAccess(access.context);
  if (authorization !== "ready") {
    return { kind: "access-unavailable", reason: authorization };
  }

  try {
    const workspace = await source.getStaffResourceWorkspace(
      access.context.tenantId,
      locale,
    );
    if (workspace.tenantId !== access.context.tenantId) {
      return { kind: "backend-unavailable" };
    }
    return { context: access.context, kind: "ready", workspace };
  } catch {
    return { kind: "backend-unavailable" };
  }
}
