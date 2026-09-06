import type { DashboardContextV1 } from "@wlbp/api-contracts";

export type TeamResourcesAccess =
  "denied" | "location-scope-unavailable" | "ready" | "step-up-required";

export function getTeamResourcesAccess(
  context: DashboardContextV1,
): TeamResourcesAccess {
  const grants = context.grants.filter(
    ({ capability }) => capability === "staff.manage" || capability === "catalog.edit",
  );
  if (grants.length === 0) return "denied";
  const approved = grants.filter((grant) => !grant.requiresApproval || context.aal2);
  if (approved.length === 0) return "step-up-required";
  if (approved.some((grant) => grant.scope === "tenant")) return "ready";
  if (
    approved.some((grant) => grant.scope === "location") &&
    context.locationScope?.kind === "restricted" &&
    context.locationIds.length > 0
  ) {
    return "ready";
  }
  return "location-scope-unavailable";
}
