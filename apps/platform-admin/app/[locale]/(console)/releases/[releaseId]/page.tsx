import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import {
  createRolloutAction,
  setReleaseStatusAction,
} from "../../../../_lib/actions/releases";
import { copyFor, reasonCopy, say, stateCopy, statusCopy } from "../../../../_lib/copy";
import { callOperator } from "../../../../_lib/operator-api";
import { atLeast, getOperator } from "../../../../_lib/operator-page";
import { pageLocale } from "../../../../_lib/page-locale";
import { readPages } from "../../../../_lib/read-pages";
import { releaseCopy } from "../../../../_lib/release-copy";
import { PageHeader } from "../../../../_lib/shell/page-header";
import { ActionDialog } from "../../../../_lib/ui/action-dialog";
import { DataTable } from "../../../../_lib/ui/data-table";
import { Facts } from "../../../../_lib/ui/facts";
import { EmptyState, Unknown, UnavailableState } from "../../../../_lib/ui/states";
import { StatusBadge } from "../../../../_lib/ui/status-badge";
import { TimeValue } from "../../../../_lib/ui/time";

export const dynamic = "force-dynamic";

const c = releaseCopy.releases;

type Release = {
  id: string;
  version: string;
  channel: string;
  git_commit: string;
  config_schema_version: number;
  backend_contract_min: number;
  backend_contract_max: number;
  migration_ids: string[];
  feature_notes: string[];
  upgrade_notes: string[];
  reversible: boolean;
  status: string;
  created_at: string;
  registered_by_email: string | null;
  prerequisites: string[];
  backend_contract_version: number;
  versions: {
    instance_id: string;
    tenant_id: string;
    tenant_name: string;
    desired_release: string | null;
    current_release: string | null;
    config_schema_version: number;
    reported_at: string | null;
  }[];
  rollouts: {
    id: string;
    status: string;
    target_rings: string[];
    created_at: string;
  }[];
};

export default async function ReleasePage({
  params,
}: {
  params: Promise<{ locale: string; releaseId: string }>;
}) {
  const locale = await pageLocale(params);
  const { releaseId } = await params;
  const operator = await getOperator(locale);
  if (!operator) return null;
  if (!/^[0-9a-f-]{36}$/u.test(releaseId)) notFound();
  const result = await callOperator("get_release_v1", { p_release_id: releaseId });
  if (!result.ok && result.code === "not_found") notFound();
  const crumbs = [[say(locale, c.title), `/${locale}/releases`]] as const;
  if (!result.ok)
    return (
      <>
        <PageHeader locale={locale} title={say(locale, c.title)} breadcrumbs={crumbs} />
        <UnavailableState locale={locale} code={result.code} />
      </>
    );
  const r = result.data as unknown as Release;
  const admin = atLeast(operator.role, "admin");
  const instances =
    admin && r.status === "available"
      ? await readPages((p_offset, p_limit) =>
          callOperator("list_instances_v1", { p_state: "active", p_offset, p_limit }),
        )
      : null;
  const status = (s: string) => copyFor(statusCopy, s, locale);

  return (
    <>
      <PageHeader
        locale={locale}
        title={r.version}
        breadcrumbs={[...crumbs, [r.version]]}
        actions={
          <>
            <StatusBadge locale={locale} status={r.status} />
            {admin && r.status === "available" ? (
              <ActionDialog
                locale={locale}
                action={createRolloutAction}
                trigger={say(locale, c.createRollout)}
                triggerVariant="primary"
                title={say(locale, c.createRolloutTitle)}
                description={say(locale, c.createRolloutBody)}
                submit={say(locale, c.createRollout)}
                successMessage={say(locale, c.rolloutCreated)}
                reason={{ minLength: 5 }}
                hidden={{ releaseId: r.id, idempotencyKey: randomUUID() }}
              >
                <fieldset>
                  <legend>{say(locale, c.rings)}</legend>
                  {(["canary", "early", "general"] as const).map((ring) => (
                    <label key={ring} className="checkbox">
                      <input type="checkbox" name="rings" value={ring} /> {status(ring)}
                    </label>
                  ))}
                </fieldset>
                <fieldset>
                  <legend>{say(locale, c.instances)}</legend>
                  {instances?.ok ? (
                    instances.data.map((instance) => (
                      <label key={instance.instance_id} className="checkbox">
                        <input
                          type="checkbox"
                          name="instanceIds"
                          value={instance.instance_id}
                        />
                        <bdi>
                          {instance.tenant_name} · {instance.instance_id.slice(0, 8)}
                        </bdi>
                      </label>
                    ))
                  ) : (
                    <UnavailableState locale={locale} />
                  )}
                </fieldset>
              </ActionDialog>
            ) : null}
            {admin ? (
              <ActionDialog
                locale={locale}
                action={setReleaseStatusAction}
                danger={r.status === "available"}
                trigger={say(
                  locale,
                  r.status === "available" ? c.withdraw : c.makeAvailable,
                )}
                title={say(
                  locale,
                  r.status === "available" ? c.withdrawTitle : c.makeAvailableTitle,
                )}
                description={
                  r.status === "available" ? say(locale, c.withdrawBody) : undefined
                }
                submit={say(
                  locale,
                  r.status === "available" ? c.withdraw : c.makeAvailable,
                )}
                successMessage={say(locale, c.statusChanged)}
                reason={{ minLength: 5 }}
                hidden={{
                  releaseId: r.id,
                  status: r.status === "available" ? "withdrawn" : "available",
                }}
              />
            ) : null}
          </>
        }
      />

      <section className="section" aria-labelledby="release-facts">
        <h2 id="release-facts" className="sr-only">
          {r.version}
        </h2>
        <Facts
          items={[
            [say(locale, c.channel), status(r.channel)],
            [say(locale, c.commit), <bdi key="g">{r.git_commit}</bdi>],
            [say(locale, c.configSchema), String(r.config_schema_version)],
            [
              say(locale, c.contract),
              `${r.backend_contract_min}–${r.backend_contract_max} (${r.backend_contract_version})`,
            ],
            [
              say(locale, c.reversible),
              say(locale, r.reversible ? stateCopy.yes : stateCopy.no),
            ],
            [
              say(locale, c.registeredBy),
              <bdi key="b">{r.registered_by_email ?? "—"}</bdi>,
            ],
            [
              say(locale, c.created),
              <TimeValue key="t" locale={locale} value={r.created_at} />,
            ],
            [
              say(locale, c.migrations),
              r.migration_ids.length ? (
                <bdi key="m">{r.migration_ids.join(", ")}</bdi>
              ) : (
                <Unknown key="m" locale={locale} kind="none" />
              ),
            ],
          ]}
        />
      </section>

      <section className="section" aria-labelledby="prereq-title">
        <div className="section-header">
          <h2 id="prereq-title">{say(locale, c.prerequisites)}</h2>
        </div>
        {r.prerequisites.length ? (
          <ul>
            {r.prerequisites.map((p) => (
              <li key={p}>
                {copyFor(reasonCopy, p, locale)} <bdi className="secondary">{p}</bdi>
              </li>
            ))}
          </ul>
        ) : (
          <p>{say(locale, c.ready)}</p>
        )}
      </section>

      <section className="section" aria-labelledby="notes-title">
        <div className="section-header">
          <h2 id="notes-title">{say(locale, c.notes)}</h2>
        </div>
        <h3>{say(locale, c.featureNotes)}</h3>
        <ul>
          {r.feature_notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <h3>{say(locale, c.upgradeNotes)}</h3>
        <ul>
          {r.upgrade_notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </section>

      <section className="section" aria-labelledby="versions-title">
        <div className="section-header">
          <h2 id="versions-title">{say(locale, c.versions)}</h2>
        </div>
        {r.versions.length === 0 ? (
          <EmptyState locale={locale} />
        ) : (
          <DataTable
            id="versions-table"
            locale={locale}
            caption={say(locale, c.versions)}
            columns={[
              { label: say(locale, c.tenant) },
              { label: say(locale, c.desiredRelease) },
              { label: say(locale, c.reportedRelease) },
              { label: say(locale, c.reportedAt) },
            ]}
            rows={r.versions.map((v) => ({
              key: v.instance_id,
              cells: [
                <Link key="t" href={`/${locale}/instances/${v.instance_id}`}>
                  <bdi>{v.tenant_name}</bdi>
                </Link>,
                <bdi key="d">{v.desired_release ?? "—"}</bdi>,
                v.current_release ? (
                  <bdi key="c">{v.current_release}</bdi>
                ) : (
                  <Unknown key="c" locale={locale} kind="notReported" />
                ),
                <TimeValue
                  key="r"
                  locale={locale}
                  value={v.reported_at}
                  empty="notReported"
                />,
              ],
            }))}
          />
        )}
      </section>

      <section className="section" aria-labelledby="rollouts-title">
        <div className="section-header">
          <h2 id="rollouts-title">{say(locale, c.rollouts)}</h2>
        </div>
        {r.rollouts.length === 0 ? (
          <EmptyState locale={locale} />
        ) : (
          <ul>
            {r.rollouts.map((o) => (
              <li key={o.id}>
                <Link href={`/${locale}/rollouts/${o.id}`}>
                  {o.target_rings.map(status).join(", ") || "—"}
                </Link>{" "}
                <StatusBadge locale={locale} status={o.status} />{" "}
                <TimeValue locale={locale} value={o.created_at} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
