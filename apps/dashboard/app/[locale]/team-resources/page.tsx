import { WorkspaceShell } from "../../_lib/workspace-shell";
import type { Locale } from "@wlbp/i18n";
import { Alert, AlertDescription } from "@wlbp/ui-foundation";

import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { getTeamResourcesMetadata } from "../../_lib/team-resources-metadata";
import { parseTeamResourcesRetry } from "../../_lib/team-resources-retry";
import {
  loadTeamResourcesWorkspace,
  type TeamResourcesWorkspaceState,
} from "../../_lib/team-resources-workspace";
import {
  deactivateResourceAction,
  deactivateStaffAction,
  saveResourceAction,
  saveResourceTypeAction,
  saveStaffProfileAction,
  setResourceLocationEligibilityAction,
  setResourceRequirementAction,
  setStaffEligibilityAction,
} from "./actions";
import { TeamResourcesView } from "./team-resources-view";
import type { StaffAccessWorkspaceV1 } from "@wlbp/api-contracts";
import { StaffAccessPanel } from "./staff-access-panel";
import { staffAccessMessage } from "./staff-access";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type TeamResourcesPageProps = {
  readonly params: Promise<{ locale: Locale }>;
  readonly searchParams: Promise<{
    result?: string;
    retryForm?: string;
    retryId?: string;
  }>;
};

export async function generateMetadata({ params }: TeamResourcesPageProps) {
  const { locale } = await params;
  return getTeamResourcesMetadata(locale);
}

async function loadPageState(locale: Locale): Promise<TeamResourcesWorkspaceState> {
  const request = await loadDashboardRequestAccess(locale);
  if (request.source === null || request.state.kind !== "ready") {
    return request.state.kind === "configuration-missing"
      ? { kind: "backend-unavailable" }
      : { kind: "access-unavailable", reason: "denied" };
  }
  return loadTeamResourcesWorkspace(request.state, request.source, locale);
}

export default async function TeamResourcesPage({
  params,
  searchParams,
}: TeamResourcesPageProps) {
  const { locale } = await params;
  const query = await searchParams;
  const retry = parseTeamResourcesRetry(query.retryForm, query.retryId);
  const state = await loadPageState(locale);
  const request = await loadDashboardRequestAccess(locale);
  const canManageAccess =
    request.state.kind === "ready" &&
    request.state.context.grants.some(
      (grant) =>
        grant.capability === "staff.manage" &&
        grant.scope === "tenant" &&
        !grant.requiresApproval,
    );
  let access: StaffAccessWorkspaceV1 | null = null;
  if (
    canManageAccess &&
    request.state.kind === "ready" &&
    request.source?.getStaffAccessWorkspace
  ) {
    try {
      access = await request.source.getStaffAccessWorkspace(
        request.state.context.tenantId,
      );
    } catch {
      /* Distinct failed-read state below. */
    }
  }

  return (
    <WorkspaceShell
      current="team-resources"
      labelledBy="team-resources-title"
      locale={locale}
    >
      <div className="grid gap-10">
        <TeamResourcesView
          actions={{
            deactivateResource: deactivateResourceAction,
            deactivateStaff: deactivateStaffAction,
            saveResource: saveResourceAction,
            saveResourceType: saveResourceTypeAction,
            saveStaffProfile: saveStaffProfileAction,
            setResourceLocationEligibility: setResourceLocationEligibilityAction,
            setResourceRequirement: setResourceRequirementAction,
            setStaffEligibility: setStaffEligibilityAction,
          }}
          locale={locale}
          members={access?.members.filter((member) => member.status === "active") ?? []}
          {...(retry === undefined ? {} : { retry })}
          {...(query.result === "saved" ||
          query.result === "cancelled" ||
          query.result === "deactivated" ||
          query.result === "deferred" ||
          query.result === "reassigned" ||
          query.result === "invalid-request" ||
          query.result === "not-authorized" ||
          query.result === "revision-conflict" ||
          query.result === "backend-unavailable"
            ? { result: query.result }
            : {})}
          state={state}
        />
        {access ? (
          <StaffAccessPanel
            locale={locale}
            workspace={access}
            attempts={Array.from(
              { length: 1 + access.members.length * 2 + access.invitations.length * 2 },
              () => crypto.randomUUID(),
            )}
          />
        ) : canManageAccess ? (
          <Alert tone="danger">
            <AlertDescription className="text-foreground">
              {staffAccessMessage(locale, "unavailable")}
            </AlertDescription>
          </Alert>
        ) : null}
      </div>
    </WorkspaceShell>
  );
}
