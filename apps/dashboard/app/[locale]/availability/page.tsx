import { formatDateTime, type Locale } from "@wlbp/i18n";
import {
  parseAvailabilityV1Request,
  parseScheduleWorkspaceV1,
  type AvailabilityV1Response,
} from "@wlbp/api-contracts";
import {
  extractRequestHostname,
  type RuntimeEnvironment,
} from "@wlbp/tenant-resolution";
import { Surface } from "@wlbp/ui-foundation";
import { headers } from "next/headers";

import { getDashboardMessage } from "../../_lib/copy";
import { createDashboardRequestDataSource } from "../../_lib/dashboard-server";
import { loadDashboardAccess } from "../../_lib/dashboard-access";
import { saveSchedule } from "../actions";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AvailabilityPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const query = await searchParams;
  const source = await createDashboardRequestDataSource();
  const identity = source === null ? null : await source.getVerifiedIdentity();
  const configured = process.env.WLBP_RUNTIME_ENV;
  const runtimeEnvironment: RuntimeEnvironment =
    configured === "local" ||
    configured === "test" ||
    configured === "development" ||
    configured === "preview" ||
    configured === "production"
      ? configured
      : process.env.NODE_ENV === "production"
        ? "production"
        : "development";
  let tenant: string | null = null;
  let requestHostname: string | null = null;
  try {
    const hostname = extractRequestHostname(await headers(), {
      runtimeEnvironment,
      ...(process.env.LOCAL_TENANT_HOST
        ? { localFallback: process.env.LOCAL_TENANT_HOST }
        : {}),
    });
    requestHostname = hostname;
    const access = await loadDashboardAccess({ hostname, locale }, source!);
    if (access.kind === "ready") tenant = access.context.tenantId;
  } catch {
    /* the unavailable copy is intentionally non-disclosing */
  }
  const message = (key: Parameters<typeof getDashboardMessage>[1]) =>
    getDashboardMessage(locale, key);
  const rows =
    source?.getScheduleWorkspace && tenant && identity
      ? parseScheduleWorkspaceV1(
          await source.getScheduleWorkspace(tenant).catch(() => []),
        )
      : [];
  const scope = rows.find((row) => row.kind === "scope");
  let availability: AvailabilityV1Response | null = null;
  let availabilityError = false;
  const queryValue = (key: string) =>
    typeof query[key] === "string" ? query[key] : undefined;
  if (
    source?.getAvailability &&
    tenant &&
    identity &&
    requestHostname &&
    queryValue("serviceId") &&
    queryValue("locationId") &&
    queryValue("startAfter") &&
    queryValue("endBefore")
  ) {
    try {
      availability = await source.getAvailability(
        requestHostname,
        parseAvailabilityV1Request({
          endBefore: queryValue("endBefore"),
          locale,
          locationId: queryValue("locationId"),
          partySize: Number(queryValue("partySize") ?? "1"),
          serviceId: queryValue("serviceId"),
          staffPreferenceId: queryValue("staffPreferenceId") || null,
          startAfter: queryValue("startAfter"),
          timeZone: queryValue("timeZone") ?? "UTC",
        }),
      );
    } catch {
      availabilityError = true;
    }
  }
  const error = typeof query.error === "string" ? query.error : null;
  return (
    <main className="dashboard-main" dir={locale === "ar" ? "rtl" : "ltr"}>
      <header className="dashboard-intro">
        <p>{message("eyebrow")}</p>
        <h1>{message("availabilityTitle")}</h1>
        <p>{message("availabilitySummary")}</p>
      </header>
      <Surface
        as="section"
        className="access-panel"
        aria-labelledby="schedule-editor-title"
      >
        <h2 id="schedule-editor-title">{message("scheduleEditorTitle")}</h2>
        {error ? <p role="alert">{message("scheduleSaveError")}</p> : null}
        {query.saved === "1" ? <p role="status">{message("scheduleSaved")}</p> : null}
        {!tenant || !identity ? (
          <p>{message("scheduleUnavailable")}</p>
        ) : (
          <form action={saveSchedule} className="schedule-editor">
            <input name="locale" type="hidden" value={locale} />
            <input name="tenantId" type="hidden" value={tenant} />
            <label>
              {message("scheduleOperationLabel")}
              <select defaultValue="weekly" name="operation">
                <option value="scope">{message("scheduleScopeOption")}</option>
                <option value="weekly">{message("scheduleWeeklyOption")}</option>
                <option value="break">{message("scheduleBreakOption")}</option>
                <option value="exception">{message("scheduleExceptionOption")}</option>
                <option value="time_off">{message("scheduleTimeOffOption")}</option>
                <option value="holiday">{message("scheduleHolidayOption")}</option>
                <option value="blackout">{message("scheduleBlackoutOption")}</option>
                <option value="maintenance">
                  {message("scheduleMaintenanceOption")}
                </option>
                <option value="policy">{message("schedulePolicyOption")}</option>
              </select>
            </label>
            <label>
              {message("scheduleScopeLabel")}
              <select name="scopeId" defaultValue={scope?.id ?? ""}>
                <option value="">{message("scheduleNewScopeOption")}</option>
                {rows
                  .filter((row) => row.kind === "scope")
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.id} · {row.timeZone}
                    </option>
                  ))}
              </select>
            </label>
            <input
              name="expectedRevision"
              type="hidden"
              value={scope?.revision ?? ""}
            />
            <label>
              {message("scheduleScopeKindLabel")}
              <select defaultValue="location" name="scopeKind">
                <option value="location">{message("scheduleLocationOption")}</option>
                <option value="staff">{message("scheduleStaffOption")}</option>
                <option value="resource">{message("scheduleResourceOption")}</option>
              </select>
            </label>
            <label>
              {message("scheduleLocationIdLabel")}
              <input name="locationId" />
            </label>
            <label>
              {message("scheduleStaffIdLabel")}
              <input name="staffId" />
            </label>
            <label>
              {message("scheduleResourceIdLabel")}
              <input name="resourceId" />
            </label>
            <label>
              {message("scheduleServiceIdLabel")}
              <input name="serviceId" />
            </label>
            <label>
              {message("scheduleDayLabel")}
              <input min="0" max="6" name="dayOfWeek" required type="number" />
            </label>
            <label>
              {message("scheduleStartLabel")}
              <input min="0" max="1439" name="startMinute" required type="number" />
            </label>
            <label>
              {message("scheduleEndLabel")}
              <input min="1" max="1440" name="endMinute" required type="number" />
            </label>
            <label>
              {message("timeZoneLabel")}
              <input defaultValue={scope?.timeZone ?? "UTC"} name="timeZone" required />
            </label>
            <label>
              {message("scheduleDateLabel")}
              <input name="localDate" type="date" />
            </label>
            <label>
              {message("scheduleExceptionKindLabel")}
              <select defaultValue="closed" name="exceptionKind">
                <option value="closed">{message("scheduleClosedOption")}</option>
                <option value="override">{message("scheduleOverrideOption")}</option>
              </select>
            </label>
            <label>
              {message("scheduleStartsAtLabel")}
              <input name="startsAt" type="datetime-local" />
            </label>
            <label>
              {message("scheduleEndsAtLabel")}
              <input name="endsAt" type="datetime-local" />
            </label>
            <label>
              {message("scheduleNameLabel")}
              <input name="name" />
            </label>
            <label>
              {message("scheduleReasonLabel")}
              <input name="reason" />
            </label>
            <label>
              {message("schedulePolicyKeyLabel")}
              <input name="policyKey" />
            </label>
            <label>
              {message("schedulePolicyValueLabel")}
              <input name="value" type="number" />
            </label>
            <button className="wlbp-button" type="submit">
              {message("scheduleSave")}
            </button>
          </form>
        )}
      </Surface>
      <Surface
        as="section"
        className="access-panel"
        aria-labelledby="availability-preview-title"
      >
        <h2 id="availability-preview-title">{message("availabilityPreviewTitle")}</h2>
        <p>{message("availabilityPreviewSummary")}</p>
        <form className="schedule-editor" method="get">
          <label>
            {message("scheduleServiceIdLabel")}
            <input defaultValue={queryValue("serviceId")} name="serviceId" required />
          </label>
          <label>
            {message("scheduleLocationIdLabel")}
            <input defaultValue={queryValue("locationId")} name="locationId" required />
          </label>
          <label>
            {message("availabilityStaffPreferenceLabel")}
            <input
              defaultValue={queryValue("staffPreferenceId")}
              name="staffPreferenceId"
            />
          </label>
          <label>
            {message("availabilityWindowStartLabel")}
            <input
              defaultValue={queryValue("startAfter")}
              name="startAfter"
              required
              type="text"
            />
          </label>
          <label>
            {message("availabilityWindowEndLabel")}
            <input
              defaultValue={queryValue("endBefore")}
              name="endBefore"
              required
              type="text"
            />
          </label>
          <label>
            {message("availabilityPartySizeLabel")}
            <input
              defaultValue={queryValue("partySize") ?? "1"}
              min="1"
              name="partySize"
              required
              type="number"
            />
          </label>
          <label>
            {message("availabilityCustomerTimeZone")}
            <input
              defaultValue={queryValue("timeZone") ?? "UTC"}
              name="timeZone"
              required
            />
          </label>
          <button className="wlbp-button" type="submit">
            {message("availabilityPreviewAction")}
          </button>
        </form>
        {availabilityError ? (
          <p role="alert">{message("availabilityPreviewError")}</p>
        ) : null}
        {availability ? (
          <div aria-live="polite">
            <p>
              {message("availabilityCustomerTimeZone")}: {availability.displayTimeZone}{" "}
              · {message("availabilityLocationTimeZone")}:{" "}
              {availability.locationTimeZone}
            </p>
            <p>{message("availabilityAdvisory")}</p>
            {availability.slots.length === 0 ? (
              <p>{message("availabilityNoSlots")}</p>
            ) : (
              <ul className="schedule-items">
                {availability.slots.map((slot) => (
                  <li key={`${slot.startAt}:${slot.staffId ?? "automatic"}`}>
                    <time dateTime={slot.startAt}>
                      {formatDateTime(
                        slot.startAt,
                        locale,
                        availability.displayTimeZone,
                      )}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </Surface>
    </main>
  );
}
