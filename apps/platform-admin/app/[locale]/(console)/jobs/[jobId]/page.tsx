import { formatNumber } from "@wlbp/i18n";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  approveJobAction,
  cancelJobAction,
  retryJobAction,
} from "../../../../_lib/actions/operations";
import { copyFor, fill, say, statusCopy } from "../../../../_lib/copy";
import { callOperator } from "../../../../_lib/operator-api";
import { atLeast, getOperator } from "../../../../_lib/operator-page";
import { operationsCopy, workerForKind } from "../../../../_lib/operations-copy";
import { pageLocale } from "../../../../_lib/page-locale";
import { PageHeader } from "../../../../_lib/shell/page-header";
import { ActionDialog } from "../../../../_lib/ui/action-dialog";
import { DetailSummary } from "../../../../_lib/ui/audit-list";
import { Facts } from "../../../../_lib/ui/facts";
import { Unknown, UnavailableState } from "../../../../_lib/ui/states";
import { StatusBadge } from "../../../../_lib/ui/status-badge";
import { TimeValue } from "../../../../_lib/ui/time";

export const dynamic = "force-dynamic";

const c = operationsCopy.jobs;

type Job = {
  id: string;
  kind: string;
  status: string;
  tenant_id: string | null;
  tenant_name: string | null;
  instance_id: string | null;
  attempts: number;
  last_error_code: string | null;
  parameters: Record<string, unknown>;
  requested_by_email: string | null;
  approved_by_email: string | null;
  reason: string | null;
  needs_approval: boolean;
  locked_until: string | null;
  created_at: string;
  started_at: string | null;
  updated_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  events: {
    event: string;
    attempt: number | null;
    error_code: string | null;
    actor_email: string | null;
    at: string;
  }[];
};

export default async function JobPage({
  params,
}: {
  params: Promise<{ locale: string; jobId: string }>;
}) {
  const locale = await pageLocale(params);
  const { jobId } = await params;
  const operator = await getOperator(locale);
  if (!operator) return null;
  if (!/^[0-9a-f-]{36}$/u.test(jobId)) notFound();
  const result = await callOperator("get_job_v1", { p_job_id: jobId });
  if (!result.ok && result.code === "not_found") notFound();
  const crumbs = [[say(locale, c.title), `/${locale}/jobs`]] as const;
  if (!result.ok)
    return (
      <>
        <PageHeader locale={locale} title={say(locale, c.title)} breadcrumbs={crumbs} />
        <UnavailableState locale={locale} code={result.code} />
      </>
    );
  const job = result.data as unknown as Job;
  const title = say(
    locale,
    operationsCopy.kinds[job.kind as keyof typeof operationsCopy.kinds] ?? [
      job.kind,
      job.kind,
    ],
  );
  const hidden = { jobId: job.id, tenantId: job.tenant_id ?? "" };
  const worker = say(
    locale,
    operationsCopy.workers[workerForKind[job.kind] ?? "infrastructure"],
  );
  const canOperate = atLeast(operator.role, "operator");

  return (
    <>
      <PageHeader
        locale={locale}
        title={title}
        breadcrumbs={[...crumbs, [title]]}
        actions={
          <>
            <StatusBadge
              locale={locale}
              status={job.needs_approval ? "awaiting_approval" : job.status}
            />
            {job.needs_approval && atLeast(operator.role, "admin") ? (
              <ActionDialog
                locale={locale}
                action={approveJobAction}
                trigger={say(locale, c.approve)}
                triggerVariant="primary"
                title={say(locale, c.approveTitle)}
                description={say(locale, c.approveBody)}
                submit={say(locale, c.approve)}
                successMessage={say(locale, c.approved)}
                hidden={hidden}
              />
            ) : null}
            {canOperate && job.status === "failed" ? (
              <ActionDialog
                locale={locale}
                action={retryJobAction}
                trigger={say(locale, c.retry)}
                title={say(locale, c.retryTitle)}
                submit={say(locale, c.retry)}
                successMessage={say(locale, c.retried)}
                reason={{ minLength: 5 }}
                hidden={hidden}
              />
            ) : null}
            {canOperate && (job.status === "queued" || job.status === "failed") ? (
              <ActionDialog
                locale={locale}
                action={cancelJobAction}
                trigger={say(locale, c.cancel)}
                danger
                title={say(locale, c.cancelTitle)}
                description={say(locale, c.cancelBody)}
                submit={say(locale, c.cancel)}
                successMessage={say(locale, c.cancelled)}
                reason={{ minLength: 5 }}
                hidden={hidden}
              />
            ) : null}
          </>
        }
      />
      {job.status === "queued" ? (
        <p className="notice notice--warning">
          {fill(locale, c.workerNote, { worker })}
        </p>
      ) : null}
      <section className="section" aria-labelledby="job-facts">
        <h2 id="job-facts" className="sr-only">
          {title}
        </h2>
        <Facts
          items={[
            [
              say(locale, c.tenant),
              job.tenant_id ? (
                <Link key="t" href={`/${locale}/tenants/${job.tenant_id}`}>
                  <bdi>{job.tenant_name}</bdi>
                </Link>
              ) : (
                <Unknown key="t" locale={locale} kind="none" />
              ),
            ],
            [say(locale, c.attempts), formatNumber(job.attempts, locale)],
            [
              say(locale, c.error),
              job.last_error_code ? (
                <bdi key="e">{job.last_error_code}</bdi>
              ) : (
                <Unknown key="e" locale={locale} kind="none" />
              ),
            ],
            [
              say(locale, c.requestedBy),
              <bdi key="r">{job.requested_by_email ?? "—"}</bdi>,
            ],
            [
              say(locale, c.approvedBy),
              job.approved_by_email ? (
                <bdi key="a">{job.approved_by_email}</bdi>
              ) : (
                <Unknown key="a" locale={locale} kind="none" />
              ),
            ],
            [
              say(locale, c.reason),
              job.reason ?? <Unknown key="re" locale={locale} kind="none" />,
            ],
            [
              say(locale, c.created),
              <TimeValue key="c" locale={locale} value={job.created_at} />,
            ],
            [
              say(locale, c.started),
              <TimeValue key="s" locale={locale} value={job.started_at} />,
            ],
            [
              say(locale, c.lockedUntil),
              <TimeValue
                key="l"
                locale={locale}
                value={job.locked_until}
                empty="none"
              />,
            ],
            [
              say(locale, c.completed),
              <TimeValue key="d" locale={locale} value={job.completed_at} />,
            ],
            [
              say(locale, c.parameters),
              <DetailSummary key="p" detail={job.parameters} />,
            ],
          ]}
        />
      </section>
      <section className="section" aria-labelledby="job-events">
        <div className="section-header">
          <h2 id="job-events">{say(locale, c.events)}</h2>
        </div>
        <ol className="timeline">
          {job.events.map((e, index) => (
            <li key={`${e.at}:${index}`}>
              <TimeValue locale={locale} value={e.at} />
              <div>
                <strong>{copyFor(statusCopy, e.event, locale)}</strong>
                {e.attempt !== null ? <> · #{formatNumber(e.attempt, locale)}</> : null}
                {e.actor_email ? (
                  <>
                    {" "}
                    · <bdi>{e.actor_email}</bdi>
                  </>
                ) : null}
                {e.error_code ? (
                  <span className="secondary">
                    <bdi>{e.error_code}</bdi>
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
