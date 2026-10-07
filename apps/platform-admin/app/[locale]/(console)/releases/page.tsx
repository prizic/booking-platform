import { formatNumber } from "@wlbp/i18n";
import { Badge, FieldGroup, ReferenceCode } from "@wlbp/ui-foundation";
import Link from "next/link";
import { copyFor, formCopy, reasonCopy, say, statusCopy } from "../../../_lib/copy";
import { listHref, parseListParams } from "../../../_lib/list-params";
import { callOperator } from "../../../_lib/operator-api";
import { atLeast, getOperator } from "../../../_lib/operator-page";
import { pageLocale } from "../../../_lib/page-locale";
import { releaseCopy } from "../../../_lib/release-copy";
import { releaseChannels } from "../../../_lib/schemas/releases";
import { PageHeader } from "../../../_lib/shell/page-header";
import { ActionDialog } from "../../../_lib/ui/action-dialog";
import { DataTable } from "../../../_lib/ui/data-table";
import { FilterBar, SelectFilter } from "../../../_lib/ui/filter-bar";
import {
  CheckboxFormField,
  SelectFormField,
  TextFormField,
  TextareaFormField,
} from "../../../_lib/ui/form-fields";
import { Pagination } from "../../../_lib/ui/pagination";
import { EmptyState, UnavailableState } from "../../../_lib/ui/states";
import { StatusBadge } from "../../../_lib/ui/status-badge";
import { TimeValue } from "../../../_lib/ui/time";
import { ProgressRow } from "../rollouts/progress-row";

export const dynamic = "force-dynamic";

const c = releaseCopy.releases;
const channels = releaseChannels;
const spec = {
  filters: { channel: channels, status: ["available", "withdrawn"] },
  pageSize: 25,
} as const;

const linkClass = "font-semibold text-primary underline-offset-4 hover:underline";

function NotesField({
  id,
  name,
  label,
  hint,
  required = false,
  ltr = false,
}: {
  id: string;
  name: string;
  label: string;
  hint: string;
  required?: boolean;
  ltr?: boolean;
}) {
  return (
    <TextareaFormField
      id={id}
      name={name}
      label={label}
      description={hint}
      rows={3}
      required={required}
      {...(ltr ? { dir: "ltr" } : {})}
    />
  );
}

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
  const n = (value: number) => formatNumber(value, locale);

  return (
    <div className="grid gap-6">
      <PageHeader
        locale={locale}
        timesInUtc
        title={say(locale, c.title)}
        description={say(locale, c.description)}
        actions={
          atLeast(operator.role, "admin") ? (
            <ActionDialog
              locale={locale}
              operation="registerRelease"
              trigger={say(locale, c.register)}
              triggerVariant="primary"
              title={say(locale, c.registerTitle)}
              description={say(locale, c.registerBody)}
              submit={say(locale, c.register)}
              successMessage={say(locale, c.registered)}
              values={{
                version: "",
                channel: "candidate",
                gitCommit: "",
                configSchemaVersion: "",
                backendMin: "",
                backendMax: "",
                migrationIds: "",
                featureNotes: "",
                upgradeNotes: "",
                reversible: true,
              }}
            >
              <FieldGroup columns={2}>
                <TextFormField
                  id="r-version"
                  name="version"
                  label={say(locale, c.version)}
                  required
                  maxLength={40}
                  autoComplete="off"
                  dir="ltr"
                />
                <SelectFormField
                  name="channel"
                  label={say(locale, c.channel)}
                  options={channels.map((ch) => [ch, status(ch)] as const)}
                />
                <TextFormField
                  id="r-commit"
                  name="gitCommit"
                  label={say(locale, c.commit)}
                  required
                  minLength={40}
                  maxLength={64}
                  autoComplete="off"
                  dir="ltr"
                  className="md:col-span-2"
                />
                <TextFormField
                  id="r-schema"
                  name="configSchemaVersion"
                  label={say(locale, c.configSchema)}
                  type="number"
                  required
                  className="md:col-span-2"
                />
                <TextFormField
                  id="r-min"
                  name="backendMin"
                  label={say(locale, c.backendMin)}
                  type="number"
                  required
                />
                <TextFormField
                  id="r-max"
                  name="backendMax"
                  label={say(locale, c.backendMax)}
                  type="number"
                  required
                />
              </FieldGroup>
              <NotesField
                id="r-migrations"
                name="migrationIds"
                label={say(locale, c.migrations)}
                hint={say(locale, c.migrationsHint)}
                ltr
              />
              <NotesField
                id="r-feature-notes"
                name="featureNotes"
                label={say(locale, c.featureNotes)}
                hint={say(locale, c.notesHint)}
                required
              />
              <NotesField
                id="r-upgrade-notes"
                name="upgradeNotes"
                label={say(locale, c.upgradeNotes)}
                hint={say(locale, c.notesHint)}
                required
              />
              <CheckboxFormField
                id="r-reversible"
                name="reversible"
                label={say(locale, c.reversible)}
              />
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
            rows={result.data.map((row) => {
              const desired = Number(row.instances_desired);
              const running = Number(row.instances_current);
              return {
                key: row.release_id,
                cells: [
                  <div key="v" className="flex flex-wrap items-center gap-2">
                    <Link href={`${path}/${row.release_id}`} className={linkClass}>
                      <ReferenceCode className="text-primary">
                        {row.version}
                      </ReferenceCode>
                    </Link>
                    {!row.reversible ? (
                      <Badge tone="warning">{say(locale, c.notReversible)}</Badge>
                    ) : null}
                  </div>,
                  status(row.channel),
                  <StatusBadge key="s" locale={locale} status={row.status} />,
                  <bdi key="c" dir="ltr">
                    {`${row.backend_contract_min}–${row.backend_contract_max}`}
                  </bdi>,
                  row.prerequisites.length ? (
                    <ul key="p" className="grid list-disc gap-1 ps-4 text-sm">
                      {row.prerequisites.map((p) => (
                        <li key={p}>{copyFor(reasonCopy, p, locale)}</li>
                      ))}
                    </ul>
                  ) : (
                    <span key="p" className="text-muted-foreground">
                      {say(locale, c.ready)}
                    </span>
                  ),
                  n(desired),
                  <ProgressRow
                    key="r"
                    total={Math.max(desired, running)}
                    segments={[{ key: "running", value: running, tone: "positive" }]}
                  >
                    {n(running)}
                  </ProgressRow>,
                  <TimeValue key="t" locale={locale} value={row.created_at} />,
                ],
              };
            })}
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
    </div>
  );
}
