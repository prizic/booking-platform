import type {
  CapabilityName,
  DashboardContextV1,
  ResourceTypeChoiceV1,
  StaffResourceChoiceV1,
  StaffResourceWorkspaceItemV1,
  StaffAccessMemberV1,
} from "@wlbp/api-contracts";
import { formatNumber, type Locale } from "@wlbp/i18n";
import {
  Alert,
  AlertDescription,
  Button,
  EmptyState,
  Facts,
  PageHeader,
  Section,
  StatusStamp,
  type StampState,
} from "@wlbp/ui-foundation";
import { ChevronDown, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { authMessage } from "../../_lib/auth-copy";

import {
  getTeamResourcesMessage,
  type TeamResourcesMessageKey,
} from "../../_lib/team-resources-copy";
import type { TeamResourcesWorkspaceState } from "../../_lib/team-resources-workspace";
import type { TeamResourcesRetry } from "../../_lib/team-resources-retry";
import type { TeamResourcesActionResult } from "./actions";
import {
  DeactivationForm,
  EligibilityForm,
  RequirementForm,
  ResourceForm,
  ResourceTypeForm,
  StaffForm,
} from "./team-resources-forms";
import type {
  ResourceDeactivationInput,
  ResourceInput,
  ResourceLocationEligibilityInput,
  ResourceRequirementInput,
  ResourceTypeInput,
  StaffDeactivationInput,
  StaffEligibilityInput,
  StaffProfileInput,
} from "./team-resources-schema";

type ManagementAction<I> = (input: I) => Promise<TeamResourcesActionResult>;

export interface TeamResourcesActions {
  readonly deactivateResource: ManagementAction<ResourceDeactivationInput>;
  readonly deactivateStaff: ManagementAction<StaffDeactivationInput>;
  readonly saveResource: ManagementAction<ResourceInput>;
  readonly saveResourceType: ManagementAction<ResourceTypeInput>;
  readonly saveStaffProfile: ManagementAction<StaffProfileInput>;
  readonly setResourceLocationEligibility: ManagementAction<ResourceLocationEligibilityInput>;
  readonly setResourceRequirement: ManagementAction<ResourceRequirementInput>;
  readonly setStaffEligibility: ManagementAction<StaffEligibilityInput>;
}

interface TeamResourcesViewProps {
  readonly members?: readonly StaffAccessMemberV1[];
  readonly actions: TeamResourcesActions;
  readonly locale: Locale;
  readonly retry?: TeamResourcesRetry;
  readonly result?:
    | "backend-unavailable"
    | "cancelled"
    | "deactivated"
    | "deferred"
    | "invalid-request"
    | "not-authorized"
    | "revision-conflict"
    | "reassigned"
    | "saved";
  readonly state: TeamResourcesWorkspaceState;
}

function statusKey(
  status: StaffResourceWorkspaceItemV1["status"],
): TeamResourcesMessageKey {
  return status === "deactivation_pending" ? "deactivationPending" : status;
}

function statusStamp(status: StaffResourceWorkspaceItemV1["status"]): StampState {
  if (status === "active") return "confirmed";
  if (status === "maintenance") return "requested";
  if (status === "deactivation_pending") return "pending";
  return "cancelled";
}

function hasTenantCapability(
  context: DashboardContextV1,
  capability: CapabilityName,
): boolean {
  return context.grants.some(
    (grant) =>
      grant.capability === capability &&
      grant.scope === "tenant" &&
      (!grant.requiresApproval || context.aal2),
  );
}

function hasCapability(
  context: DashboardContextV1,
  capability: CapabilityName,
): boolean {
  return context.grants.some(
    (grant) =>
      grant.capability === capability &&
      (!grant.requiresApproval || context.aal2) &&
      (grant.scope === "tenant" ||
        (grant.scope === "location" && context.locationIds.length > 0)),
  );
}

function UnavailableState({
  locale,
  state,
}: Pick<TeamResourcesViewProps, "locale" | "state">) {
  const message = (key: TeamResourcesMessageKey) =>
    getTeamResourcesMessage(locale, key);
  if (state.kind === "backend-unavailable") {
    return (
      <Alert tone="danger">
        <AlertDescription className="text-foreground">
          {message("backendUnavailable")}
        </AlertDescription>
      </Alert>
    );
  }
  if (state.kind !== "access-unavailable") return null;
  if (state.reason === "location-scope-unavailable") {
    return (
      <Section
        id="location-scope"
        title={message("locationScopeTitle")}
        description={message("locationScopeSummary")}
      />
    );
  }
  if (state.reason === "step-up-required") {
    return (
      <Section
        id="team-step-up"
        title={message("stepUpTitle")}
        description={message("stepUpSummary")}
      >
        <div>
          <Button asChild>
            <Link
              href={`/${locale}/auth/mfa?returnTo=${encodeURIComponent(`/${locale}/team-resources`)}`}
            >
              <ShieldCheck aria-hidden="true" />
              {authMessage(locale, "verify")}
            </Link>
          </Button>
        </div>
      </Section>
    );
  }
  return (
    <Alert tone="danger">
      <AlertDescription className="text-foreground">
        {message("backendUnavailable")}
      </AlertDescription>
    </Alert>
  );
}

function ItemFacts({
  item,
  locale,
}: {
  readonly item: StaffResourceWorkspaceItemV1;
  readonly locale: Locale;
}) {
  const message = (key: TeamResourcesMessageKey) =>
    getTeamResourcesMessage(locale, key);
  return (
    <Facts
      columns={3}
      items={[
        ...(item.resourceTypeName === null
          ? []
          : [
              {
                key: "type",
                label: message("resourceType"),
                value: item.resourceTypeName,
              },
            ]),
        {
          key: "locations",
          label: message("locations"),
          value: formatNumber(item.locationIds.length, locale),
        },
        {
          key: "services",
          label: message("services"),
          value: formatNumber(item.serviceIds.length, locale),
        },
        {
          key: "allocations",
          label: message("futureAllocations"),
          value: formatNumber(item.futureAllocationCount, locale),
        },
      ]}
    />
  );
}

/**
 * A disclosure that holds one editor. Native <details> keeps the editors
 * closed by default without client state; the summary is a full-width target.
 */
function Editor({
  summary,
  tone = "default",
  children,
}: {
  readonly summary: ReactNode;
  readonly tone?: "default" | "danger";
  readonly children: ReactNode;
}) {
  return (
    <details className="group border-t first:border-t-0">
      <summary
        className={
          tone === "danger"
            ? "flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-1 py-2 text-sm font-semibold text-destructive outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden"
            : "flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-1 py-2 text-sm font-semibold text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden"
        }
      >
        {summary}
        <ChevronDown
          aria-hidden="true"
          className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="pb-5">{children}</div>
    </details>
  );
}

/** The attempt id an editor starts with: the retried one after a failed attempt, else fresh. */
function attemptFor(formId: string, retry: TeamResourcesRetry | undefined): string {
  return retry?.formId === formId ? retry.requestId : crypto.randomUUID();
}

function ItemList({
  actions,
  canDeactivate,
  canEdit,
  canManageEligibility,
  emptyMessage,
  items,
  locale,
  members = [],
  locations,
  resourceTypes,
  retry,
  services,
}: {
  readonly actions: TeamResourcesActions;
  readonly canDeactivate: boolean;
  readonly canEdit: boolean;
  readonly canManageEligibility: boolean;
  readonly emptyMessage: TeamResourcesMessageKey;
  readonly items: readonly StaffResourceWorkspaceItemV1[];
  readonly locale: Locale;
  readonly members?: readonly StaffAccessMemberV1[];
  readonly locations: readonly StaffResourceChoiceV1[];
  readonly resourceTypes: readonly ResourceTypeChoiceV1[];
  readonly retry: TeamResourcesRetry | undefined;
  readonly services: readonly StaffResourceChoiceV1[];
}) {
  const message = (key: TeamResourcesMessageKey) =>
    getTeamResourcesMessage(locale, key);
  if (items.length === 0) return <EmptyState title={message(emptyMessage)} />;
  return (
    <ul className="grid divide-y rounded-lg border bg-card">
      {items.map((item) => {
        const editId =
          item.kind === "staff" ? `staff-${item.id}` : `resource-${item.id}`;
        const eligibilityId = `${item.kind}-${item.id}-eligibility`;
        const deactivationId = `${item.kind}-${item.id}-deactivation`;
        return (
          <li key={item.id}>
            <article className="grid gap-4 p-5">
              <header className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-foreground">{item.name}</h3>
                <StatusStamp state={statusStamp(item.status)}>
                  {message(statusKey(item.status))}
                </StatusStamp>
              </header>
              <ItemFacts item={item} locale={locale} />
              {canEdit || canManageEligibility || canDeactivate ? (
                <div className="grid">
                  {canEdit ? (
                    item.kind === "staff" ? (
                      <Editor summary={message("editStaff")}>
                        <StaffForm
                          action={actions.saveStaffProfile}
                          item={item}
                          members={members}
                          locale={locale}
                          formId={editId}
                          requestId={attemptFor(editId, retry)}
                        />
                      </Editor>
                    ) : (
                      <Editor summary={message("editResource")}>
                        <ResourceForm
                          action={actions.saveResource}
                          item={item}
                          locale={locale}
                          resourceTypes={resourceTypes}
                          formId={editId}
                          requestId={attemptFor(editId, retry)}
                        />
                      </Editor>
                    )
                  ) : null}
                  {canManageEligibility ? (
                    <Editor
                      summary={
                        item.kind === "staff"
                          ? message("updateEligibility")
                          : message("resourceLocationEligibility")
                      }
                    >
                      <EligibilityForm
                        staffAction={actions.setStaffEligibility}
                        resourceAction={actions.setResourceLocationEligibility}
                        item={item}
                        locale={locale}
                        locations={locations}
                        services={services}
                        formId={eligibilityId}
                        requestId={attemptFor(eligibilityId, retry)}
                      />
                    </Editor>
                  ) : null}
                  {canDeactivate && item.status !== "inactive" ? (
                    <Editor summary={message("deactivate")} tone="danger">
                      <DeactivationForm
                        staffAction={actions.deactivateStaff}
                        resourceAction={actions.deactivateResource}
                        item={item}
                        locale={locale}
                        replacements={items.filter(
                          (candidate) =>
                            candidate.id !== item.id &&
                            candidate.kind === item.kind &&
                            candidate.status === "active" &&
                            (item.kind === "staff" ||
                              candidate.resourceTypeId === item.resourceTypeId),
                        )}
                        formId={deactivationId}
                        requestId={attemptFor(deactivationId, retry)}
                      />
                    </Editor>
                  ) : null}
                </div>
              ) : null}
            </article>
          </li>
        );
      })}
    </ul>
  );
}

function resultKey(
  result: NonNullable<TeamResourcesViewProps["result"]>,
): TeamResourcesMessageKey {
  if (result === "saved") return "saved";
  if (result === "not-authorized") return "notAuthorized";
  if (result === "invalid-request") return "invalidRequest";
  if (result === "revision-conflict") return "revisionConflict";
  if (result === "cancelled") return "deactivationCancelled";
  if (result === "deactivated") return "deactivationSucceeded";
  if (result === "deferred") return "deactivationDeferred";
  if (result === "reassigned") return "deactivationReassigned";
  return "backendUnavailable";
}

const positiveResults: ReadonlySet<string> = new Set([
  "saved",
  "cancelled",
  "deactivated",
  "deferred",
  "reassigned",
]);

export function TeamResourcesView({
  actions,
  locale,
  members = [],
  result,
  retry,
  state,
}: TeamResourcesViewProps) {
  const message = (key: TeamResourcesMessageKey) =>
    getTeamResourcesMessage(locale, key);
  const intro = (
    <PageHeader
      titleId="team-resources-title"
      title={message("title")}
      description={message("summary")}
    />
  );
  if (state.kind !== "ready")
    return (
      <div className="grid gap-8">
        {intro}
        <UnavailableState locale={locale} state={state} />
      </div>
    );
  const staff = state.workspace.items.filter((item) => item.kind === "staff");
  const resources = state.workspace.items.filter((item) => item.kind === "resource");
  const canManageStaff = hasTenantCapability(state.context, "staff.manage");
  const canManageCatalog = hasTenantCapability(state.context, "catalog.edit");
  const canManageStaffEligibility = hasCapability(state.context, "staff.manage");
  const canManageResourceEligibility = hasCapability(state.context, "catalog.edit");
  return (
    <div className="grid gap-8">
      {intro}
      {result === undefined ? null : (
        <Alert tone={positiveResults.has(result) ? "positive" : "danger"}>
          <AlertDescription className="text-foreground">
            {message(resultKey(result))}
          </AlertDescription>
        </Alert>
      )}
      <Section
        id="team-resources-management"
        title={message("createStaff")}
        description={message("createEditUnavailable")}
      >
        {canManageStaff || canManageCatalog ? (
          <div className="grid rounded-lg border bg-card px-5 py-1">
            {canManageStaff ? (
              <Editor summary={message("addStaff")}>
                <StaffForm
                  action={actions.saveStaffProfile}
                  members={members}
                  locale={locale}
                  formId="new-staff"
                  requestId={attemptFor("new-staff", retry)}
                />
              </Editor>
            ) : null}
            {canManageCatalog ? (
              <>
                <Editor summary={message("addResourceType")}>
                  <ResourceTypeForm
                    action={actions.saveResourceType}
                    locale={locale}
                    formId="resource-type-new"
                    requestId={attemptFor("resource-type-new", retry)}
                  />
                </Editor>
                {state.workspace.resourceTypes.map((resourceType) => (
                  <Editor
                    key={resourceType.id}
                    summary={
                      <span>
                        {message("editResourceType")} ·{" "}
                        <span className="font-normal text-muted-foreground">
                          {resourceType.name}
                        </span>
                      </span>
                    }
                  >
                    <ResourceTypeForm
                      action={actions.saveResourceType}
                      locale={locale}
                      resourceType={resourceType}
                      formId={`resource-type-${resourceType.id}`}
                      requestId={attemptFor(`resource-type-${resourceType.id}`, retry)}
                    />
                  </Editor>
                ))}
                <Editor summary={message("addResource")}>
                  <ResourceForm
                    action={actions.saveResource}
                    locale={locale}
                    resourceTypes={state.workspace.resourceTypes}
                    formId="new-resource"
                    requestId={attemptFor("new-resource", retry)}
                  />
                </Editor>
                <Editor summary={message("resourceRequirement")}>
                  <RequirementForm
                    action={actions.setResourceRequirement}
                    locale={locale}
                    resourceTypes={state.workspace.resourceTypes}
                    services={state.workspace.services}
                    formId="resource-requirement"
                    requestId={attemptFor("resource-requirement", retry)}
                  />
                </Editor>
              </>
            ) : null}
          </div>
        ) : null}
      </Section>
      <div className="grid gap-8 xl:grid-cols-2">
        <Section id="staff-list" title={message("staffTitle")}>
          <ItemList
            actions={actions}
            canDeactivate={canManageStaff}
            canEdit={canManageStaff}
            canManageEligibility={canManageStaffEligibility}
            emptyMessage="staffEmpty"
            items={staff}
            members={members}
            locale={locale}
            locations={state.workspace.locations}
            resourceTypes={state.workspace.resourceTypes}
            retry={retry}
            services={state.workspace.services}
          />
        </Section>
        <Section id="resource-list" title={message("resourcesTitle")}>
          <ItemList
            actions={actions}
            canDeactivate={canManageStaff}
            canEdit={canManageCatalog}
            canManageEligibility={canManageResourceEligibility}
            emptyMessage="resourcesEmpty"
            items={resources}
            locale={locale}
            locations={state.workspace.locations}
            resourceTypes={state.workspace.resourceTypes}
            retry={retry}
            services={state.workspace.services}
          />
        </Section>
      </div>
    </div>
  );
}
