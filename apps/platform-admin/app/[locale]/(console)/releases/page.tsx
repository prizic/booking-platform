import { formatNumber } from "@wlbp/i18n";
import { Badge, TextField } from "@wlbp/ui-foundation";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { registerReleaseAction } from "../../../_lib/actions/releases";
import { copyFor, formCopy, reasonCopy, say, statusCopy } from "../../../_lib/copy";
import { listHref, parseListParams } from "../../../_lib/list-params";
import { callOperator } from "../../../_lib/operator-api";
import { atLeast, getOperator } from "../../../_lib/operator-page";
import { pageLocale } from "../../../_lib/page-locale";
import { releaseCopy } from "../../../_lib/release-copy";
import { PageHeader } from "../../../_lib/shell/page-header";
import { ActionDialog } from "../../../_lib/ui/action-dialog";
import { DataTable } from "../../../_lib/ui/data-table";
import { FilterBar, SelectFilter } from "../../../_lib/ui/filter-bar";
import { Pagination } from "../../../_lib/ui/pagination";
import { SelectField } from "../../../_lib/ui/select-field";
import { EmptyState, UnavailableState } from "../../../_lib/ui/states";
import { StatusBadge } from "../../../_lib/ui/status-badge";
import { TimeValue } from "../../../_lib/ui/time";

export const dynamic = "force-dynamic";

const c = releaseCopy.releases;
const channels = ["internal", "candidate", "stable"] as const;
const spec = {
  filters: { channel: channels, status: ["available", "withdrawn"] },
  pageSize: 25,
} as const;

export default async function ReleasesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await pageLocale(params);
  const operator = await getOperator(locale);
  if (!operator) return null;
  const list = parseListParams(await searchParams, spec);
  const path = `/${locale}/releases`;
  const result = await callOperator("list_releases_v1", {
    p_channel: list.filters.channel,
    p_status: list.filters.status,
    p_limit: list.pageSize,
    p_offset: list.offset,
  });
  const status = (s: string) => copyFor(statusCopy, s, locale);

  return (
    <>
      <PageHeader
        locale={locale}
        title={say(locale, c.title)}
        description={say(locale, c.description)}
        actions={
          atLeast(operator.role, "admin") ? (
            <ActionDialog
              locale={locale}
              action={registerReleaseAction}
              trigger={say(locale, c.register)}
              triggerVariant="primary"
              title={say(locale, c.registerTitle)}
              description={say(locale, c.registerBody)}
              submit={say(locale, c.register)}
              successMessage={say(locale, c.registered)}
              hidden={{ idempotencyKey: randomUUID() }}
            >
              <div className="form-grid">
                <TextField
                  id="r-version"
                  name="version"
                  label={say(locale, c.version)}
                  required
                  maxLength={40}
                  autoComplete="off"
                />
                <SelectField
                  name="channel"
                  label={say(locale, c.channel)}
                  value="candidate"
                  options={channels.map((ch) => [ch, status(ch)] as const)}
                />
                <div className="full">
                  <TextField
                    id="r-commit"
                    name="gitCommit"
                    label={say(locale, c.commit)}
                    required
                    minLength={40}
                    maxLength={64}
                    autoComplete="off"
                  />
                </div>
                <TextField
                  id="r-schema"
                  name="configSchemaVersion"
                  label={say(locale, c.configSchema)}
                  type="number"
                  required
                />
                <span />
                <TextField
                  id="r-min"
                  name="backendMin"
                  label={say(locale, c.backendMin)}
                  type="number"
                  required
                />
                <TextField
                  id="r-max"
                  name="backendMax"
                  label={say(locale, c.backendMax)}
                  type="number"
                  required
                />
              </div>
              <label className="field">
                <span>{say(locale, c.migrations)}</span>
                <textarea name="migrationIds" dir="ltr" rows={3} />
                <small>{say(locale, c.migrationsHint)}</small>
              </label>
              <label className="field">
                <span>{say(locale, c.featureNotes)}</span>
                <textarea name="featureNotes" required rows={3} />
                <small>{say(locale, c.notesHint)}</small>
              </label>
              <label className="field">
                <span>{say(locale, c.upgradeNotes)}</span>
                <textarea name="upgradeNotes" required rows={3} />
                <small>{say(locale, c.notesHint)}</small>
              </label>
              <label className="checkbox">
                <input type="checkbox" name="reversible" defaultChecked />{" "}
                {say(locale, c.reversible)}
              </label>
            </ActionDialog>
          ) : null
        }
      />
      <FilterBar locale={locale} path={path}>
        <SelectFilter
          name="channel"
          label={say(locale, c.channel)}
          value={list.filters.channel}
          allLabel={say(locale, formCopy.all)}
          options={channels.map((ch) => [ch, status(ch)] as const)}
        />
        <SelectFilter
          name="status"
          label={say(locale, c.status)}
          value={list.filters.status}
          allLabel={say(locale, formCopy.all)}
          options={spec.filters.status.map((s) => [s, status(s)] as const)}
        />
      </FilterBar>
      {!result.ok ? (
        <UnavailableState locale={locale} code={result.code} />
      ) : result.data.length === 0 ? (
        <EmptyState
          locale={locale}
          title={say(locale, c.empty)}
          filtered={Object.keys(list.filters).length > 0}
        />
      ) : (
        <>
          <DataTable
            id="releases-table"
            locale={locale}
            caption={say(locale, c.title)}
            columns={[
              { label: say(locale, c.version) },
              { label: say(locale, c.channel) },
              { label: say(locale, c.status) },
              { label: say(locale, c.contract) },
              { label: say(locale, c.prerequisites) },
              { label: say(locale, c.desired), numeric: true },
              { label: say(locale, c.running), numeric: true },
              { label: say(locale, c.created) },
            ]}
            rows={result.data.map((row) => ({
              key: row.release_id,
              cells: [
                <>
                  <Link href={`${path}/${row.release_id}`}>
                    <bdi>{row.version}</bdi>
                  </Link>
                  {!row.reversible ? (
                    <>
                      {" "}
                      <Badge tone="warning">{say(locale, c.notReversible)}</Badge>
                    </>
                  ) : null}
                </>,
                status(row.channel),
                <StatusBadge key="s" locale={locale} status={row.status} />,
                `${row.backend_contract_min}–${row.backend_contract_max}`,
                row.prerequisites.length ? (
                  <ul key="p">
                    {row.prerequisites.map((p) => (
                      <li key={p}>{copyFor(reasonCopy, p, locale)}</li>
                    ))}
                  </ul>
                ) : (
                  say(locale, c.ready)
                ),
                formatNumber(Number(row.instances_desired), locale),
                formatNumber(Number(row.instances_current), locale),
                <TimeValue key="t" locale={locale} value={row.created_at} />,
              ],
            }))}
          />
          <Pagination
            locale={locale}
            page={list.page}
            pageSize={list.pageSize}
            total={Number(result.data[0]?.total_count ?? 0)}
            href={(page) => listHref(path, list, { page })}
          />
        </>
      )}
    </>
  );
}
