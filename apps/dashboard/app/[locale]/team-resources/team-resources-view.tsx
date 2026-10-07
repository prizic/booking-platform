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
  Field,
  FieldGroup,
  Input,
  Label,
  PageHeader,
  RequiredMark,
  Section,
  StatusStamp,
  Textarea,
  type StampState,
} from "@wlbp/ui-foundation";
import { ChevronDown, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { authMessage } from "../../_lib/auth-copy";
import { staffAccessMessage } from "./staff-access";

import {
  getTeamResourcesMessage,
  type TeamResourcesMessageKey,
} from "../../_lib/team-resources-copy";
import type { TeamResourcesWorkspaceState } from "../../_lib/team-resources-workspace";
import type { TeamResourcesRetry } from "../../_lib/team-resources-retry";
import { ChoiceSelect, FormActions } from "../services/form-kit";
import { NO_LINKED_ACCOUNT } from "./form-values";
import { ValidatedForm } from "./validated-form";

type ManagementAction = (formData: FormData) => Promise<void>;

export interface TeamResourcesActions {
  readonly deactivateResource: ManagementAction;
  readonly deactivateStaff: ManagementAction;
  readonly saveResource: ManagementAction;
  readonly saveResourceType: ManagementAction;
  readonly saveStaffProfile: ManagementAction;
  readonly setResourceLocationEligibility: ManagementAction;
  readonly setResourceRequirement: ManagementAction;
  readonly setStaffEligibility: ManagementAction;
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

function HiddenContext({
  formId,
  locale,
  retry,
}: {
  readonly formId: string;
  readonly locale: Locale;
  readonly retry: TeamResourcesRetry | undefined;
}) {
  return (
    <>
      <input name="locale" type="hidden" value={locale} />
      <input name="formId" type="hidden" value={formId} />
      <input
        name="requestId"
        type="hidden"
        value={retry?.formId === formId ? retry.requestId : crypto.randomUUID()}
      />
    </>
  );
}

function ChoiceField({
  choices,
  id,
  label,
  name,
  required = true,
  value,
}: {
  readonly choices: readonly StaffResourceChoiceV1[];
  readonly id: string;
  readonly label: string;
  readonly name: string;
  readonly required?: boolean;
  readonly value?: string | undefined;
}) {
  return (
    <Field>
      <Label htmlFor={id}>
        {label}
        {required ? <RequiredMark /> : null}
      </Label>
      <ChoiceSelect
        id={id}
        name={name}
        required={required}
        defaultValue={value ?? ""}
        placeholder="—"
        options={choices.map((choice) => ({ value: choice.id, label: choice.name }))}
      />
    </Field>
  );
}

function ReasonField({ id, locale }: { readonly id: string; readonly locale: Locale }) {
  const message = (key: TeamResourcesMessageKey) =>
    getTeamResourcesMessage(locale, key);
  return (
    <Field>
      <Label htmlFor={id}>
        {message("deactivateReason")}
        <RequiredMark />
      </Label>
      <Input id={id} maxLength={500} name="reason" required />
    </Field>
  );
}

function StaffForm({
  action,
  item,
  locale,
  members = [],
  retry,
}: {
  readonly action: ManagementAction;
  readonly item?: StaffResourceWorkspaceItemV1;
  readonly locale: Locale;
  readonly members?: readonly StaffAccessMemberV1[];
  readonly retry: TeamResourcesRetry | undefined;
}) {
  const message = (key: TeamResourcesMessageKey) =>
    getTeamResourcesMessage(locale, key);
  const prefix = item === undefined ? "new-staff" : `staff-${item.id}`;
  return (
    <Editor summary={item === undefined ? message("addStaff") : message("editStaff")}>
      <ValidatedForm action={action} invalidMessage={message("fieldError")}>
        <HiddenContext formId={prefix} locale={locale} retry={retry} />
        <input name="staffId" type="hidden" value={item?.id ?? ""} />
        <input name="expectedRevision" type="hidden" value={item?.revision ?? ""} />
        <FieldGroup columns={2}>
          <Field>
            <Label htmlFor={`${prefix}-name`}>
              {message("publicName")}
              <RequiredMark />
            </Label>
            <Input
              defaultValue={item?.name}
              id={`${prefix}-name`}
              maxLength={160}
              name="publicName"
              required
            />
          </Field>
          <Field>
            <Label htmlFor={`${prefix}-membership`}>
              {staffAccessMessage(locale, "account")}
            </Label>
            <ChoiceSelect
              id={`${prefix}-membership`}
              name="membershipId"
              defaultValue={item?.membershipId ?? NO_LINKED_ACCOUNT}
              options={[
                {
                  value: NO_LINKED_ACCOUNT,
                  label: staffAccessMessage(locale, "noAccount"),
                },
                ...(item?.membershipId &&
                !members.some((member) => member.id === item.membershipId)
                  ? [
                      {
                        value: item.membershipId,
                        label: staffAccessMessage(locale, "currentAccount"),
                      },
                    ]
                  : []),
                ...members.map((member) => ({
                  value: member.id,
                  label: (
                    <>
                      {member.name} — <bdi>{member.email}</bdi>
                    </>
                  ),
                })),
              ]}
            />
          </Field>
          <Field>
            <Label htmlFor={`${prefix}-bio`}>{message("publicBio")}</Label>
            <Textarea
              defaultValue={item?.publicBio ?? ""}
              id={`${prefix}-bio`}
              maxLength={2000}
              name="bio"
              rows={3}
            />
          </Field>
          <Field>
            <Label htmlFor={`${prefix}-notes`}>{message("internalNotes")}</Label>
            <Textarea
              defaultValue={item?.internalNotes ?? ""}
              id={`${prefix}-notes`}
              maxLength={2000}
              name="internalNotes"
              rows={3}
            />
          </Field>
          <Field>
            <Label htmlFor={`${prefix}-hours`}>
              {message("offeredHours")}
              <RequiredMark />
            </Label>
            <Input
              id={`${prefix}-hours`}
              max="168"
              min="0.25"
              required
              step="0.25"
              type="number"
              name="offeredHoursPerWeek"
              defaultValue={item?.offeredHoursPerWeek ?? 40}
            />
          </Field>
          <ReasonField id={`${prefix}-reason`} locale={locale} />
        </FieldGroup>
        <FormActions>
          <Button type="submit">
            {message(item === undefined ? "submitStaff" : "saveStaff")}
          </Button>
        </FormActions>
      </ValidatedForm>
    </Editor>
  );
}

function ResourceTypeForm({
  action,
  locale,
  resourceType,
  retry,
}: {
  readonly action: ManagementAction;
  readonly locale: Locale;
  readonly resourceType?: ResourceTypeChoiceV1;
  readonly retry: TeamResourcesRetry | undefined;
}) {
  const message = (key: TeamResourcesMessageKey) =>
    getTeamResourcesMessage(locale, key);
  const prefix = `resource-type-${resourceType?.id ?? "new"}`;
  return (
    <Editor
      summary={
        resourceType === undefined ? (
          message("addResourceType")
        ) : (
          <span>
            {message("editResourceType")} ·{" "}
            <span className="font-normal text-muted-foreground">
              {resourceType.name}
            </span>
          </span>
        )
      }
    >
      <ValidatedForm action={action} invalidMessage={message("fieldError")}>
        <HiddenContext formId={prefix} locale={locale} retry={retry} />
        <input name="resourceTypeId" type="hidden" value={resourceType?.id ?? ""} />
        <input
          name="expectedRevision"
          type="hidden"
          value={resourceType?.revision ?? ""}
        />
        <input name="exclusive" type="hidden" value="true" />
        <FieldGroup columns={2}>
          <Field>
            <Label htmlFor={`type-${resourceType?.id ?? "new"}-key`}>
              {message("key")}
              <RequiredMark />
            </Label>
            <Input
              autoComplete="off"
              defaultValue={resourceType?.key}
              dir="ltr"
              id={`type-${resourceType?.id ?? "new"}-key`}
              maxLength={80}
              name="key"
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              required
            />
          </Field>
          <Field>
            <Label htmlFor={`type-${resourceType?.id ?? "new"}-name`}>
              {message("name")}
              <RequiredMark />
            </Label>
            <Input
              defaultValue={resourceType?.name}
              id={`type-${resourceType?.id ?? "new"}-name`}
              maxLength={160}
              name="name"
              required
            />
          </Field>
          <ReasonField
            id={`type-${resourceType?.id ?? "new"}-reason`}
            locale={locale}
          />
        </FieldGroup>
        <FormActions>
          <Button type="submit">
            {message(
              resourceType === undefined ? "submitResourceType" : "saveResourceType",
            )}
          </Button>
        </FormActions>
      </ValidatedForm>
    </Editor>
  );
}

function ResourceForm({
  action,
  item,
  locale,
  resourceTypes,
  retry,
}: {
  readonly action: ManagementAction;
  readonly item?: StaffResourceWorkspaceItemV1;
  readonly locale: Locale;
  readonly resourceTypes: readonly ResourceTypeChoiceV1[];
  readonly retry: TeamResourcesRetry | undefined;
}) {
  const message = (key: TeamResourcesMessageKey) =>
    getTeamResourcesMessage(locale, key);
  const prefix = item === undefined ? "new-resource" : `resource-${item.id}`;
  return (
    <Editor
      summary={item === undefined ? message("addResource") : message("editResource")}
    >
      <ValidatedForm action={action} invalidMessage={message("fieldError")}>
        <HiddenContext formId={prefix} locale={locale} retry={retry} />
        <input name="resourceId" type="hidden" value={item?.id ?? ""} />
        <input name="expectedRevision" type="hidden" value={item?.revision ?? ""} />
        <FieldGroup columns={2}>
          <ChoiceField
            choices={resourceTypes}
            id={`${prefix}-type`}
            label={message("resourceTypeId")}
            name="resourceTypeId"
            value={item?.resourceTypeId ?? undefined}
          />
          <Field>
            <Label htmlFor={`${prefix}-key`}>
              {message("key")}
              <RequiredMark />
            </Label>
            <Input
              autoComplete="off"
              defaultValue={item?.key ?? ""}
              dir="ltr"
              id={`${prefix}-key`}
              maxLength={80}
              name="key"
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              required
            />
          </Field>
          <Field>
            <Label htmlFor={`${prefix}-name`}>
              {message("publicName")}
              <RequiredMark />
            </Label>
            <Input
              defaultValue={item?.name}
              id={`${prefix}-name`}
              maxLength={160}
              name="publicName"
              required
            />
          </Field>
          <Field>
            <Label htmlFor={`${prefix}-status`}>{message("status")}</Label>
            <ChoiceSelect
              defaultValue={item?.status === "maintenance" ? "maintenance" : "active"}
              id={`${prefix}-status`}
              name="status"
              options={[
                { value: "active", label: message("active") },
                { value: "maintenance", label: message("maintenance") },
              ]}
            />
          </Field>
          <Field className="md:col-span-2">
            <Label htmlFor={`${prefix}-notes`}>{message("internalNotes")}</Label>
            <Textarea
              defaultValue={item?.internalNotes ?? ""}
              id={`${prefix}-notes`}
              maxLength={2000}
              name="internalNotes"
              rows={3}
            />
          </Field>
          <ReasonField id={`${prefix}-reason`} locale={locale} />
        </FieldGroup>
        <FormActions>
          <Button type="submit">
            {message(item === undefined ? "submitResource" : "saveResource")}
          </Button>
        </FormActions>
      </ValidatedForm>
    </Editor>
  );
}

function RequirementForm({
  action,
  locale,
  resourceTypes,
  retry,
  services,
}: {
  readonly action: ManagementAction;
  readonly locale: Locale;
  readonly resourceTypes: readonly ResourceTypeChoiceV1[];
  readonly retry: TeamResourcesRetry | undefined;
  readonly services: readonly StaffResourceChoiceV1[];
}) {
  const message = (key: TeamResourcesMessageKey) =>
    getTeamResourcesMessage(locale, key);
  return (
    <Editor summary={message("resourceRequirement")}>
      <ValidatedForm action={action} invalidMessage={message("fieldError")}>
        <HiddenContext formId="resource-requirement" locale={locale} retry={retry} />
        <FieldGroup columns={2}>
          <ChoiceField
            choices={services}
            id="requirement-service"
            label={message("serviceId")}
            name="serviceId"
          />
          <ChoiceField
            choices={resourceTypes}
            id="requirement-type"
            label={message("resourceTypeId")}
            name="resourceTypeId"
          />
          <Field>
            <Label htmlFor="requirement-state">{message("resourceRequired")}</Label>
            <ChoiceSelect
              defaultValue="true"
              id="requirement-state"
              name="required"
              options={[
                { value: "true", label: message("setEligible") },
                { value: "false", label: message("setIneligible") },
              ]}
            />
          </Field>
          <ReasonField id="requirement-reason" locale={locale} />
        </FieldGroup>
        <FormActions>
          <Button type="submit">{message("updateRequirement")}</Button>
        </FormActions>
      </ValidatedForm>
    </Editor>
  );
}

function EligibilityForm({
  action,
  item,
  locale,
  locations,
  retry,
  services,
}: {
  readonly action: ManagementAction;
  readonly item: StaffResourceWorkspaceItemV1;
  readonly locale: Locale;
  readonly locations: readonly StaffResourceChoiceV1[];
  readonly retry: TeamResourcesRetry | undefined;
  readonly services: readonly StaffResourceChoiceV1[];
}) {
  const message = (key: TeamResourcesMessageKey) =>
    getTeamResourcesMessage(locale, key);
  const prefix = `${item.kind}-${item.id}-eligibility`;
  return (
    <Editor
      summary={
        item.kind === "staff"
          ? message("updateEligibility")
          : message("resourceLocationEligibility")
      }
    >
      <ValidatedForm action={action} invalidMessage={message("fieldError")}>
        <HiddenContext formId={prefix} locale={locale} retry={retry} />
        <input
          name={item.kind === "staff" ? "staffId" : "resourceId"}
          type="hidden"
          value={item.id}
        />
        <FieldGroup columns={2}>
          {item.kind === "staff" ? (
            <ChoiceField
              choices={services}
              id={`${prefix}-service`}
              label={message("serviceId")}
              name="serviceId"
            />
          ) : null}
          <ChoiceField
            choices={locations}
            id={`${prefix}-location`}
            label={message("locationId")}
            name="locationId"
          />
          <Field>
            <Label htmlFor={`${prefix}-state`}>{message("updateEligibility")}</Label>
            <ChoiceSelect
              defaultValue="true"
              id={`${prefix}-state`}
              name="eligible"
              options={[
                { value: "true", label: message("setEligible") },
                { value: "false", label: message("setIneligible") },
              ]}
            />
          </Field>
          <ReasonField id={`${prefix}-reason`} locale={locale} />
        </FieldGroup>
        <FormActions>
          <Button type="submit" variant="outline">
            {message("updateEligibility")}
          </Button>
        </FormActions>
      </ValidatedForm>
    </Editor>
  );
}

function DeactivationForm({
  action,
  item,
  locale,
  replacements,
  retry,
}: {
  readonly action: ManagementAction;
  readonly item: StaffResourceWorkspaceItemV1;
  readonly locale: Locale;
  readonly replacements: readonly StaffResourceWorkspaceItemV1[];
  readonly retry: TeamResourcesRetry | undefined;
}) {
  const message = (key: TeamResourcesMessageKey) =>
    getTeamResourcesMessage(locale, key);
  const prefix = `${item.kind}-${item.id}-deactivation`;
  const replacementName =
    item.kind === "staff" ? "replacementStaffId" : "replacementResourceId";
  return (
    <Editor summary={message("deactivate")} tone="danger">
      <ValidatedForm action={action} invalidMessage={message("fieldError")}>
        <HiddenContext formId={prefix} locale={locale} retry={retry} />
        <input
          name={item.kind === "staff" ? "staffId" : "resourceId"}
          type="hidden"
          value={item.id}
        />
        <FieldGroup columns={2}>
          <Field>
            <Label htmlFor={`${prefix}-resolution`}>
              {message("deactivateResolution")}
            </Label>
            <ChoiceSelect
              defaultValue="defer"
              id={`${prefix}-resolution`}
              name="resolution"
              options={[
                { value: "defer", label: message("deferDeactivation") },
                { value: "cancel", label: message("cancelFuture") },
                {
                  value: "reassign",
                  label: message("reassignFuture"),
                  disabled: replacements.length === 0,
                },
              ]}
            />
          </Field>
          <Field>
            <Label htmlFor={`${prefix}-replacement`}>
              {message(
                item.kind === "staff" ? "replacementStaff" : "replacementResource",
              )}
              {replacements.length > 0 ? <RequiredMark /> : null}
            </Label>
            <ChoiceSelect
              defaultValue={replacements.at(0)?.id ?? ""}
              disabled={replacements.length === 0}
              id={`${prefix}-replacement`}
              name={replacementName}
              required={replacements.length > 0}
              placeholder="—"
              options={replacements.map((replacement) => ({
                value: replacement.id,
                label: replacement.name,
              }))}
            />
          </Field>
          <ReasonField id={`${prefix}-reason`} locale={locale} />
        </FieldGroup>
        <FormActions>
          <Button type="submit" variant="destructive">
            {message("submitDeactivation")}
          </Button>
        </FormActions>
      </ValidatedForm>
    </Editor>
  );
}

function ItemList({
  action,
  canDeactivate,
  deactivateAction,
  canEdit,
  canManageEligibility,
  editAction,
  emptyMessage,
  items,
  locale,
  members = [],
  locations,
  resourceTypes,
  retry,
  services,
}: {
  readonly action: ManagementAction;
  readonly canDeactivate: boolean;
  readonly deactivateAction: ManagementAction;
  readonly canEdit: boolean;
  readonly canManageEligibility: boolean;
  readonly editAction: ManagementAction;
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
      {items.map((item) => (
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
                    <StaffForm
                      action={editAction}
                      item={item}
                      members={members}
                      locale={locale}
                      retry={retry}
                    />
                  ) : (
                    <ResourceForm
                      action={editAction}
                      item={item}
                      locale={locale}
                      resourceTypes={resourceTypes}
                      retry={retry}
                    />
                  )
                ) : null}
                {canManageEligibility ? (
                  <EligibilityForm
                    action={action}
                    item={item}
                    locale={locale}
                    locations={locations}
                    retry={retry}
                    services={services}
                  />
                ) : null}
                {canDeactivate && item.status !== "inactive" ? (
                  <DeactivationForm
                    action={deactivateAction}
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
                    retry={retry}
                  />
                ) : null}
              </div>
            ) : null}
          </article>
        </li>
      ))}
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
              <StaffForm
                action={actions.saveStaffProfile}
                members={members}
                locale={locale}
                retry={retry}
              />
            ) : null}
            {canManageCatalog ? (
              <>
                <ResourceTypeForm
                  action={actions.saveResourceType}
                  locale={locale}
                  retry={retry}
                />
                {state.workspace.resourceTypes.map((resourceType) => (
                  <ResourceTypeForm
                    action={actions.saveResourceType}
                    key={resourceType.id}
                    locale={locale}
                    resourceType={resourceType}
                    retry={retry}
                  />
                ))}
                <ResourceForm
                  action={actions.saveResource}
                  locale={locale}
                  resourceTypes={state.workspace.resourceTypes}
                  retry={retry}
                />
                <RequirementForm
                  action={actions.setResourceRequirement}
                  locale={locale}
                  resourceTypes={state.workspace.resourceTypes}
                  retry={retry}
                  services={state.workspace.services}
                />
              </>
            ) : null}
          </div>
        ) : null}
      </Section>
      <div className="grid gap-8 xl:grid-cols-2">
        <Section id="staff-list" title={message("staffTitle")}>
          <ItemList
            action={actions.setStaffEligibility}
            canDeactivate={canManageStaff}
            deactivateAction={actions.deactivateStaff}
            canEdit={canManageStaff}
            canManageEligibility={canManageStaffEligibility}
            editAction={actions.saveStaffProfile}
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
            action={actions.setResourceLocationEligibility}
            canDeactivate={canManageStaff}
            deactivateAction={actions.deactivateResource}
            canEdit={canManageCatalog}
            canManageEligibility={canManageResourceEligibility}
            editAction={actions.saveResource}
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
