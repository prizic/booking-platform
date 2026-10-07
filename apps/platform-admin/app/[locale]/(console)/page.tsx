import { formatNumber, type Locale } from "@wlbp/i18n";
import { Alert, Button, Section, StatusStamp } from "@wlbp/ui-foundation";
import { ArrowRight } from "lucide-react";
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
      timesInUtc
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

  const pendingItems = [
    [c.approvals, o.pending.job_approvals, p("jobs?status=awaiting_approval")],
    [c.supportRequests, o.pending.support_requests, p("support?status=pending")],
    [c.supportActive, o.pending.support_active, p("support?status=active")],
    [c.rolloutsPaused, o.pending.rollouts_paused, p("rollouts?status=paused")],
    [c.rolloutsRunning, o.pending.rollouts_running, p("rollouts?status=running")],
    [c.domainsPending, o.pending.domains_pending, p("domains?status=pending")],
    [c.breakGlass, o.pending.break_glass_active, p("operators")],
  ] as const;

  return (
    <>
      <PageHeader
        locale={locale}
        timesInUtc
        title={say(locale, c.title)}
        description={say(locale, c.description)}
        meta={
          <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            {say(locale, c.generatedAt)}:{" "}
            <TimeValue locale={locale} value={o.generated_at} />
          </p>
        }
      />

      <div className="grid gap-4">
        <div className="grid gap-x-8 rounded-lg border bg-card px-5 md:grid-cols-2 xl:grid-cols-3 [&>section]:border-b [&>section:last-child]:border-b-0 md:[&>section:nth-last-child(-n+2)]:border-b-0 xl:[&>section:nth-last-child(-n+3)]:border-b-0">
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
              line(
                c.staleCount,
                o.health.stale,
                p("health?status=stale&kind=instance"),
              ),
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
        <Alert tone="info">{say(locale, c.healthNote)}</Alert>
      </div>

      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid min-w-0 gap-8">
          <Section
            id="alerts"
            title={say(locale, c.alerts)}
            actions={
              <Button asChild variant="ghost">
                <Link href={p("health")}>
                  {say(locale, c.alertsAll)}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            }
          >
            {!alertsResult.ok ? (
              <UnavailableState locale={locale} code={alertsResult.code} />
            ) : alertsResult.data.length === 0 ? (
              <EmptyState locale={locale} title={say(locale, c.alertsEmpty)} />
            ) : (
              <ul className="divide-y rounded-lg border bg-card">
                {alertsResult.data.slice(0, 8).map((alert, index) => (
                  <li
                    key={`${alert.kind}:${alert.subject_id}:${alert.code ?? ""}:${alert.observed_at ?? ""}:${index}`}
                    className="grid gap-1.5 px-4 py-3 text-sm md:grid-cols-[13rem_minmax(0,1fr)] md:gap-4"
                  >
                    <span className="text-muted-foreground">
                      <TimeValue
                        locale={locale}
                        value={alert.observed_at}
                        empty="notReported"
                      />
                    </span>
                    <div className="grid min-w-0 gap-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <StatusStamp
                          state={alert.severity === "critical" ? "failed" : "requested"}
                        >
                          {say(
                            locale,
                            alert.severity === "critical"
                              ? c.severityCritical
                              : c.severityWarning,
                          )}
                        </StatusStamp>
                        <Link
                          href={alertHref(locale, alert.kind, alert.subject_id)}
                          className="font-semibold text-primary underline-offset-4 hover:underline"
                        >
                          {say(
                            locale,
                            c.alertKinds[alert.kind as keyof typeof c.alertKinds] ??
                              c.alerts,
                          )}
                        </Link>
                      </p>
                      {alert.tenant_name || alert.code ? (
                        <p className="text-muted-foreground">
                          {alert.tenant_name ? <bdi>{alert.tenant_name}</bdi> : null}
                          {alert.tenant_name && alert.code ? " · " : null}
                          {alert.code ? (
                            <bdi className="font-latin text-xs">{alert.code}</bdi>
                          ) : null}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            id="activity"
            title={say(locale, c.activity)}
            actions={
              <Button asChild variant="ghost">
                <Link href={p("audit")}>
                  {say(locale, c.activityAll)}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            }
          >
            {o.recent_activity.length ? (
              <AuditList locale={locale} rows={o.recent_activity} />
            ) : (
              <EmptyState locale={locale} />
            )}
          </Section>
        </div>

        <Section id="pending" title={say(locale, c.pending)}>
          <ul className="divide-y rounded-lg border bg-card">
            {pendingItems.map(([label, value, href]) => (
              <li key={href}>
                <Link
                  href={href}
                  className="flex min-h-11 items-center justify-between gap-4 px-4 py-2.5 text-sm outline-none hover:bg-neutral-1 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <span className={value ? "font-medium" : "text-muted-foreground"}>
                    {say(locale, label)}
                  </span>
                  <span
                    className={
                      value
                        ? "rounded-full bg-primary-soft px-2 text-sm font-bold text-primary-ink [font-variant-numeric:tabular-nums]"
                        : "text-muted-foreground [font-variant-numeric:tabular-nums]"
                    }
                  >
                    {n(value)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </>
  );
}
