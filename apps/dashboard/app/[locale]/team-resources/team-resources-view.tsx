import type {
  CapabilityName,
  DashboardContextV1,
  ResourceTypeChoiceV1,
  StaffResourceChoiceV1,
  StaffResourceWorkspaceItemV1,
} from "@wlbp/api-contracts";
import { formatNumber, type Locale } from "@wlbp/i18n";
import { Badge, Surface } from "@wlbp/ui-foundation";

import {
  getTeamResourcesMessage,
  type TeamResourcesMessageKey,
} from "../../_lib/team-resources-copy";
import type { TeamResourcesWorkspaceState } from "../../_lib/team-resources-workspace";
import type { TeamResourcesRetry } from "../../_lib/team-resources-retry";
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
      <div role="alert">
        <Surface as="section" className="team-resources-notice">
          <p>{message("backendUnavailable")}</p>
        </Surface>
      </div>
    );
  }
  if (state.kind !== "access-unavailable") return null;
  if (state.reason === "location-scope-unavailable") {
    return (
      <Surface
        as="section"
        className="team-resources-notice"
        labelledBy="location-scope-title"
      >
        <h2 id="location-scope-title">{message("locationScopeTitle")}</h2>
        <p>{message("locationScopeSummary")}</p>
      </Surface>
    );
  }
  if (state.reason === "step-up-required") {
    return (
      <Surface
        as="section"
        className="team-resources-notice"
        labelledBy="team-step-up-title"
      >
        <h2 id="team-step-up-title">{message("stepUpTitle")}</h2>
        <p>{message("stepUpSummary")}</p>
      </Surface>
    );
  }
  return (
    <div role="alert">
      <Surface as="section" className="team-resources-notice">
        <p>{message("backendUnavailable")}</p>
      </Surface>
    </div>
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
    <dl className="team-resource-facts">
      {item.resourceTypeName === null ? null : (
        <div>
          <dt>{message("resourceType")}</dt>
          <dd>{item.resourceTypeName}</dd>
        </div>
      )}
      <div>
        <dt>{message("locations")}</dt>
        <dd>{formatNumber(item.locationIds.length, locale)}</dd>
      </div>
      <div>
        <dt>{message("services")}</dt>
        <dd>{formatNumber(item.serviceIds.length, locale)}</dd>
      </div>
      <div>
        <dt>{message("futureAllocations")}</dt>
        <dd>{formatNumber(item.futureAllocationCount, locale)}</dd>
      </div>
    </dl>
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

function UuidField({
  id,
  label,
  list,
  name,
  required = true,
  value,
}: {
  readonly id: string;
  readonly label: string;
  readonly list?: string;
  readonly name: string;
  readonly required?: boolean;
  readonly value?: string | undefined;
}) {
  return (
    <label className="team-resource-field" htmlFor={id}>
      <span>{label}</span>
      <input
        autoComplete="off"
        className="wlbp-field__input"
        defaultValue={value}
        id={id}
        {...(list === undefined ? {} : { list })}
        name={name}
        pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
        required={required}
      />
    </label>
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
    <label className="team-resource-field" htmlFor={id}>
      <span>{label}</span>
      <select
        className="wlbp-field__input"
        defaultValue={value ?? ""}
        id={id}
        name={name}
        required={required}
      >
        <option value="">—</option>
        {choices.map((choice) => (
          <option key={choice.id} value={choice.id}>
            {choice.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function ReasonField({ id, locale }: { readonly id: string; readonly locale: Locale }) {
  const message = (key: TeamResourcesMessageKey) =>
    getTeamResourcesMessage(locale, key);
  return (
    <label className="team-resource-field" htmlFor={id}>
      <span>{message("deactivateReason")}</span>
      <input
        className="wlbp-field__input"
        id={id}
        maxLength={500}
        name="reason"
        required
      />
    </label>
  );
}

function StaffForm({
  action,
  item,
  locale,
  retry,
}: {
  readonly action: ManagementAction;
  readonly item?: StaffResourceWorkspaceItemV1;
  readonly locale: Locale;
  readonly retry: TeamResourcesRetry | undefined;
}) {
  const message = (key: TeamResourcesMessageKey) =>
    getTeamResourcesMessage(locale, key);
  const prefix = item === undefined ? "new-staff" : `staff-${item.id}`;
  return (
    <details className="team-resource-editor">
      <summary>
        {item === undefined ? message("addStaff") : message("editStaff")}
      </summary>
      <ValidatedForm action={action} invalidMessage={message("fieldError")}>
        <HiddenContext formId={prefix} locale={locale} retry={retry} />
        <input name="staffId" type="hidden" value={item?.id ?? ""} />
        <input name="expectedRevision" type="hidden" value={item?.revision ?? ""} />
        <label className="team-resource-field" htmlFor={`${prefix}-name`}>
          <span>{message("publicName")}</span>
          <input
            className="wlbp-field__input"
            defaultValue={item?.name}
            id={`${prefix}-name`}
            maxLength={160}
            name="publicName"
            required
          />
        </label>
        <UuidField
          id={`${prefix}-membership`}
          label={message("membershipId")}
          name="membershipId"
          required={false}
          value={item?.membershipId ?? undefined}
        />
        <label className="team-resource-field" htmlFor={`${prefix}-bio`}>
          <span>{message("publicBio")}</span>
          <textarea
            defaultValue={item?.publicBio ?? ""}
            id={`${prefix}-bio`}
            maxLength={2000}
            name="bio"
            rows={3}
          />
        </label>
        <label className="team-resource-field" htmlFor={`${prefix}-notes`}>
          <span>{message("internalNotes")}</span>
          <textarea
            defaultValue={item?.internalNotes ?? ""}
            id={`${prefix}-notes`}
            maxLength={2000}
            name="internalNotes"
            rows={3}
          />
        </label>
        <label className="team-resource-field" htmlFor={`${prefix}-hours`}>
          <span>{message("offeredHours")}</span>
          <input
            className="wlbp-field__input"
            defaultValue={item?.offeredHoursPerWeek ?? 40}
            id={`${prefix}-hours`}
            max="168"
            min="0.25"
            name="offeredHoursPerWeek"
            required
            step="0.25"
            type="number"
          />
        </label>
        <ReasonField id={`${prefix}-reason`} locale={locale} />
        <button className="wlbp-button" type="submit">
          {message(item === undefined ? "submitStaff" : "saveStaff")}
        </button>
      </ValidatedForm>
    </details>
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
    <details className="team-resource-editor">
      <summary>
        {resourceType === undefined
          ? message("addResourceType")
          : message("editResourceType")}
      </summary>
      <ValidatedForm action={action} invalidMessage={message("fieldError")}>
        <HiddenContext formId={prefix} locale={locale} retry={retry} />
        <input name="resourceTypeId" type="hidden" value={resourceType?.id ?? ""} />
        <input
          name="expectedRevision"
          type="hidden"
          value={resourceType?.revision ?? ""}
        />
        <input name="exclusive" type="hidden" value="true" />
        <label
          className="team-resource-field"
          htmlFor={`type-${resourceType?.id ?? "new"}-key`}
        >
          <span>{message("key")}</span>
          <input
            autoComplete="off"
            className="wlbp-field__input"
            defaultValue={resourceType?.key}
            id={`type-${resourceType?.id ?? "new"}-key`}
            maxLength={80}
            name="key"
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            required
          />
        </label>
        <label
          className="team-resource-field"
          htmlFor={`type-${resourceType?.id ?? "new"}-name`}
        >
          <span>{message("name")}</span>
          <input
            className="wlbp-field__input"
            defaultValue={resourceType?.name}
            id={`type-${resourceType?.id ?? "new"}-name`}
            maxLength={160}
            name="name"
            required
          />
        </label>
        <ReasonField id={`type-${resourceType?.id ?? "new"}-reason`} locale={locale} />
        <button className="wlbp-button" type="submit">
          {message(
            resourceType === undefined ? "submitResourceType" : "saveResourceType",
          )}
        </button>
      </ValidatedForm>
    </details>
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
    <details className="team-resource-editor">
      <summary>
        {item === undefined ? message("addResource") : message("editResource")}
      </summary>
      <ValidatedForm action={action} invalidMessage={message("fieldError")}>
        <HiddenContext formId={prefix} locale={locale} retry={retry} />
        <input name="resourceId" type="hidden" value={item?.id ?? ""} />
        <input name="expectedRevision" type="hidden" value={item?.revision ?? ""} />
        <ChoiceField
          choices={resourceTypes}
          id={`${prefix}-type`}
          label={message("resourceTypeId")}
          name="resourceTypeId"
          value={item?.resourceTypeId ?? undefined}
        />
        <label className="team-resource-field" htmlFor={`${prefix}-key`}>
          <span>{message("key")}</span>
          <input
            autoComplete="off"
            className="wlbp-field__input"
            defaultValue={item?.key ?? ""}
            id={`${prefix}-key`}
            maxLength={80}
            name="key"
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            required
          />
        </label>
        <label className="team-resource-field" htmlFor={`${prefix}-name`}>
          <span>{message("publicName")}</span>
          <input
            className="wlbp-field__input"
            defaultValue={item?.name}
            id={`${prefix}-name`}
            maxLength={160}
            name="publicName"
            required
          />
        </label>
        <label className="team-resource-field" htmlFor={`${prefix}-notes`}>
          <span>{message("internalNotes")}</span>
          <textarea
            defaultValue={item?.internalNotes ?? ""}
            id={`${prefix}-notes`}
            maxLength={2000}
            name="internalNotes"
            rows={3}
          />
        </label>
        <label className="team-resource-field" htmlFor={`${prefix}-status`}>
          <span>{message("status")}</span>
          <select
            className="wlbp-field__input"
            defaultValue={item?.status === "maintenance" ? "maintenance" : "active"}
            id={`${prefix}-status`}
            name="status"
          >
            <option value="active">{message("active")}</option>
            <option value="maintenance">{message("maintenance")}</option>
          </select>
        </label>
        <ReasonField id={`${prefix}-reason`} locale={locale} />
        <button className="wlbp-button" type="submit">
          {message(item === undefined ? "submitResource" : "saveResource")}
        </button>
      </ValidatedForm>
    </details>
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
    <details className="team-resource-editor">
      <summary>{message("resourceRequirement")}</summary>
      <ValidatedForm action={action} invalidMessage={message("fieldError")}>
        <HiddenContext formId="resource-requirement" locale={locale} retry={retry} />
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
        <label className="team-resource-field" htmlFor="requirement-state">
          <span>{message("resourceRequired")}</span>
          <select
            className="wlbp-field__input"
            defaultValue="true"
            id="requirement-state"
            name="required"
          >
            <option value="true">{message("setEligible")}</option>
            <option value="false">{message("setIneligible")}</option>
          </select>
        </label>
        <ReasonField id="requirement-reason" locale={locale} />
        <button className="wlbp-button" type="submit">
          {message("updateRequirement")}
        </button>
      </ValidatedForm>
    </details>
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
    <details className="team-resource-editor">
      <summary>
        {item.kind === "staff"
          ? message("updateEligibility")
          : message("resourceLocationEligibility")}
      </summary>
      <ValidatedForm action={action} invalidMessage={message("fieldError")}>
        <HiddenContext formId={prefix} locale={locale} retry={retry} />
        <input
          name={item.kind === "staff" ? "staffId" : "resourceId"}
          type="hidden"
          value={item.id}
        />
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
        <label className="team-resource-field" htmlFor={`${prefix}-state`}>
          <span>{message("updateEligibility")}</span>
          <select
            className="wlbp-field__input"
            defaultValue="true"
            id={`${prefix}-state`}
            name="eligible"
          >
            <option value="true">{message("setEligible")}</option>
            <option value="false">{message("setIneligible")}</option>
          </select>
        </label>
        <ReasonField id={`${prefix}-reason`} locale={locale} />
        <button className="wlbp-button wlbp-button--secondary" type="submit">
          {message("updateEligibility")}
        </button>
      </ValidatedForm>
    </details>
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
    <details className="team-resource-editor team-resource-editor--danger">
      <summary>{message("deactivate")}</summary>
      <ValidatedForm action={action} invalidMessage={message("fieldError")}>
        <HiddenContext formId={prefix} locale={locale} retry={retry} />
        <input
          name={item.kind === "staff" ? "staffId" : "resourceId"}
          type="hidden"
          value={item.id}
        />
        <label className="team-resource-field" htmlFor={`${prefix}-resolution`}>
          <span>{message("deactivateResolution")}</span>
          <select
            className="wlbp-field__input"
            defaultValue="defer"
            id={`${prefix}-resolution`}
            name="resolution"
          >
            <option value="defer">{message("deferDeactivation")}</option>
            <option value="cancel">{message("cancelFuture")}</option>
            <option disabled={replacements.length === 0} value="reassign">
              {message("reassignFuture")}
            </option>
          </select>
        </label>
        <label className="team-resource-field" htmlFor={`${prefix}-replacement`}>
          <span>
            {message(
              item.kind === "staff" ? "replacementStaff" : "replacementResource",
            )}
          </span>
          <select
            className="wlbp-field__input"
            defaultValue={replacements.at(0)?.id ?? ""}
            disabled={replacements.length === 0}
            id={`${prefix}-replacement`}
            name={replacementName}
            required={replacements.length > 0}
          >
            <option value="">—</option>
            {replacements.map((replacement) => (
              <option key={replacement.id} value={replacement.id}>
                {replacement.name}
              </option>
            ))}
          </select>
        </label>
        <ReasonField id={`${prefix}-reason`} locale={locale} />
        <button className="wlbp-button wlbp-button--danger" type="submit">
          {message("submitDeactivation")}
        </button>
      </ValidatedForm>
    </details>
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
  readonly locations: readonly StaffResourceChoiceV1[];
  readonly resourceTypes: readonly ResourceTypeChoiceV1[];
  readonly retry: TeamResourcesRetry | undefined;
  readonly services: readonly StaffResourceChoiceV1[];
}) {
  const message = (key: TeamResourcesMessageKey) =>
    getTeamResourcesMessage(locale, key);
  if (items.length === 0) return <p>{message(emptyMessage)}</p>;
  return (
    <ul className="team-resource-list">
      {items.map((item) => (
        <li key={item.id}>
          <article>
            <header>
              <h3>{item.name}</h3>
              <Badge
                tone={
                  item.status === "active"
                    ? "positive"
                    : item.status === "maintenance" ||
                        item.status === "deactivation_pending"
                      ? "warning"
                      : "neutral"
                }
              >
                {message(statusKey(item.status))}
              </Badge>
            </header>
            <ItemFacts item={item} locale={locale} />
            {canEdit ? (
              item.kind === "staff" ? (
                <StaffForm
                  action={editAction}
                  item={item}
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

export function TeamResourcesView({
  actions,
  locale,
  result,
  retry,
  state,
}: TeamResourcesViewProps) {
  const message = (key: TeamResourcesMessageKey) =>
    getTeamResourcesMessage(locale, key);
  const intro = (
    <section className="dashboard-intro team-resources-intro">
      <h1 id="team-resources-title">{message("title")}</h1>
      <p>{message("summary")}</p>
    </section>
  );
  if (state.kind !== "ready")
    return (
      <>
        {intro}
        <UnavailableState locale={locale} state={state} />
      </>
    );
  const staff = state.workspace.items.filter((item) => item.kind === "staff");
  const resources = state.workspace.items.filter((item) => item.kind === "resource");
  const canManageStaff = hasTenantCapability(state.context, "staff.manage");
  const canManageCatalog = hasTenantCapability(state.context, "catalog.edit");
  const canManageStaffEligibility = hasCapability(state.context, "staff.manage");
  const canManageResourceEligibility = hasCapability(state.context, "catalog.edit");
  return (
    <>
      {intro}
      <p className="team-resources-result" role="status" aria-live="polite">
        {result === undefined ? "" : message(resultKey(result))}
      </p>
      <Surface
        as="section"
        className="team-resources-management"
        labelledBy="team-resources-management-title"
      >
        <h2 id="team-resources-management-title">{message("createStaff")}</h2>
        <p>{message("createEditUnavailable")}</p>
        <div className="team-resource-form-grid">
          {canManageStaff ? (
            <StaffForm
              action={actions.saveStaffProfile}
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
      </Surface>
      <div className="team-resources-columns">
        <Surface
          as="section"
          className="team-resources-section"
          labelledBy="staff-list-title"
        >
          <h2 id="staff-list-title">{message("staffTitle")}</h2>
          <ItemList
            action={actions.setStaffEligibility}
            canDeactivate={canManageStaff}
            deactivateAction={actions.deactivateStaff}
            canEdit={canManageStaff}
            canManageEligibility={canManageStaffEligibility}
            editAction={actions.saveStaffProfile}
            emptyMessage="staffEmpty"
            items={staff}
            locale={locale}
            locations={state.workspace.locations}
            resourceTypes={state.workspace.resourceTypes}
            retry={retry}
            services={state.workspace.services}
          />
        </Surface>
        <Surface
          as="section"
          className="team-resources-section"
          labelledBy="resource-list-title"
        >
          <h2 id="resource-list-title">{message("resourcesTitle")}</h2>
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
        </Surface>
      </div>
    </>
  );
}
