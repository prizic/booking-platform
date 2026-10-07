import { ReferenceCode } from "@wlbp/ui-foundation";
import { formatNumber } from "@wlbp/i18n";
import { TextLink } from "../../../../_lib/ui/text";
import { notFound } from "next/navigation";
import { copyFor, fill, reasonCopy, say, statusCopy } from "../../../../_lib/copy";
import { callOperator } from "../../../../_lib/operator-api";
import { atLeast, getOperator } from "../../../../_lib/operator-page";
import { operationsCopy } from "../../../../_lib/operations-copy";
import { pageLocale } from "../../../../_lib/page-locale";
import { PageHeader } from "../../../../_lib/shell/page-header";
import { ActionDialog } from "../../../../_lib/ui/action-dialog";
import { DetailSummary } from "../../../../_lib/ui/audit-list";
import { DataTable } from "../../../../_lib/ui/data-table";
import { Facts } from "../../../../_lib/ui/facts";
import { Unknown, UnavailableState } from "../../../../_lib/ui/states";
import { StatusBadge } from "../../../../_lib/ui/status-badge";
import { TimeValue } from "../../../../_lib/ui/time";

export const dynamic = "force-dynamic";

const c = operationsCopy.provisioning;

type Step = {
  step_key: string;
  order: number;
  provider: string | null;
  required: boolean;
  status: string;
  attempts: number;
  max_attempts: number;
  external_id: string | null;
  waiting_reason: string | null;
  error_code: string | null;
  retry_after: string | null;
  locked_until: string | null;
  started_at: string | null;
  last_success_at: string | null;
  updated_at: string;
};
type Run = {
  id: string;
  tenant_id: string;
  tenant_name: string;
  instance_id: string;
  slug: string;
  plan_key: string;
  state: string;
  waiting_reason: string | null;
  last_error_code: string | null;
  desired_release: string;
  config_schema_version: number;
  backend_contract_min: number;
  backend_contract_max: number;
  requested_by_email: string | null;
  activated_at: string | null;
  deactivated_at: string | null;
  deactivation_reason: string | null;
  created_at: string;
  updated_at: string;
  steps: Step[];
  timeline: {
    at: string;
    event: string;
    step_key: string | null;
    attempt: number | null;
    error_code: string | null;
    detail: Record<string, unknown>;
  }[];
};

const externalProviders = new Set(["github", "vercel", "resend"]);

export default async function RunPage({
  params,
}: {
  params: Promise<{ locale: string; runId: string }>;
}) {
  const locale = await pageLocale(params);
  const { runId } = await params;
  const operator = await getOperator(locale);
  if (!operator) return null;
  if (!/^[0-9a-f-]{36}$/u.test(runId)) notFound();
  const result = await callOperator("get_provisioning_run_detail_v1", {
    p_run_id: runId,
  });
  if (!result.ok && result.code === "not_found") notFound();
  const crumbs = [[say(locale, c.title), `/${locale}/provisioning`]] as const;
  if (!result.ok)
    return (
      <>
        <PageHeader locale={locale} title={say(locale, c.title)} breadcrumbs={crumbs} />
        <UnavailableState locale={locale} code={result.code} />
      </>
    );
  const run = result.data as unknown as Run;
  const hidden = { runId: run.id };
  const finished = run.state === "active" || run.state === "deactivated";
  const hasFailure =
    run.state === "failed" || run.steps.some((s) => s.status === "failed");
  const stepName = (key: string) =>
    say(
      locale,
      operationsCopy.stepNames[key as keyof typeof operationsCopy.stepNames] ?? [
        key,
        key,
      ],
    );

  return (
    <>
      <PageHeader
        locale={locale}
        timesInUtc
        title={run.slug}
        breadcrumbs={[...crumbs, [run.slug]]}
        meta={<ReferenceCode>{run.id}</ReferenceCode>}
        actions={
          <>
            <StatusBadge
              locale={locale}
              status={run.waiting_reason ? "waiting" : run.state}
            />
            {atLeast(operator.role, "operator") && !finished && hasFailure ? (
              <ActionDialog
                locale={locale}
                operation="retryRun"
                trigger={say(locale, c.retry)}
                title={say(locale, c.retryTitle)}
                description={say(locale, c.retryBody)}
                submit={say(locale, c.retry)}
                successMessage={say(locale, c.retried)}
                hidden={hidden}
              />
            ) : null}
            {atLeast(operator.role, "operator") && !finished ? (
              <ActionDialog
                locale={locale}
                operation="activateRun"
                trigger={say(locale, c.activate)}
                title={say(locale, c.activateTitle)}
                description={say(locale, c.activateBody)}
                submit={say(locale, c.activate)}
                successMessage={say(locale, c.activated)}
                hidden={hidden}
              />
            ) : null}
            {atLeast(operator.role, "admin") && run.state !== "deactivated" ? (
              <ActionDialog
                locale={locale}
                operation="deactivateRun"
                trigger={say(locale, c.deactivate)}
                danger
                title={say(locale, c.deactivateTitle)}
                description={say(locale, c.deactivateBody)}
                submit={say(locale, c.deactivate)}
                successMessage={say(locale, c.deactivated)}
                hidden={hidden}
              />
            ) : null}
          </>
        }
      />

      <section className="grid gap-4" aria-labelledby="run-facts">
        <h2 id="run-facts" className="sr-only">
          {say(locale, c.run)}
        </h2>
        <Facts
          items={[
            [
              say(locale, c.tenant),
              <TextLink key="t" href={`/${locale}/tenants/${run.tenant_id}`}>
                <bdi>{run.tenant_name}</bdi>
              </TextLink>,
            ],
            [
              say(locale, c.waitingReason),
              run.waiting_reason ? (
                copyFor(reasonCopy, `waiting_${run.waiting_reason}`, locale)
              ) : (
                <Unknown key="w" locale={locale} kind="none" />
              ),
            ],
            [
              say(locale, c.lastError),
              run.last_error_code ? (
                <bdi key="e">{run.last_error_code}</bdi>
              ) : (
                <Unknown key="e" locale={locale} kind="none" />
              ),
            ],
            [say(locale, c.release), <bdi key="r">{run.desired_release}</bdi>],
            [
              say(locale, c.contract),
              `${run.backend_contract_min}–${run.backend_contract_max}`,
            ],
            [
              say(locale, c.requestedBy),
              <bdi key="b">{run.requested_by_email ?? "—"}</bdi>,
            ],
            [
              say(locale, c.activatedAt),
              <TimeValue key="a" locale={locale} value={run.activated_at} />,
            ],
            [
              say(locale, c.deactivatedAt),
              <>
                {<TimeValue locale={locale} value={run.deactivated_at} />}{" "}
                {run.deactivation_reason}
              </>,
            ],
          ]}
        />
      </section>

      <section className="grid gap-4" aria-labelledby="steps-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="steps-title" className="text-lg leading-snug font-semibold">
            {say(locale, c.steps)}
          </h2>
        </div>
        <DataTable
          id="steps-table"
          locale={locale}
          caption={say(locale, c.steps)}
          columns={[
            { label: say(locale, c.step) },
            { label: say(locale, c.provider) },
            { label: say(locale, c.status) },
            { label: say(locale, c.attempts), numeric: true },
            { label: say(locale, c.started) },
            { label: say(locale, c.lastSuccess) },
            { label: say(locale, c.retryAfter) },
          ]}
          rows={run.steps.map((s) => ({
            key: s.step_key,
            cells: [
              <>
                {stepName(s.step_key)}
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                  <bdi>{s.step_key}</bdi>
                  {s.external_id ? (
                    <>
                      {" "}
                      · <bdi>{s.external_id}</bdi>
                    </>
                  ) : null}
                </span>
              </>,
              s.provider ? (
                <bdi key="p">{s.provider}</bdi>
              ) : (
                <Unknown key="p" locale={locale} kind="none" />
              ),
              <>
                <StatusBadge locale={locale} status={s.status} />
                {s.waiting_reason ? (
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    {copyFor(reasonCopy, `waiting_${s.waiting_reason}`, locale)}
                  </span>
                ) : null}
                {s.error_code ? (
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    <bdi>{s.error_code}</bdi>
                  </span>
                ) : null}
                {s.status === "pending" &&
                s.provider &&
                externalProviders.has(s.provider) ? (
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    {fill(locale, c.externalWorker, {
                      worker: say(
                        locale,
                        operationsCopy.workers[
                          s.provider as "github" | "vercel" | "resend"
                        ],
                      ),
                    })}
                  </span>
                ) : null}
              </>,
              `${formatNumber(s.attempts, locale)} / ${formatNumber(s.max_attempts, locale)}`,
              <TimeValue key="st" locale={locale} value={s.started_at} />,
              <TimeValue key="ok" locale={locale} value={s.last_success_at} />,
              <TimeValue key="ra" locale={locale} value={s.retry_after} empty="none" />,
            ],
          }))}
        />
      </section>

      <section className="grid gap-4" aria-labelledby="timeline-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="timeline-title" className="text-lg leading-snug font-semibold">
            {say(locale, c.timeline)}
          </h2>
        </div>
        <ol className="divide-y rounded-lg border bg-card">
          {run.timeline.map((e, index) => (
            <li
              key={`${e.at}:${index}`}
              className="grid gap-1.5 px-4 py-3 text-sm md:grid-cols-[13rem_minmax(0,1fr)] md:gap-4"
            >
              <TimeValue locale={locale} value={e.at} />
              <div className="min-w-0 leading-relaxed">
                <strong>{copyFor(statusCopy, e.event, locale)}</strong>{" "}
                <bdi>{e.event}</bdi>
                {e.step_key ? <> · {stepName(e.step_key)}</> : null}
                {e.attempt !== null ? <> · #{formatNumber(e.attempt, locale)}</> : null}
                {e.error_code ? (
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    <bdi>{e.error_code}</bdi>
                  </span>
                ) : null}
                <DetailSummary detail={e.detail} />
              </div>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
