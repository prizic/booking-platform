import type { Locale } from "@wlbp/i18n";
import { parseScheduleWorkspaceV1 } from "@wlbp/api-contracts";
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
  try {
    const hostname = extractRequestHostname(await headers(), {
      runtimeEnvironment,
      ...(process.env.LOCAL_TENANT_HOST
        ? { localFallback: process.env.LOCAL_TENANT_HOST }
        : {}),
    });
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
            <input name="scopeId" type="hidden" value={scope?.id ?? ""} />
            <input name="operation" type="hidden" value="weekly" />
            <input
              name="expectedRevision"
              type="hidden"
              value={scope?.revision ?? ""}
            />
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
            <button className="wlbp-button" type="submit">
              {message("scheduleSave")}
            </button>
          </form>
        )}
      </Surface>
    </main>
  );
}
