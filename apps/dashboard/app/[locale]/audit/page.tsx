import Link from "next/link";
import type { Locale } from "@wlbp/i18n";
import {
  Alert,
  AlertDescription,
  Button,
  DatePicker,
  EmptyState,
  Field,
  Label,
  PageHeader,
  ReferenceCode,
  StatusStamp,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Toolbar,
} from "@wlbp/ui-foundation";
import { ChevronRight, Filter, History } from "lucide-react";
import { WorkspaceShell } from "../../_lib/workspace-shell";
import { DashboardAccessPanel } from "../../_lib/dashboard-access-panel";
import { workspaceStatus } from "../../_lib/workspace-status";
import { ChoiceSelect } from "../services/form-kit";
import { workspaceStamp } from "../communications/status-stamp";
import { auditFilters, auditStreams } from "./audit-filters";
import { loadAudit } from "./audit-data-source";
import { formatWhen } from "../../_lib/booking-display";
import { workspaceMessage } from "../../_lib/workspace-copy";
import { RecordCard, RecordCards, TableFrame } from "../../_lib/ui/record-cards";
export const dynamic = "force-dynamic";
/** Filter value meaning "no restriction"; Radix selects cannot submit "". */
const ALL = "all";
const secondary = "block text-xs text-muted-foreground";
const streamNames = {
  booking: ["Bookings", "الحجوزات"],
  settings: ["Settings", "الإعدادات"],
  brand: ["Brand publications", "نشر العلامة"],
  staff: ["Team and resources", "الفريق والموارد"],
  access: ["Staff access", "صلاحيات الفريق"],
  catalog: ["Catalog", "الكتالوج"],
  schedule: ["Schedules", "الجداول"],
  integration: ["Integrations", "التكاملات"],
} as const;
const actionNames: Record<string, readonly [string, string]> = {
  booking_confirmed: ["Booking confirmed", "تأكيد الحجز"],
  booking_cancelled: ["Booking cancelled", "إلغاء الحجز"],
  booking_completed: ["Appointment completed", "اكتمال الموعد"],
  booking_no_show: ["No-show recorded", "تسجيل عدم الحضور"],
  booking_checked_in: ["Arrival recorded", "تسجيل الحضور"],
  booking_created_on_behalf: ["Booking created by staff", "إنشاء الحجز بواسطة الفريق"],
  settings_saved: ["Settings saved", "حفظ الإعدادات"],
  brand_published: ["Brand published", "نشر العلامة"],
  onboarding_authorized: ["Onboarding authorized", "السماح بإعداد الحساب"],
  onboarding_link_created: ["Provider link created", "إنشاء رابط المزود"],
  onboarding_provider_failed: ["Provider link failed", "فشل رابط المزود"],
};
export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const filters = auditFilters(query);
  const state = await loadAudit(locale, filters);
  const m = (en: string, ar: string) => (locale === "ar" ? ar : en);
  const actors =
    state.kind === "ready"
      ? [
          ...new Map(
            state.rows
              .filter((row) => row.actor)
              .map((row) => [
                row.actor!,
                { id: row.actor!, name: row.actor_name || m("Member", "عضو") },
              ]),
          ).values(),
        ]
      : [];
  const next = new URLSearchParams();
  for (const key of ["stream", "from", "to", "actor"])
    if (typeof query[key] === "string" && query[key].length <= 100)
      next.set(key, query[key]);
  if (state.kind === "ready" && state.cursor)
    next.set("cursor", JSON.stringify(state.cursor));
  return (
    <WorkspaceShell locale={locale} current="audit" labelledBy="audit-title">
      <div className="grid gap-8">
        <PageHeader
          titleId="audit-title"
          title={m("Audit", "سجل التدقيق")}
          description={m(
            "Read-only event history in UTC, limited to your current scope. Sensitive content is excluded.",
            "سجل أحداث للقراءة فقط بالتوقيت العالمي المنسّق (UTC)، ضمن نطاقك الحالي. تُستبعد البيانات الحساسة.",
          )}
        />
        {state.kind === "access" ? (
          <DashboardAccessPanel locale={locale} state={state.state} />
        ) : state.kind === "unavailable" ? (
          <Alert tone="danger">
            <AlertDescription className="text-foreground">
              {m(
                "Audit access is refused or unavailable.",
                "الوصول إلى سجل التدقيق مرفوض أو غير متاح.",
              )}
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <form method="get">
              <Toolbar>
                <Field className="md:min-w-52">
                  <Label htmlFor="audit-stream">
                    {m("Event source", "مصدر الحدث")}
                  </Label>
                  <ChoiceSelect
                    id="audit-stream"
                    name="stream"
                    defaultValue={filters.stream ?? ALL}
                    options={[
                      {
                        value: ALL,
                        label: m("All permitted sources", "جميع المصادر المسموحة"),
                      },
                      ...auditStreams.map((stream) => ({
                        value: stream,
                        label: streamNames[stream][locale === "ar" ? 1 : 0],
                      })),
                    ]}
                  />
                </Field>
                <Field>
                  <Label htmlFor="audit-from">
                    {m("From (UTC date)", "من (تاريخ UTC)")}
                  </Label>
                  <DatePicker
                    id="audit-from"
                    name="from"
                    locale={locale}
                    defaultValue={filters.from?.slice(0, 10) ?? ""}
                    placeholder={workspaceMessage(locale, "datePlaceholder")}
                  />
                </Field>
                <Field>
                  <Label htmlFor="audit-to">
                    {m("Through (UTC date)", "حتى (تاريخ UTC)")}
                  </Label>
                  <DatePicker
                    id="audit-to"
                    name="to"
                    locale={locale}
                    defaultValue={typeof query.to === "string" ? query.to : ""}
                    placeholder={workspaceMessage(locale, "datePlaceholder")}
                  />
                </Field>
                <Field className="md:min-w-52">
                  <Label htmlFor="audit-actor">
                    {m("Actor in this page", "الفاعل في هذه الصفحة")}
                  </Label>
                  <ChoiceSelect
                    id="audit-actor"
                    name="actor"
                    defaultValue={filters.actor ?? ALL}
                    options={[
                      { value: ALL, label: m("All actors", "جميع الفاعلين") },
                      ...(filters.actor &&
                      !actors.some((actor) => actor.id === filters.actor)
                        ? [
                            {
                              value: filters.actor,
                              label: m("Selected member", "العضو المحدد"),
                            },
                          ]
                        : []),
                      ...actors.map((actor) => ({
                        value: actor.id,
                        label: (
                          <>
                            {actor.name} · <bdi>{actor.id.slice(0, 8)}</bdi>
                          </>
                        ),
                      })),
                    ]}
                  />
                </Field>
                <Button type="submit" variant="outline">
                  <Filter aria-hidden="true" />
                  {m("Apply filters", "تطبيق التصفية")}
                </Button>
              </Toolbar>
            </form>
            {state.rows.length ? (
              (() => {
                const headings = {
                  time: m("Time (UTC)", "الوقت (UTC)"),
                  actor: m("Actor", "الفاعل"),
                  action: m("Action", "الإجراء"),
                  target: m("Target", "الهدف"),
                  outcome: m("Outcome / correlation", "النتيجة / الترابط"),
                };
                type AuditRow = (typeof state.rows)[number];
                const cells = (row: AuditRow) => ({
                  time: (
                    <time dateTime={row.time}>
                      {formatWhen(row.time, locale, "UTC")}
                    </time>
                  ),
                  actor: (
                    <>
                      {row.actor_name ||
                        m(
                          row.actor ? "Member" : "System or guest",
                          row.actor ? "عضو" : "النظام أو الزائر",
                        )}
                      {row.actor ? (
                        <small className={secondary}>
                          <bdi className="break-all">{row.actor}</bdi>
                        </small>
                      ) : null}
                      {row.effective_actor && row.effective_actor !== row.actor ? (
                        <small className={secondary}>
                          {m("Effective actor", "الفاعل الفعلي")}:{" "}
                          <bdi className="break-all">{row.effective_actor}</bdi>
                        </small>
                      ) : null}
                    </>
                  ),
                  action: (
                    <>
                      {actionNames[row.action]?.[locale === "ar" ? 1 : 0] ??
                        m("Recorded change", "تغيير مسجّل")}
                      <small className={secondary}>
                        <bdi className="break-all">{row.action}</bdi>
                      </small>
                    </>
                  ),
                  target:
                    row.target_kind === "booking" ? (
                      <Link
                        className="underline-offset-4 hover:underline"
                        href={`/${locale}/bookings/${row.target_id}`}
                      >
                        <ReferenceCode className="text-primary">
                          {row.target_reference ?? row.target_id}
                        </ReferenceCode>
                      </Link>
                    ) : (
                      <>
                        <span>
                          {streamNames[row.stream as keyof typeof streamNames]?.[
                            locale === "ar" ? 1 : 0
                          ] ?? m("Record", "سجل")}
                        </span>
                        <small className={secondary}>
                          <bdi className="break-all">
                            {row.target_reference ?? row.target_id}
                          </bdi>
                        </small>
                      </>
                    ),
                  outcome: (
                    <>
                      <StatusStamp state={workspaceStamp(row.outcome)}>
                        {workspaceStatus(locale, row.outcome)}
                      </StatusStamp>
                      {row.correlation ? (
                        <small className={secondary}>
                          <bdi className="break-all">{row.correlation}</bdi>
                        </small>
                      ) : null}
                    </>
                  ),
                });
                return (
                  <>
                    <TableFrame>
                      <Table label={m("Audit events", "أحداث التدقيق")}>
                        <TableHeader>
                          <TableRow>
                            {Object.values(headings).map((label) => (
                              <TableHead key={label}>{label}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {state.rows.map((row) => {
                            const cell = cells(row);
                            return (
                              <TableRow key={`${row.stream}:${row.id}`}>
                                <TableCell className="align-top whitespace-nowrap">
                                  {cell.time}
                                </TableCell>
                                <TableCell className="max-w-56 align-top">
                                  {cell.actor}
                                </TableCell>
                                <TableCell className="max-w-56 align-top">
                                  {cell.action}
                                </TableCell>
                                <TableCell className="max-w-56 align-top">
                                  {cell.target}
                                </TableCell>
                                <TableCell className="max-w-56 align-top">
                                  {cell.outcome}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableFrame>
                    <RecordCards label={m("Audit events", "أحداث التدقيق")}>
                      {state.rows.map((row) => {
                        const cell = cells(row);
                        return (
                          <RecordCard
                            key={`${row.stream}:${row.id}`}
                            title={<span className="font-semibold">{cell.action}</span>}
                            facts={[
                              { key: "time", label: headings.time, value: cell.time },
                              {
                                key: "actor",
                                label: headings.actor,
                                value: cell.actor,
                              },
                              {
                                key: "target",
                                label: headings.target,
                                value: cell.target,
                              },
                              {
                                key: "outcome",
                                label: headings.outcome,
                                value: cell.outcome,
                              },
                            ]}
                          />
                        );
                      })}
                    </RecordCards>
                  </>
                );
              })()
            ) : (
              <EmptyState
                icon={<History />}
                title={m(
                  "No permitted events match these filters.",
                  "لا توجد أحداث مسموحة تطابق هذه التصفية.",
                )}
              />
            )}
            {state.cursor ? (
              <div className="flex justify-end">
                <Button asChild variant="outline">
                  <Link href={`/${locale}/audit?${next}`}>
                    {m("Older events", "الأحداث الأقدم")}
                    <ChevronRight aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </WorkspaceShell>
  );
}
