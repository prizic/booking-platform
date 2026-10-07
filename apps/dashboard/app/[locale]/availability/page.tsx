import { parseScheduleWorkspaceV1 } from "@wlbp/api-contracts";
import { formatNumber, type Locale } from "@wlbp/i18n";
import { formatWhen } from "../../_lib/booking-display";
import {
  Alert,
  AlertDescription,
  EmptyState,
  PageHeader,
  Section,
  StatusStamp,
} from "@wlbp/ui-foundation";
import { CalendarClock, ChevronDown } from "lucide-react";
import { WorkspaceShell } from "../../_lib/workspace-shell";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { DashboardAccessPanel } from "../../_lib/dashboard-access-panel";
import { ScheduleForm, ScheduleRemove } from "./schedule-form";
import { scopeName } from "./schedule-scope";
import { scheduleMessage } from "./schedule-copy";
export const dynamic = "force-dynamic";

function clock(minute: number) {
  return minute === 1440
    ? "24:00"
    : `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

export default async function AvailabilityPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  const message = (key: Parameters<typeof scheduleMessage>[1]) =>
    scheduleMessage(locale, key);
  const unavailable = (
    <Alert tone="danger">
      <AlertDescription className="text-foreground">
        {message("unavailable")}
      </AlertDescription>
    </Alert>
  );
  const request = await loadDashboardRequestAccess(locale);
  let body;
  if (request.state.kind !== "ready")
    body = <DashboardAccessPanel locale={locale} state={request.state} />;
  else if (
    !request.source?.getScheduleWorkspace ||
    !request.source.getScheduleChoices ||
    !request.source.getScheduleEditorDetails
  )
    body = unavailable;
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
          <Section id="schedule-create" title={message("create")}>
            {choices.length ? (
              <div className="rounded-lg border bg-card p-5 md:p-6">
                <ScheduleForm
                  locale={locale}
                  choices={choices}
                  rows={rows}
                  attempt={crypto.randomUUID()}
                />
              </div>
            ) : (
              <Alert tone="warning">
                <AlertDescription className="text-foreground">
                  {message("denied")}
                </AlertDescription>
              </Alert>
            )}
          </Section>
          <Section id="schedule-current" title={message("existing")}>
            {rows.length ? (
              <ul className="grid divide-y rounded-lg border bg-card">
                {rows.map((row) => (
                  <li key={row.id}>
                    <article className="grid gap-3 p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="grid gap-1">
                          <h3 className="text-base font-semibold text-foreground">
                            {message(row.kind)} · {scopeName(row, choices)}
                          </h3>
                          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                            {row.localDate ? <bdi>{row.localDate}</bdi> : null}
                            {row.timeZone ? <bdi>{row.timeZone}</bdi> : null}
                          </p>
                        </div>
                        <StatusStamp state="neutral">
                          {message("revision")} {formatNumber(row.revision, locale)}
                        </StatusStamp>
                      </div>
                      {row.startsAt ? (
                        <p className="text-sm font-medium [font-variant-numeric:tabular-nums]">
                          {formatWhen(
                            row.startsAt,
                            locale,
                            row.timeZone ?? "Asia/Riyadh",
                          )}{" "}
                          –{" "}
                          {formatWhen(
                            row.endsAt!,
                            locale,
                            row.timeZone ?? "Asia/Riyadh",
                          )}
                        </p>
                      ) : null}
                      {row.startMinute !== null ? (
                        <p className="text-sm font-medium">
                          <bdi dir="ltr" className="font-latin tabular-nums">
                            {clock(row.startMinute)} – {clock(row.endMinute!)}
                          </bdi>
                        </p>
                      ) : null}
                      <details className="group border-t">
                        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-1 py-2 text-sm font-semibold text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                          {message("edit")}
                          <ChevronDown
                            aria-hidden="true"
                            className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
                          />
                        </summary>
                        <div className="pt-2 pb-2">
                          <ScheduleForm
                            locale={locale}
                            record={row}
                            rows={rows}
                            choices={choices}
                            attempt={crypto.randomUUID()}
                          />
                        </div>
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
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<CalendarClock />} title={message("empty")} />
            )}
          </Section>
        </>
      );
    } else {
      body = unavailable;
    }
  }
  return (
    <WorkspaceShell
      locale={locale}
      current="availability"
      labelledBy="availability-title"
    >
      <div className="grid gap-8">
        <PageHeader
          titleId="availability-title"
          title={message("title")}
          description={message("summary")}
        />
        {body}
      </div>
    </WorkspaceShell>
  );
}
