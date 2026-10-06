import Link from "next/link";
import { formatDateTime, formatNumber, type Locale } from "@wlbp/i18n";
import { WorkspaceShell } from "../../_lib/workspace-shell";
import { DashboardAccessPanel } from "../../_lib/dashboard-access-panel";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { workspaceStatus } from "../../_lib/workspace-status";
import { CommunicationRetry } from "./communication-retry";
export const dynamic = "force-dynamic";
const healthLabels = {
  queued: ["Queued", "في الانتظار"],
  sending: ["Sending", "جارٍ الإرسال"],
  delivered: ["Delivered", "تم التسليم"],
  failed: ["Failed", "فشل"],
  suppressed: ["Suppressed", "تم منع الإرسال"],
  bounced: ["Bounced", "مرتد"],
  complained: ["Complaints", "الشكاوى"],
  deadLettered: ["Stopped after retries", "توقف بعد المحاولات"],
  oldestQueuedMinutes: ["Oldest queued (minutes)", "أقدم رسالة في الانتظار (دقائق)"],
} as const;
export default async function CommunicationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const m = (en: string, ar: string) => (locale === "ar" ? ar : en);
  const request = await loadDashboardRequestAccess(locale);
  const statuses = [
    "queued",
    "sending",
    "delivered",
    "failed",
    "suppressed",
    "bounced",
    "complained",
  ] as const;
  const status =
    typeof query.status === "string" &&
    statuses.includes(query.status as (typeof statuses)[number])
      ? query.status
      : null;
  let body;
  if (request.state.kind !== "ready")
    body = <DashboardAccessPanel locale={locale} state={request.state} />;
  else {
    const context = request.state.context;
    const loaded = await (async () => {
      try {
        if (
          !request.source?.getDeliveryHealth ||
          !request.source.listCommunicationQueue
        )
          throw new Error();
        const [health, rows] = await Promise.all([
          request.source.getDeliveryHealth({
            tenantId: context.tenantId,
          }),
          request.source.listCommunicationQueue(context.tenantId, status),
        ]);
        if (!health) throw new Error();
        return { health, rows };
      } catch {
        return null;
      }
    })();
    if (loaded) {
      const { health, rows } = loaded;
      body = (
        <>
          {query.result === "queued" ? (
            <p role="status">
              {m(
                "Retry queued; delivery is not yet confirmed.",
                "أُضيفت إعادة المحاولة إلى القائمة؛ لم يُؤكد التسليم بعد.",
              )}
            </p>
          ) : null}
          <p>
            {m(
              "Counts cover your permitted bookings. Queued or sent mail is not evidence of delivery.",
              "تشمل الأعداد الحجوزات المسموح لك بها. انتظار البريد أو إرساله لا يُثبت التسليم.",
            )}
          </p>
          <p>
            {m("Read at", "وقت القراءة")}:{" "}
            {formatDateTime(new Date().toISOString(), locale, "UTC")}
          </p>
          <dl className="workspace-health-list">
            {(Object.keys(healthLabels) as (keyof typeof healthLabels)[]).map((key) => (
              <div key={key}>
                <dt>{healthLabels[key][locale === "ar" ? 1 : 0]}</dt>
                <dd>{formatNumber(health[key], locale)}</dd>
              </div>
            ))}
          </dl>
          <form method="get">
            <label>
              {m("Message status", "حالة الرسالة")}
              <select name="status" defaultValue={status ?? ""}>
                <option value="">{m("All statuses", "جميع الحالات")}</option>
                {statuses.map((value) => (
                  <option key={value} value={value}>
                    {workspaceStatus(locale, value)}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">{m("Filter", "تصفية")}</button>
          </form>
          {rows.length ? (
            <div className="workspace-table-scroll">
              <table className="workspace-table">
                <thead>
                  <tr>
                    <th scope="col">{m("Booking", "الحجز")}</th>
                    <th scope="col">{m("Status", "الحالة")}</th>
                    <th scope="col">{m("Created", "الإنشاء")}</th>
                    <th scope="col">{m("Recovery", "المعالجة")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <th scope="row">
                        <Link href={`/${locale}/bookings/${row.bookingId}`}>
                          {row.serviceName} · <bdi>{row.publicReference}</bdi>
                        </Link>
                      </th>
                      <td>{workspaceStatus(locale, row.status)}</td>
                      <td>{formatDateTime(row.createdAt, locale, "UTC")}</td>
                      <td>
                        {row.status === "failed" ? (
                          <CommunicationRetry
                            locale={locale}
                            bookingId={row.bookingId}
                          />
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
                "No messages match this scope and filter.",
                "لا توجد رسائل تطابق هذا النطاق والتصفية.",
              )}
            </p>
          )}
          <p>
            <Link href={`/${locale}/settings`}>
              {m("Communication preferences", "تفضيلات التواصل")}
            </Link>{" "}
            ·{" "}
            <Link href={`/${locale}/integrations`}>
              {m("Provider readiness", "جاهزية المزود")}
            </Link>
          </p>
        </>
      );
    } else {
      body = (
        <p role="alert">
          {m(
            "Communication health is unavailable. Retry the read.",
            "حالة التواصل غير متاحة. أعد محاولة القراءة.",
          )}
        </p>
      );
    }
  }
  return (
    <WorkspaceShell
      locale={locale}
      current="communications"
      labelledBy="communications-title"
    >
      <header className="dashboard-intro">
        <h1 id="communications-title">{m("Communications", "التواصل")}</h1>
      </header>
      {body}
    </WorkspaceShell>
  );
}
