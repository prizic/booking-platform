import { formatNumber } from "@wlbp/i18n";
import { Badge, ReferenceCode } from "@wlbp/ui-foundation";
import { TextLink } from "../../../../_lib/ui/text";
import { notFound } from "next/navigation";
import { say, stateCopy } from "../../../../_lib/copy";
import { callOperator } from "../../../../_lib/operator-api";
import { getOperator } from "../../../../_lib/operator-page";
import { operationsCopy } from "../../../../_lib/operations-copy";
import { pageLocale } from "../../../../_lib/page-locale";
import { PageHeader } from "../../../../_lib/shell/page-header";
import { DataTable } from "../../../../_lib/ui/data-table";
import { Facts } from "../../../../_lib/ui/facts";
import { EmptyState, Unknown, UnavailableState } from "../../../../_lib/ui/states";
import { StatusBadge } from "../../../../_lib/ui/status-badge";
import { TimeValue } from "../../../../_lib/ui/time";

export const dynamic = "force-dynamic";

const c = operationsCopy.instances;

type InstanceDetail = {
  id: string;
  tenant_id: string;
  tenant_name: string;
  deployment_state: string;
  brand_published: boolean;
  created_at: string;
  release: {
    desired_release: string | null;
    current_release: string | null;
    config_schema_version: number;
    customization_tier: string;
    supported_backend_min: number;
    supported_backend_max: number;
    environment_verified: boolean;
    reported_at: string | null;
  } | null;
  infrastructure: {
    id: string;
    provider: string;
    resource_kind: string;
    external_id: string;
    desired_state: Record<string, unknown>;
    observed_state: Record<string, unknown>;
    drifted: boolean | null;
    observed_at: string | null;
    attempts: number;
    last_success_at: string | null;
    last_error_code: string | null;
  }[];
  health: {
    subject_key: string;
    signal: string;
    status: string;
    error_code: string | null;
    observed_at: string;
  }[];
  domains: {
    id: string;
    hostname: string;
    application: string;
    verification_status: string;
    active: boolean;
  }[];
  runs: { id: string; state: string; slug: string; updated_at: string }[];
};

export default async function InstancePage({
  params,
}: {
  params: Promise<{ locale: string; instanceId: string }>;
}) {
  const locale = await pageLocale(params);
  const { instanceId } = await params;
  if (!(await getOperator(locale))) return null;
  if (!/^[0-9a-f-]{36}$/u.test(instanceId)) notFound();
  const result = await callOperator("get_instance_v1", { p_instance_id: instanceId });
  if (!result.ok && result.code === "not_found") notFound();
  const crumbs = [[say(locale, c.title), `/${locale}/instances`]] as const;
  if (!result.ok)
    return (
      <>
        <PageHeader locale={locale} title={say(locale, c.title)} breadcrumbs={crumbs} />
        <UnavailableState locale={locale} code={result.code} />
      </>
    );
  const d = result.data as unknown as InstanceDetail;
  const r = d.release;

  return (
    <>
      <PageHeader
        locale={locale}
        timesInUtc
        title={`${d.tenant_name} · ${d.id.slice(0, 8)}`}
        breadcrumbs={[...crumbs, [d.id.slice(0, 8)]]}
        meta={<ReferenceCode>{d.id}</ReferenceCode>}
        actions={<StatusBadge locale={locale} status={d.deployment_state} />}
      />
      <section className="grid gap-4" aria-labelledby="release-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="release-title" className="text-lg leading-snug font-semibold">
            {say(locale, c.releaseState)}
          </h2>
        </div>
        <Facts
          items={[
            [
              say(locale, c.tenant),
              <TextLink key="t" href={`/${locale}/tenants/${d.tenant_id}`}>
                <bdi>{d.tenant_name}</bdi>
              </TextLink>,
            ],
            [
              say(locale, c.release),
              r ? (
                <bdi key="r">
                  {r.desired_release ?? "—"} →{" "}
                  {r.current_release ?? say(locale, stateCopy.notReported)}
                </bdi>
              ) : (
                <Unknown key="r" locale={locale} kind="notReported" />
              ),
            ],
            [
              say(locale, c.configSchema),
              r ? (
                String(r.config_schema_version)
              ) : (
                <Unknown key="c" locale={locale} kind="notReported" />
              ),
            ],
            [
              say(locale, c.tier),
              r ? (
                <bdi key="tier">{r.customization_tier}</bdi>
              ) : (
                <Unknown key="tier" locale={locale} kind="notReported" />
              ),
            ],
            [
              say(locale, c.contract),
              r ? (
                `${r.supported_backend_min}–${r.supported_backend_max}`
              ) : (
                <Unknown key="k" locale={locale} kind="notReported" />
              ),
            ],
            [
              say(locale, c.environment),
              r ? (
                say(locale, r.environment_verified ? stateCopy.yes : stateCopy.no)
              ) : (
                <Unknown key="e" locale={locale} kind="notReported" />
              ),
            ],
            [
              say(locale, c.reportedAt),
              <TimeValue
                key="at"
                locale={locale}
                value={r?.reported_at}
                empty="notReported"
                staleAfterMinutes={1440}
              />,
            ],
          ]}
        />
      </section>

      <section className="grid gap-4" aria-labelledby="infra-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="infra-title" className="text-lg leading-snug font-semibold">
            {say(locale, c.resources)}
          </h2>
        </div>
        {d.infrastructure.length === 0 ? (
          <EmptyState locale={locale} title={say(locale, c.noResources)} />
        ) : (
          d.infrastructure.map((f) => (
            <article
              key={f.id}
              aria-labelledby={`res-${f.id}`}
              className="grid gap-4 rounded-lg border bg-card p-5"
            >
              <div className="flex flex-wrap items-end justify-between gap-3">
                <h3 id={`res-${f.id}`} className="text-base font-semibold">
                  <bdi>
                    {f.provider} · {f.resource_kind}
                  </bdi>
                </h3>
                <Badge
                  tone={
                    !f.observed_at || f.drifted === null
                      ? "neutral"
                      : f.drifted
                        ? "warning"
                        : "positive"
                  }
                >
                  {say(
                    locale,
                    !f.observed_at || f.drifted === null
                      ? stateCopy.notObserved
                      : f.drifted
                        ? c.drifted
                        : c.inSync,
                  )}
                </Badge>
              </div>
              <Facts
                items={[
                  [say(locale, c.externalId), <bdi key="x">{f.external_id}</bdi>],
                  [
                    say(locale, c.observedAt),
                    <TimeValue
                      key="o"
                      locale={locale}
                      value={f.observed_at}
                      empty="notObserved"
                      staleAfterMinutes={60}
                    />,
                  ],
                  [say(locale, c.attempts), formatNumber(f.attempts, locale)],
                  [
                    say(locale, c.lastSuccess),
                    <TimeValue key="s" locale={locale} value={f.last_success_at} />,
                  ],
                  [
                    say(locale, c.lastError),
                    f.last_error_code ? (
                      <bdi key="e">{f.last_error_code}</bdi>
                    ) : (
                      <Unknown key="e" locale={locale} kind="none" />
                    ),
                  ],
                ]}
              />
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="grid min-w-0 gap-2">
                  <h4 className="text-sm font-semibold text-muted-foreground">
                    {say(locale, c.desired)}
                  </h4>
                  <pre
                    dir="ltr"
                    tabIndex={0}
                    className="max-h-80 overflow-auto rounded-md bg-muted p-3 font-latin text-xs leading-relaxed"
                  >
                    {JSON.stringify(f.desired_state, null, 2)}
                  </pre>
                </div>
                <div className="grid min-w-0 gap-2">
                  <h4 className="text-sm font-semibold text-muted-foreground">
                    {say(locale, c.observed)}
                  </h4>
                  <pre
                    dir="ltr"
                    tabIndex={0}
                    className="max-h-80 overflow-auto rounded-md bg-muted p-3 font-latin text-xs leading-relaxed"
                  >
                    {JSON.stringify(f.observed_state, null, 2)}
                  </pre>
                </div>
              </div>
            </article>
          ))
        )}
      </section>

      <section className="grid gap-4" aria-labelledby="signals-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="signals-title" className="text-lg leading-snug font-semibold">
            {say(locale, c.signals)}
          </h2>
        </div>
        {d.health.length === 0 ? (
          <p>
            <Unknown locale={locale} />
          </p>
        ) : (
          <DataTable
            id="signals-table"
            locale={locale}
            caption={say(locale, c.signals)}
            columns={[
              { label: say(locale, c.signal) },
              { label: say(locale, c.health) },
              { label: say(locale, c.observedAt) },
            ]}
            rows={d.health.map((h) => ({
              key: `${h.subject_key}:${h.signal}`,
              cells: [
                <bdi key="s">
                  {h.subject_key} · {h.signal}
                </bdi>,
                <>
                  <StatusBadge locale={locale} status={h.status} />
                  {h.error_code ? (
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                      <bdi>{h.error_code}</bdi>
                    </span>
                  ) : null}
                </>,
                <TimeValue
                  key="t"
                  locale={locale}
                  value={h.observed_at}
                  staleAfterMinutes={30}
                />,
              ],
            }))}
          />
        )}
      </section>

      <section className="grid gap-4" aria-labelledby="links-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="links-title" className="text-lg leading-snug font-semibold">
            {say(locale, c.domains)} · {say(locale, c.runs)}
          </h2>
        </div>
        <ul className="divide-y rounded-lg border bg-card">
          {d.domains.map((dom) => (
            <li
              key={dom.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
            >
              <bdi>{dom.hostname}</bdi>{" "}
              <StatusBadge locale={locale} status={dom.verification_status} />
            </li>
          ))}
          {d.runs.map((run) => (
            <li
              key={run.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
            >
              <TextLink href={`/${locale}/provisioning/${run.id}`}>
                <bdi>{run.slug}</bdi>
              </TextLink>{" "}
              <StatusBadge locale={locale} status={run.state} />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
