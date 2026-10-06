import Link from "next/link";
import { formatDateTime, type Locale } from "@wlbp/i18n";
import { WorkspaceShell } from "../../_lib/workspace-shell";
import { DashboardAccessPanel } from "../../_lib/dashboard-access-panel";
import { workspaceStatus } from "../../_lib/workspace-status";
import { auditFilters, auditStreams } from "./audit-filters";
import { loadAudit } from "./audit-data-source";
export const dynamic = "force-dynamic";
const streamNames = {
  booking: ["Bookings", "الحجوزات"],
  settings: ["Settings", "الإعدادات"],
  brand: ["Brand publications", "نشر العلامة"],
  staff: ["Team and resources", "الفريق والموارد"],
  access: ["Staff access", "صلاحيات الفريق"],
  catalog: ["Catalog", "الدليل"],
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
      <header className="dashboard-intro">
        <h1 id="audit-title">{m("Audit", "سجل التدقيق")}</h1>
        <p>
          {m(
            "Read-only event history in UTC, limited to your current scope. Sensitive content is excluded.",
            "سجل أحداث للقراءة فقط بالتوقيت العالمي، ضمن نطاقك الحالي. تُستبعد البيانات الحساسة.",
          )}
        </p>
      </header>
      {state.kind === "access" ? (
        <DashboardAccessPanel locale={locale} state={state.state} />
      ) : state.kind === "unavailable" ? (
        <p role="alert">
          {m(
            "Audit access is refused or unavailable.",
            "الوصول إلى سجل التدقيق مرفوض أو غير متاح.",
          )}
        </p>
      ) : (
        <>
          <form method="get" className="workspace-filter-bar">
            <label>
              {m("Event source", "مصدر الحدث")}
              <select name="stream" defaultValue={filters.stream ?? ""}>
                <option value="">
                  {m("All permitted sources", "جميع المصادر المسموحة")}
                </option>
                {auditStreams.map((stream) => (
                  <option key={stream} value={stream}>
                    {streamNames[stream][locale === "ar" ? 1 : 0]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {m("From (UTC date)", "من (تاريخ عالمي)")}
              <input
                name="from"
                type="date"
                defaultValue={filters.from?.slice(0, 10) ?? ""}
              />
            </label>
            <label>
              {m("Through (UTC date)", "حتى (تاريخ عالمي)")}
              <input
                name="to"
                type="date"
                defaultValue={typeof query.to === "string" ? query.to : ""}
              />
            </label>
            <label>
              {m("Actor in this page", "الفاعل في هذه الصفحة")}
              <select name="actor" defaultValue={filters.actor ?? ""}>
                <option value="">{m("All actors", "جميع الفاعلين")}</option>
                {filters.actor &&
                !actors.some((actor) => actor.id === filters.actor) ? (
                  <option value={filters.actor}>
                    {m("Selected member", "العضو المحدد")}
                  </option>
                ) : null}
                {actors.map((actor) => (
                  <option key={actor.id} value={actor.id}>
                    {actor.name} · {actor.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">{m("Apply filters", "تطبيق التصفية")}</button>
          </form>
          {state.rows.length ? (
            <div
              className="workspace-table-scroll"
              role="region"
              tabIndex={0}
              aria-label={m("Audit events", "أحداث التدقيق")}
            >
              <table className="workspace-table">
                <thead>
                  <tr>
                    {[
                      m("Time (UTC)", "الوقت (عالمي)"),
                      m("Actor", "الفاعل"),
                      m("Action", "الإجراء"),
                      m("Target", "الهدف"),
                      m("Outcome / correlation", "النتيجة / الترابط"),
                    ].map((label) => (
                      <th scope="col" key={label}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {state.rows.map((row) => (
                    <tr key={`${row.stream}:${row.id}`}>
                      <td>{formatDateTime(row.time, locale, "UTC")}</td>
                      <td>
                        {row.actor_name ||
                          m(
                            row.actor ? "Member" : "System or guest",
                            row.actor ? "عضو" : "النظام أو الزائر",
                          )}
                        {row.actor ? (
                          <small className="workspace-secondary">
                            <bdi>{row.actor}</bdi>
                          </small>
                        ) : null}
                        {row.effective_actor && row.effective_actor !== row.actor ? (
                          <small className="workspace-secondary">
                            {m("Effective actor", "الفاعل الفعلي")}:{" "}
                            <bdi>{row.effective_actor}</bdi>
                          </small>
                        ) : null}
                      </td>
                      <td>
                        {actionNames[row.action]?.[locale === "ar" ? 1 : 0] ??
                          m("Recorded change", "تغيير مسجل")}
                        <small className="workspace-secondary">
                          <bdi>{row.action}</bdi>
                        </small>
                      </td>
                      <td>
                        {row.target_kind === "booking" ? (
                          <Link href={`/${locale}/bookings/${row.target_id}`}>
                            <bdi>{row.target_reference ?? row.target_id}</bdi>
                          </Link>
                        ) : (
                          <>
                            <span>
                              {streamNames[row.stream as keyof typeof streamNames]?.[
                                locale === "ar" ? 1 : 0
                              ] ?? m("Record", "سجل")}
                            </span>
                            <small className="workspace-secondary">
                              <bdi>{row.target_reference ?? row.target_id}</bdi>
                            </small>
                          </>
                        )}
                      </td>
                      <td>
                        {workspaceStatus(locale, row.outcome)}
                        {row.correlation ? (
                          <small className="workspace-secondary">
                            <bdi>{row.correlation}</bdi>
                          </small>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>
              {m(
                "No permitted events match these filters.",
                "لا توجد أحداث مسموحة تطابق هذه التصفية.",
              )}
            </p>
          )}
          {state.cursor ? (
            <Link className="wlbp-button" href={`/${locale}/audit?${next}`}>
              {m("Older events", "الأحداث الأقدم")}
            </Link>
          ) : null}
        </>
      )}
    </WorkspaceShell>
  );
}
