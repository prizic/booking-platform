import {
  Alert,
  AlertDescription,
  FieldLegend,
  FieldSet,
  ReferenceCode,
  Section,
} from "@wlbp/ui-foundation";
import Link from "next/link";
import { notFound } from "next/navigation";
import { copyFor, reasonCopy, say, stateCopy, statusCopy } from "../../../../_lib/copy";
import { callOperator } from "../../../../_lib/operator-api";
import { atLeast, getOperator } from "../../../../_lib/operator-page";
import { pageLocale } from "../../../../_lib/page-locale";
import { readPages } from "../../../../_lib/read-pages";
import { releaseCopy } from "../../../../_lib/release-copy";
import { rolloutRings } from "../../../../_lib/schemas/releases";
import { PageHeader } from "../../../../_lib/shell/page-header";
import { ActionDialog } from "../../../../_lib/ui/action-dialog";
import { DataTable } from "../../../../_lib/ui/data-table";
import { Facts } from "../../../../_lib/ui/facts";
import { CheckboxGroupFormField } from "../../../../_lib/ui/form-fields";
import { EmptyState, Unknown, UnavailableState } from "../../../../_lib/ui/states";
import { StatusBadge } from "../../../../_lib/ui/status-badge";
import { TimeValue } from "../../../../_lib/ui/time";

export const dynamic = "force-dynamic";

const c = releaseCopy.releases;
const linkClass = "font-semibold text-primary underline-offset-4 hover:underline";

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

function NoteList({ title, notes }: { title: string; notes: readonly string[] }) {
  return (
    <div className="grid content-start gap-2">
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <ul className="grid list-disc gap-1.5 ps-5 text-sm leading-relaxed">
        {notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </div>
  );
}

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
      <div className="grid gap-6">
        <PageHeader locale={locale} title={say(locale, c.title)} breadcrumbs={crumbs} />
        <UnavailableState locale={locale} code={result.code} />
      </div>
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
    <div className="grid gap-8">
      <PageHeader
        locale={locale}
        timesInUtc
        title={r.version}
        breadcrumbs={[...crumbs, [r.version]]}
        actions={
          <>
            <StatusBadge locale={locale} status={r.status} />
            {admin && r.status === "available" ? (
              <ActionDialog
                locale={locale}
                operation="createRollout"
                trigger={say(locale, c.createRollout)}
                triggerVariant="primary"
                title={say(locale, c.createRolloutTitle)}
                description={say(locale, c.createRolloutBody)}
                submit={say(locale, c.createRollout)}
                successMessage={say(locale, c.rolloutCreated)}
                hidden={{ releaseId: r.id }}
                values={{ rings: [], instanceIds: [] }}
              >
                <CheckboxGroupFormField
                  name="rings"
                  idPrefix="rollout-ring"
                  legend={say(locale, c.rings)}
                  options={rolloutRings.map((ring) => [ring, status(ring)] as const)}
                />
                {instances?.ok ? (
                  <CheckboxGroupFormField
                    name="instanceIds"
                    idPrefix="rollout-instance"
                    legend={say(locale, c.instances)}
                    options={instances.data.map(
                      (instance) =>
                        [
                          instance.instance_id,
                          <>
                            <bdi>{instance.tenant_name}</bdi>
                            <ReferenceCode className="text-xs font-medium text-muted-foreground">
                              {instance.instance_id.slice(0, 8)}
                            </ReferenceCode>
                          </>,
                        ] as const,
                    )}
                  />
                ) : (
                  <FieldSet className="gap-3">
                    <FieldLegend>{say(locale, c.instances)}</FieldLegend>
                    <UnavailableState locale={locale} />
                  </FieldSet>
                )}
              </ActionDialog>
            ) : null}
            {admin ? (
              <ActionDialog
                locale={locale}
                operation="setReleaseStatus"
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
                hidden={{
                  releaseId: r.id,
                  status: r.status === "available" ? "withdrawn" : "available",
                }}
              />
            ) : null}
          </>
        }
      />

      <section className="grid gap-4" aria-labelledby="release-facts">
        <h2 id="release-facts" className="sr-only">
          {r.version}
        </h2>
        <Facts
          items={[
            [say(locale, c.channel), status(r.channel)],
            [
              say(locale, c.commit),
              <ReferenceCode key="g" className="break-all">
                {r.git_commit}
              </ReferenceCode>,
            ],
            [say(locale, c.configSchema), String(r.config_schema_version)],
            [
              say(locale, c.contract),
              <bdi key="ct" dir="ltr">
                {`${r.backend_contract_min}–${r.backend_contract_max} (${r.backend_contract_version})`}
              </bdi>,
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
                <bdi key="m" dir="ltr" className="break-all">
                  {r.migration_ids.join(", ")}
                </bdi>
              ) : (
                <Unknown key="m" locale={locale} kind="none" />
              ),
            ],
          ]}
        />
      </section>

      <Section id="prereq" title={say(locale, c.prerequisites)}>
        {r.prerequisites.length ? (
          <Alert tone="warning">
            <AlertDescription>
              <ul className="grid list-disc gap-1 ps-5 text-foreground">
                {r.prerequisites.map((p) => (
                  <li key={p}>
                    {copyFor(reasonCopy, p, locale)}{" "}
                    <bdi className="text-xs text-muted-foreground">{p}</bdi>
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : (
          <Alert tone="positive">
            <AlertDescription>{say(locale, c.ready)}</AlertDescription>
          </Alert>
        )}
      </Section>

      <Section id="notes" title={say(locale, c.notes)}>
        <div className="grid gap-6 md:grid-cols-2">
          <NoteList title={say(locale, c.featureNotes)} notes={r.feature_notes} />
          <NoteList title={say(locale, c.upgradeNotes)} notes={r.upgrade_notes} />
        </div>
      </Section>

      <Section id="versions" title={say(locale, c.versions)}>
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
                <Link
                  key="t"
                  href={`/${locale}/instances/${v.instance_id}`}
                  className={linkClass}
                >
                  <bdi>{v.tenant_name}</bdi>
                </Link>,
                v.desired_release ? (
                  <ReferenceCode key="d">{v.desired_release}</ReferenceCode>
                ) : (
                  <bdi key="d">—</bdi>
                ),
                v.current_release ? (
                  <ReferenceCode key="c">{v.current_release}</ReferenceCode>
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
      </Section>

      <Section id="rollouts" title={say(locale, c.rollouts)}>
        {r.rollouts.length === 0 ? (
          <EmptyState locale={locale} />
        ) : (
          <DataTable
            id="release-rollouts-table"
            locale={locale}
            caption={say(locale, c.rollouts)}
            columns={[
              { label: say(locale, releaseCopy.rollouts.rings) },
              { label: say(locale, releaseCopy.rollouts.status) },
              { label: say(locale, c.created) },
            ]}
            rows={r.rollouts.map((o) => ({
              key: o.id,
              cells: [
                <Link
                  key="o"
                  href={`/${locale}/rollouts/${o.id}`}
                  className={linkClass}
                >
                  {o.target_rings.map(status).join(", ") || say(locale, c.instances)}
                </Link>,
                <StatusBadge key="s" locale={locale} status={o.status} />,
                <TimeValue key="t" locale={locale} value={o.created_at} />,
              ],
            }))}
          />
        )}
      </Section>
    </div>
  );
}
