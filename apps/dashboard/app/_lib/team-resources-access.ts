import type { DashboardContextV1 } from "@wlbp/api-contracts";

export type TeamResourcesAccess =
  "denied" | "location-scope-unavailable" | "ready" | "step-up-required";

export function getTeamResourcesAccess(
  context: DashboardContextV1,
): TeamResourcesAccess {
  const grant = context.grants.find(({ capability }) => capability === "staff.manage");
  if (grant === undefined) return "denied";
  if (grant.scope !== "tenant") return "location-scope-unavailable";
  if (grant.requiresApproval && !context.aal2) return "step-up-required";
  return "ready";
}
