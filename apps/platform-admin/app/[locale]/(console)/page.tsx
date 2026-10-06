import { formatNumber, type Locale } from "@wlbp/i18n";
import { Badge } from "@wlbp/ui-foundation";
import Link from "next/link";
import type { AuditRow } from "../../_lib/audit-copy";
import { copyFor, say, stateCopy, statusCopy, type Copy } from "../../_lib/copy";
import { bucketCount } from "../../_lib/count-buckets";
import { callOperator } from "../../_lib/operator-api";
import { getOperator } from "../../_lib/operator-page";
import { pageLocale } from "../../_lib/page-locale";
import { PageHeader } from "../../_lib/shell/page-header";
import { AuditList } from "../../_lib/ui/audit-list";
import { Metric } from "../../_lib/ui/metric";
import { EmptyState, UnavailableState } from "../../_lib/ui/states";
import { TimeValue } from "../../_lib/ui/time";
import { overviewCopy as c } from "./copy";

export const dynamic = "force-dynamic";

type Counts = Record<string, number>;
type Overview = {
  generated_at: string;
  tenant_total: number;
  tenants: Counts;
  instance_total: number;
  instances: Counts;
  subscriptions: Counts;
  jobs: Counts;
  provisioning: {
    in_progress: number;
    waiting: number;
    failed: number;
    active: number;
  };
  health: {
    failing: number;
    degraded: number;
    healthy: number;
    stale: number;
    unobserved: number;
    stale_after_minutes: number;
  };
  pending: {
    job_approvals: number;
    support_requests: number;
    support_active: number;
    rollouts_paused: number;
    rollouts_running: number;
    domains_pending: number;
    break_glass_active: number;
  };
  recent_activity: AuditRow[];
};

function alertHref(locale: Locale, kind: string, subject: string | null): string {
  switch (kind) {
    case "provisioning_failed":
      return `/${locale}/provisioning/${subject}`;
    case "job_failed":
    case "approval_pending":
      return `/${locale}/jobs/${subject}`;
    case "health_failing":
    case "stale_observation":
    case "drift":
      return `/${locale}/instances/${subject}`;
    case "rollout_paused":
      return `/${locale}/rollouts/${subject}`;
    case "support_pending":
      return `/${locale}/support?status=pending`;
    default:
      return `/${locale}/operators`;
  }
}

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = await pageLocale(params);
  if (!(await getOperator(locale))) return null;
  const [overviewResult, alertsResult] = await Promise.all([
    callOperator("get_overview_v1"),
    callOperator("list_alerts_v1"),
  ]);
  const header = (
    <PageHeader
      locale={locale}
      title={say(locale, c.title)}
      description={say(locale, c.description)}
    />
  );
  if (!overviewResult.ok)
    return (
      <>
        {header}
        <UnavailableState locale={locale} code={overviewResult.code} />
      </>
    );

  const o = overviewResult.data as unknown as Overview;
  const n = (value: number | undefined) =>
    value === undefined
      ? say(locale, stateCopy.notObserved)
      : formatNumber(value, locale);
  const status = (key: string) => copyFor(statusCopy, key, locale);
  const p = (path: string) => `/${locale}/${path}`;
  const line = (label: Copy | string, value: number | undefined, href: string) =>
    [typeof label === "string" ? label : say(locale, label), n(value), href] as const;

  return (
    <>
      {header}
      <p className="secondary">
        {say(locale, c.generatedAt)}:{" "}
        <TimeValue locale={locale} value={o.generated_at} />
      </p>

      <div className="metric-grid">
        <Metric
          href={p("tenants")}
          title={say(locale, c.tenants)}
          value={n(o.tenant_total)}
          details={[
            line(
              status("active"),
              bucketCount(o.tenants, "active"),
              p("tenants?status=active"),
            ),
            line(
              status("suspended"),
              bucketCount(o.tenants, "suspended"),
              p("tenants?status=suspended"),
            ),
            line(
              status("closed"),
              bucketCount(o.tenants, "closed"),
              p("tenants?status=closed"),
            ),
          ]}
        />
        <Metric
          href={p("instances")}
          title={say(locale, c.instances)}
          value={n(o.instance_total)}
          details={[
            line(
              status("active"),
              bucketCount(o.instances, "active"),
              p("instances?state=active"),
            ),
            line(
              status("provisioning"),
              bucketCount(o.instances, "provisioning"),
              p("instances?state=provisioning"),
            ),
            line(
              status("suspended"),
              bucketCount(o.instances, "suspended"),
              p("instances?state=suspended"),
            ),
          ]}
        />
        <Metric
          href={p("subscriptions?state=active")}
          title={say(locale, c.activeSubscriptions)}
          value={n(bucketCount(o.subscriptions, "active"))}
          details={[
            line(
              status("trialing"),
              bucketCount(o.subscriptions, "trialing"),
              p("subscriptions?state=trialing"),
            ),
            line(
              status("past_due"),
              bucketCount(o.subscriptions, "past_due"),
              p("subscriptions?state=past_due"),
            ),
            line(
              status("cancelled"),
              bucketCount(o.subscriptions, "cancelled"),
              p("subscriptions?state=cancelled"),
            ),
            line(
              status("none"),
              bucketCount(o.subscriptions, "none"),
              p("subscriptions?state=none"),
            ),
          ]}
        />
        <Metric
          href={p("provisioning?state=in_progress")}
          title={say(locale, c.provisioningInProgress)}
          value={n(o.provisioning.in_progress)}
          details={[
            line(c.waiting, o.provisioning.waiting, p("provisioning?state=waiting")),
            line(
              status("failed"),
              o.provisioning.failed,
              p("provisioning?state=failed"),
            ),
            line(
              status("active"),
              o.provisioning.active,
              p("provisioning?state=active"),
            ),
          ]}
        />
        <Metric
          href={p("jobs?status=queued")}
          title={say(locale, c.queuedJobs)}
          value={n(bucketCount(o.jobs, "queued"))}
          details={[
            line(
              status("running"),
              bucketCount(o.jobs, "running"),
              p("jobs?status=running"),
            ),
            line(
              status("failed"),
              bucketCount(o.jobs, "failed"),
              p("jobs?status=failed"),
            ),
          ]}
        />
        <Metric
          href={p("health?status=failing&kind=instance")}
          title={say(locale, c.failingInstances)}
          value={n(o.health.failing)}
          details={[
            line(
              status("degraded"),
              o.health.degraded,
              p("health?status=degraded&kind=instance"),
            ),
            line(c.staleCount, o.health.stale, p("health?status=stale&kind=instance")),
            line(
              c.notObservedCount,
              o.health.unobserved,
              p("health?status=unknown&kind=instance"),
            ),
            line(
              c.healthyCount,
              o.health.healthy,
              p("health?status=healthy&kind=instance"),
            ),
          ]}
        />
      </div>
      <p className="notice">{say(locale, c.healthNote)}</p>

      <section className="section" aria-labelledby="pending-title">
        <div className="section-header">
          <h2 id="pending-title">{say(locale, c.pending)}</h2>
        </div>
        <div className="metric-grid">
          <Metric
            href={p("jobs?status=awaiting_approval")}
            title={say(locale, c.approvals)}
            value={n(o.pending.job_approvals)}
          />
          <Metric
            href={p("support?status=pending")}
            title={say(locale, c.supportRequests)}
            value={n(o.pending.support_requests)}
          />
          <Metric
            href={p("support?status=active")}
            title={say(locale, c.supportActive)}
            value={n(o.pending.support_active)}
          />
          <Metric
            href={p("rollouts?status=paused")}
            title={say(locale, c.rolloutsPaused)}
            value={n(o.pending.rollouts_paused)}
          />
          <Metric
            href={p("rollouts?status=running")}
            title={say(locale, c.rolloutsRunning)}
            value={n(o.pending.rollouts_running)}
          />
          <Metric
            href={p("domains?status=pending")}
            title={say(locale, c.domainsPending)}
            value={n(o.pending.domains_pending)}
          />
          <Metric
            href={p("operators")}
            title={say(locale, c.breakGlass)}
            value={n(o.pending.break_glass_active)}
          />
        </div>
      </section>

      <section className="section" aria-labelledby="alerts-title">
        <div className="section-header">
          <h2 id="alerts-title">{say(locale, c.alerts)}</h2>
          <Link href={p("health")}>{say(locale, c.alertsAll)}</Link>
        </div>
        {!alertsResult.ok ? (
          <UnavailableState locale={locale} code={alertsResult.code} />
        ) : alertsResult.data.length === 0 ? (
          <EmptyState locale={locale} title={say(locale, c.alertsEmpty)} />
        ) : (
          <ul className="timeline">
            {alertsResult.data.slice(0, 8).map((alert, index) => (
              <li
                key={`${alert.kind}:${alert.subject_id}:${alert.code ?? ""}:${alert.observed_at ?? ""}:${index}`}
              >
                <TimeValue
                  locale={locale}
                  value={alert.observed_at}
                  empty="notReported"
                />
                <div>
                  <Badge tone={alert.severity === "critical" ? "danger" : "warning"}>
                    {say(
                      locale,
                      alert.severity === "critical"
                        ? c.severityCritical
                        : c.severityWarning,
                    )}
                  </Badge>{" "}
                  <Link href={alertHref(locale, alert.kind, alert.subject_id)}>
                    {say(
                      locale,
                      c.alertKinds[alert.kind as keyof typeof c.alertKinds] ?? c.alerts,
                    )}
                  </Link>
                  <span className="secondary">
                    {alert.tenant_name ? <bdi>{alert.tenant_name}</bdi> : null}
                    {alert.code ? (
                      <>
                        {" "}
                        · <bdi>{alert.code}</bdi>
                      </>
                    ) : null}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section" aria-labelledby="activity-title">
        <div className="section-header">
          <h2 id="activity-title">{say(locale, c.activity)}</h2>
          <Link href={p("audit")}>{say(locale, c.activityAll)}</Link>
        </div>
        {o.recent_activity.length ? (
          <AuditList locale={locale} rows={o.recent_activity} />
        ) : (
          <EmptyState locale={locale} />
        )}
      </section>
    </>
  );
}
