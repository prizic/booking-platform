import type { StaffResourceWorkspaceItemV1 } from "@wlbp/api-contracts";
import { formatNumber, type Locale } from "@wlbp/i18n";
import { Badge, Surface } from "@wlbp/ui-foundation";

import {
  getTeamResourcesMessage,
  type TeamResourcesMessageKey,
} from "../../_lib/team-resources-copy";
import type { TeamResourcesWorkspaceState } from "../../_lib/team-resources-workspace";

interface TeamResourcesViewProps {
  readonly locale: Locale;
  readonly state: TeamResourcesWorkspaceState;
}

function statusKey(
  status: StaffResourceWorkspaceItemV1["status"],
): TeamResourcesMessageKey {
  return status === "deactivation_pending" ? "deactivationPending" : status;
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

function ItemList({
  emptyMessage,
  items,
  locale,
}: {
  readonly emptyMessage: TeamResourcesMessageKey;
  readonly items: readonly StaffResourceWorkspaceItemV1[];
  readonly locale: Locale;
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
            {item.status === "active" ? (
              <button
                aria-describedby="management-api-note"
                className="wlbp-button wlbp-button--secondary"
                disabled
                type="button"
              >
                {message("deactivate")}
              </button>
            ) : null}
          </article>
        </li>
      ))}
    </ul>
  );
}

export function TeamResourcesView({ locale, state }: TeamResourcesViewProps) {
  const message = (key: TeamResourcesMessageKey) =>
    getTeamResourcesMessage(locale, key);
  const intro = (
    <section className="dashboard-intro team-resources-intro">
      <h1 id="team-resources-title">{message("title")}</h1>
      <p>{message("summary")}</p>
    </section>
  );
  if (state.kind !== "ready") {
    return (
      <>
        {intro}
        <UnavailableState locale={locale} state={state} />
      </>
    );
  }

  const staff = state.workspace.items.filter((item) => item.kind === "staff");
  const resources = state.workspace.items.filter((item) => item.kind === "resource");

  return (
    <>
      {intro}
      <Surface as="section" className="team-resources-management">
        <div>
          <button
            aria-describedby="management-api-note"
            className="wlbp-button"
            disabled
            type="button"
          >
            {message("addStaff")}
          </button>
          <button
            aria-describedby="management-api-note"
            className="wlbp-button wlbp-button--secondary"
            disabled
            type="button"
          >
            {message("addResource")}
          </button>
        </div>
        <p id="management-api-note">{message("createEditUnavailable")}</p>
      </Surface>
      <div className="team-resources-columns">
        <Surface
          as="section"
          className="team-resources-section"
          labelledBy="staff-list-title"
        >
          <h2 id="staff-list-title">{message("staffTitle")}</h2>
          <ItemList emptyMessage="staffEmpty" items={staff} locale={locale} />
        </Surface>
        <Surface
          as="section"
          className="team-resources-section"
          labelledBy="resource-list-title"
        >
          <h2 id="resource-list-title">{message("resourcesTitle")}</h2>
          <ItemList emptyMessage="resourcesEmpty" items={resources} locale={locale} />
        </Surface>
      </div>
    </>
  );
}
