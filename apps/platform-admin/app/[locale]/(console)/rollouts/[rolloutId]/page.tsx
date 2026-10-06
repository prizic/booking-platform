import { formatNumber } from "@wlbp/i18n";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  cancelRolloutAction,
  pauseRolloutAction,
  retryRolloutAction,
  rollbackRolloutAction,
  startRolloutAction,
} from "../../../../_lib/actions/releases";
import type { AuditRow } from "../../../../_lib/audit-copy";
import { copyFor, reasonCopy, say, statusCopy } from "../../../../_lib/copy";
import { callOperator } from "../../../../_lib/operator-api";
import { atLeast, getOperator } from "../../../../_lib/operator-page";
import { pageLocale } from "../../../../_lib/page-locale";
import { releaseCopy } from "../../../../_lib/release-copy";
import { PageHeader } from "../../../../_lib/shell/page-header";
import { ActionDialog } from "../../../../_lib/ui/action-dialog";
import { AuditList } from "../../../../_lib/ui/audit-list";
import { DataTable } from "../../../../_lib/ui/data-table";
import { Facts } from "../../../../_lib/ui/facts";
import { EmptyState, Unknown, UnavailableState } from "../../../../_lib/ui/states";
import { StatusBadge } from "../../../../_lib/ui/status-badge";
import { TimeValue } from "../../../../_lib/ui/time";

export const dynamic = "force-dynamic";

const c = releaseCopy.rollouts;

type Rollout = {
  id: string;
  status: string;
  target_rings: string[];
  reason: string;
  created_by_email: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
  release: {
    id: string;
    version: string;
    channel: string;
    reversible: boolean;
    status: string;
  };
  blocked: string[];
  counts: Record<string, number>;
  targets: {
    instance_id: string;
    tenant_id: string;
    tenant_name: string;
    ring: string | null;
    from_release: string | null;
    status: string;
    attempts: number;
    error_code: string | null;
    job_id: string | null;
    job_status: string | null;
    current_release: string | null;
    reported_at: string | null;
    updated_at: string;
  }[];
  history: AuditRow[];
};

export default async function RolloutPage({
  params,
}: {
  params: Promise<{ locale: string; rolloutId: string }>;
}) {
  const locale = await pageLocale(params);
  const { rolloutId } = await params;
  const operator = await getOperator(locale);
  if (!operator) return null;
  if (!/^[0-9a-f-]{36}$/u.test(rolloutId)) notFound();
  const result = await callOperator("get_rollout_v1", { p_rollout_id: rolloutId });
  if (!result.ok && result.code === "not_found") notFound();
  const crumbs = [[say(locale, c.title), `/${locale}/rollouts`]] as const;
  if (!result.ok)
    return (
      <>
        <PageHeader locale={locale} title={say(locale, c.title)} breadcrumbs={crumbs} />
        <UnavailableState locale={locale} code={result.code} />
      </>
    );
  const o = result.data as unknown as Rollout;
  const hidden = { rolloutId: o.id };
  const admin = atLeast(operator.role, "admin");
  const operatorRole = atLeast(operator.role, "operator");
  const status = (s: string) => copyFor(statusCopy, s, locale);
  const hasFailed = (o.counts.failed ?? 0) > 0;
  const title = `${o.release.version} · ${o.target_rings.map(status).join(", ")}`;

  return (
    <>
      <PageHeader
        locale={locale}
        title={title}
        breadcrumbs={[...crumbs, [o.release.version]]}
        actions={
          <>
            <StatusBadge locale={locale} status={o.status} />
            {admin && (o.status === "draft" || o.status === "paused") ? (
              <ActionDialog
                locale={locale}
                action={startRolloutAction}
                triggerVariant="primary"
                trigger={say(locale, o.status === "draft" ? c.start : c.resume)}
                title={say(locale, c.startTitle)}
                description={say(locale, c.startBody)}
                submit={say(locale, o.status === "draft" ? c.start : c.resume)}
                successMessage={say(locale, c.started_ok)}
                hidden={hidden}
              />
            ) : null}
            {operatorRole && o.status === "running" ? (
              <ActionDialog
                locale={locale}
                action={pauseRolloutAction}
                trigger={say(locale, c.pause)}
                title={say(locale, c.pauseTitle)}
                description={say(locale, c.pauseBody)}
                submit={say(locale, c.pause)}
                successMessage={say(locale, c.paused)}
                reason={{ minLength: 5 }}
                hidden={hidden}
              />
            ) : null}
            {operatorRole &&
            hasFailed &&
            ["running", "paused", "failed"].includes(o.status) ? (
              <ActionDialog
                locale={locale}
                action={retryRolloutAction}
                trigger={say(locale, c.retry)}
                title={say(locale, c.retryTitle)}
                submit={say(locale, c.retry)}
                successMessage={say(locale, c.retried)}
                hidden={hidden}
              />
            ) : null}
            {admin && ["draft", "running", "paused"].includes(o.status) ? (
              <ActionDialog
                locale={locale}
                action={cancelRolloutAction}
                trigger={say(locale, c.cancel)}
                danger
                title={say(locale, c.cancelTitle)}
                submit={say(locale, c.cancel)}
                successMessage={say(locale, c.cancelled)}
                reason={{ minLength: 5 }}
                hidden={hidden}
              />
            ) : null}
            {admin &&
            o.release.reversible &&
            ["running", "paused", "completed", "failed"].includes(o.status) ? (
              <ActionDialog
                locale={locale}
                action={rollbackRolloutAction}
                trigger={say(locale, c.rollback)}
                danger
                title={say(locale, c.rollbackTitle)}
                description={say(locale, c.rollbackBody)}
                submit={say(locale, c.rollback)}
                successMessage={say(locale, c.rolledBack)}
                reason={{ minLength: 10 }}
                confirmText={o.release.version}
                hidden={hidden}
              />
            ) : null}
          </>
        }
      />
      {!o.release.reversible ? (
        <p className="notice notice--warning">{say(locale, c.rollbackUnavailable)}</p>
      ) : null}
      {["running", "paused"].includes(o.status) ? (
        <p className="notice">{say(locale, c.workerNote)}</p>
      ) : null}

      <section className="section" aria-labelledby="rollout-facts">
        <h2 id="rollout-facts" className="sr-only">
          {title}
        </h2>
        <Facts
          items={[
            [
              say(locale, c.version),
              <Link key="r" href={`/${locale}/releases/${o.release.id}`}>
                <bdi>{o.release.version}</bdi>
              </Link>,
            ],
            [say(locale, c.reason), o.reason],
            [say(locale, c.createdBy), <bdi key="b">{o.created_by_email ?? "—"}</bdi>],
            [
              say(locale, c.started),
              <TimeValue key="s" locale={locale} value={o.started_at} />,
            ],
            [
              say(locale, c.finished),
              <TimeValue key="f" locale={locale} value={o.finished_at} />,
            ],
            [
              say(locale, c.progress),
              Object.entries(o.counts)
                .map(([k, v]) => `${status(k)}: ${formatNumber(v, locale)}`)
                .join(" · "),
            ],
            [
              say(locale, c.blocked),
              o.blocked.length ? (
                <ul key="bl">
                  {o.blocked.map((b) => (
                    <li key={b}>{copyFor(reasonCopy, b, locale)}</li>
                  ))}
                </ul>
              ) : (
                <Unknown key="bl" locale={locale} kind="none" />
              ),
            ],
          ]}
        />
      </section>

      <section className="section" aria-labelledby="targets-title">
        <div className="section-header">
          <h2 id="targets-title">{say(locale, c.targets)}</h2>
        </div>
        {o.targets.length === 0 ? (
          <EmptyState locale={locale} />
        ) : (
          <DataTable
            id="targets-table"
            locale={locale}
            caption={say(locale, c.targets)}
            columns={[
              { label: say(locale, c.tenant) },
              { label: say(locale, c.ring) },
              { label: say(locale, c.from) },
              { label: say(locale, c.status) },
              { label: say(locale, c.attempts), numeric: true },
              { label: say(locale, c.job) },
              { label: say(locale, c.reported) },
            ]}
            rows={o.targets.map((t) => ({
              key: t.instance_id,
              cells: [
                <Link key="t" href={`/${locale}/instances/${t.instance_id}`}>
                  <bdi>{t.tenant_name}</bdi>
                </Link>,
                t.ring ? (
                  status(t.ring)
                ) : (
                  <Unknown key="r" locale={locale} kind="none" />
                ),
                t.from_release ? (
                  <bdi key="f">{t.from_release}</bdi>
                ) : (
                  <Unknown key="f" locale={locale} kind="notReported" />
                ),
                <>
                  <StatusBadge locale={locale} status={t.status} />
                  {t.error_code ? (
                    <span className="secondary">
                      {copyFor(reasonCopy, t.error_code, locale)}{" "}
                      <bdi>{t.error_code}</bdi>
                    </span>
                  ) : null}
                </>,
                formatNumber(t.attempts, locale),
                t.job_id ? (
                  <Link key="j" href={`/${locale}/jobs/${t.job_id}`}>
                    {status(t.job_status ?? "queued")}
                  </Link>
                ) : (
                  <Unknown key="j" locale={locale} kind="none" />
                ),
                t.current_release ? (
                  <>
                    <bdi>{t.current_release}</bdi>{" "}
                    <TimeValue locale={locale} value={t.reported_at} />
                  </>
                ) : (
                  <Unknown locale={locale} kind="notReported" />
                ),
              ],
            }))}
          />
        )}
      </section>

      <section className="section" aria-labelledby="history-title">
        <div className="section-header">
          <h2 id="history-title">{say(locale, c.history)}</h2>
        </div>
        {o.history.length ? (
          <AuditList locale={locale} rows={o.history} />
        ) : (
          <EmptyState locale={locale} />
        )}
      </section>
    </>
  );
}
