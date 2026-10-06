import { parseScheduleWorkspaceV1 } from "@wlbp/api-contracts";
import { formatDateTime, type Locale } from "@wlbp/i18n";
import { WorkspaceShell } from "../../_lib/workspace-shell";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { DashboardAccessPanel } from "../../_lib/dashboard-access-panel";
import { ScheduleForm, ScheduleRemove } from "./schedule-form";
import { scopeName } from "./schedule-scope";
import { scheduleMessage } from "./schedule-copy";
export const dynamic = "force-dynamic";
export default async function AvailabilityPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  const message = (key: Parameters<typeof scheduleMessage>[1]) =>
    scheduleMessage(locale, key);
  const request = await loadDashboardRequestAccess(locale);
  let body;
  if (request.state.kind !== "ready")
    body = <DashboardAccessPanel locale={locale} state={request.state} />;
  else if (
    !request.source?.getScheduleWorkspace ||
    !request.source.getScheduleChoices ||
    !request.source.getScheduleEditorDetails
  )
    body = <p role="alert">{message("unavailable")}</p>;
  else {
    const context = request.state.context;
    const { getScheduleWorkspace, getScheduleChoices, getScheduleEditorDetails } =
      request.source;
    const loaded = await (async () => {
      try {
        const tenant = context.tenantId;
        const [raw, choices, details] = await Promise.all([
          getScheduleWorkspace(tenant),
          getScheduleChoices(tenant),
          getScheduleEditorDetails(tenant),
        ]);
        const rows = parseScheduleWorkspaceV1(raw).map((row) => ({
          ...row,
          ...details.find((d) => d.id === row.id),
        }));
        return { rows, choices };
      } catch {
        return null;
      }
    })();
    if (loaded) {
      const { rows, choices } = loaded;
      body = (
        <>
          <section aria-labelledby="schedule-create">
            <h2 id="schedule-create">{message("create")}</h2>
            {choices.length ? (
              <ScheduleForm
                locale={locale}
                choices={choices}
                rows={rows}
                attempt={crypto.randomUUID()}
              />
            ) : (
              <p>{message("denied")}</p>
            )}
          </section>
          <section aria-labelledby="schedule-current">
            <h2 id="schedule-current">{message("existing")}</h2>
            {rows.length ? (
              rows.map((row) => (
                <article key={row.id} className="workspace-section">
                  <h3>
                    {message(row.kind)} · {scopeName(row, choices)}
                  </h3>
                  <p>
                    {row.localDate} {row.timeZone} · {message("revision")}{" "}
                    {row.revision}
                  </p>
                  {row.startsAt ? (
                    <p>
                      {formatDateTime(
                        row.startsAt,
                        locale,
                        row.timeZone ?? "Asia/Riyadh",
                      )}{" "}
                      –{" "}
                      {formatDateTime(
                        row.endsAt!,
                        locale,
                        row.timeZone ?? "Asia/Riyadh",
                      )}
                    </p>
                  ) : null}
                  {row.startMinute !== null ? (
                    <p>
                      <bdi>
                        {String(Math.floor(row.startMinute / 60)).padStart(2, "0")}:
                        {String(row.startMinute % 60).padStart(2, "0")} –{" "}
                        {row.endMinute === 1440
                          ? "24:00"
                          : `${String(Math.floor(row.endMinute! / 60)).padStart(2, "0")}:${String(row.endMinute! % 60).padStart(2, "0")}`}
                      </bdi>
                    </p>
                  ) : null}
                  <details>
                    <summary>{message("edit")}</summary>
                    <ScheduleForm
                      locale={locale}
                      record={row}
                      rows={rows}
                      choices={choices}
                      attempt={crypto.randomUUID()}
                    />
                  </details>
                  <ScheduleRemove
                    locale={locale}
                    record={row}
                    scopeRevision={
                      row.kind !== "scope" && row.scopeId
                        ? (rows.find((s) => s.id === row.scopeId)?.revision ?? null)
                        : null
                    }
                    attempt={crypto.randomUUID()}
                  />
                </article>
              ))
            ) : (
              <p>{message("empty")}</p>
            )}
          </section>
        </>
      );
    } else {
      body = <p role="alert">{message("unavailable")}</p>;
    }
  }
  return (
    <WorkspaceShell
      locale={locale}
      current="availability"
      labelledBy="availability-title"
    >
      <header className="dashboard-intro">
        <h1 id="availability-title">{message("title")}</h1>
        <p>{message("summary")}</p>
      </header>
      {body}
    </WorkspaceShell>
  );
}
