import { paginateRows } from "../../_lib/data-page-query";
import { WorkspacePagination } from "../../_lib/ui/workspace-pagination";
import { ReadRetry } from "../../_lib/ui/read-retry";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus, Search } from "lucide-react";
import type { CatalogEntityV1, CatalogKindV1 } from "@wlbp/api-contracts";
import { formatNumber, type Locale } from "@wlbp/i18n";
import { Money } from "../../_lib/ui/money";
import { ServiceDye } from "../../_lib/ui/service-dye";
import {
  Alert,
  AlertDescription,
  Button,
  EmptyState,
  Input,
  DataPage,
  DataTable,
  FilterBar,
  FilterField,
  ErrorState,
  PageHeader,
  Section,
  StatusStamp,
  type StampState,
} from "@wlbp/ui-foundation";
import { WorkspaceShell } from "../../_lib/workspace-shell";
import { loadCatalogWorkspace } from "./catalog-data-source";
import { CatalogForm, CatalogPublicationForm } from "./catalog-forms";
import { catalogMessage, type CatalogMessageKey } from "./catalog-copy";
import { ChoiceSelect } from "./form-kit";

const section = (kind: CatalogKindV1) =>
  kind === "service" ? "services" : kind === "category" ? "categories" : "locations";

/** Stamp and word for a catalog record state; meaning never rests on colour alone. */
function stateStamp(
  state: CatalogEntityV1["state"],
): readonly [StampState, CatalogMessageKey] {
  if (state === "published") return ["confirmed", "publishedState"];
  if (state === "draft") return ["pending", "draft"];
  return ["neutral", "retired"];
}

/** Filter value meaning "every state"; Radix selects cannot submit "". */
const ALL_STATES = "all";

export async function CatalogListPage({
  locale,
  kind,
  query,
}: {
  locale: Locale;
  kind: CatalogKindV1;
  query: Record<string, string | string[] | undefined>;
}) {
  const current = section(kind);
  const message = (key: CatalogMessageKey) => catalogMessage(locale, key);
  const state = await loadCatalogWorkspace(locale);
  const search = typeof query.q === "string" ? query.q.slice(0, 100) : "";
  const status =
    typeof query.status === "string" &&
    ["draft", "published", "retired"].includes(query.status)
      ? query.status
      : "";
  const allRows =
    state.kind === "ready"
      ? state.workspace.entities.filter(
          (row) =>
            row.kind === kind &&
            (!status || row.state === status) &&
            (!search ||
              `${row.name_en} ${row.name_ar} ${row.metadata.key}`
                .toLocaleLowerCase()
                .includes(search.toLocaleLowerCase())),
        )
      : [];
  const page = paginateRows(allRows, query);
  const columns = [
    { key: "name", label: message(locale === "ar" ? "nameAr" : "nameEn") },
    { key: "status", label: message("status") },
    ...(kind === "service"
      ? [
          { key: "duration", label: message("duration") },
          { key: "price", label: message("price") },
        ]
      : [{ key: "other", label: message(kind === "location" ? "timeZone" : "sort") }]),
    { key: "revision", label: message("revision") },
    { key: "actions", label: message("edit"), kind: "actions" as const },
  ];
  return (
    <WorkspaceShell locale={locale} current={current} labelledBy="catalog-title">
      <DataPage
        titleId="catalog-title"
        title={message(current)}
        description={message("intro")}
        actions={
          state.kind === "ready" && state.workspace.canPublish ? (
            <Button asChild>
              <Link href={`/${locale}/${current}/new`}>
                <Plus aria-hidden="true" />
                {message("new")}
              </Link>
            </Button>
          ) : null
        }
        toolbar={
          <FilterBar label={locale === "ar" ? "التصفية" : "Filters"}>
            <FilterField label={message("search")} htmlFor="catalog-search">
              <Input
                id="catalog-search"
                name="q"
                type="search"
                defaultValue={search}
                maxLength={100}
              />
            </FilterField>
            <FilterField label={message("status")} htmlFor="catalog-status">
              <ChoiceSelect
                id="catalog-status"
                name="status"
                defaultValue={status || ALL_STATES}
                options={[
                  { value: ALL_STATES, label: message("all") },
                  ...(["draft", "published", "retired"] as const).map((value) => ({
                    value,
                    label: message(stateStamp(value)[1]),
                  })),
                ]}
              />
            </FilterField>
            <Button type="submit" variant="outline">
              <Search aria-hidden="true" />
              {message("filter")}
            </Button>
            {search || status ? (
              <Button asChild variant="ghost">
                <Link href={`/${locale}/${current}`}>
                  {locale === "ar" ? "مسح التصفية" : "Clear filters"}
                </Link>
              </Button>
            ) : null}
          </FilterBar>
        }
        pagination={
          state.kind === "ready" ? (
            <WorkspacePagination
              locale={locale}
              path={`/${locale}/${current}`}
              query={query}
              {...page}
            />
          ) : null
        }
      >
        {state.kind !== "ready" ? (
          <ErrorState
            title={message(state.kind)}
            retry={<ReadRetry locale={locale} />}
          />
        ) : (
          <>
            {allRows.length ? (
              <DataTable
                id="catalog-records"
                caption={message(current)}
                columns={columns}
                rows={page.rows.map((row) => {
                  const [stamp, label] = stateStamp(row.state);
                  const name = locale === "ar" ? row.name_ar : row.name_en;
                  return {
                    key: row.id,
                    cells: [
                      <div key="name" className="grid gap-1">
                        {kind === "service" ? <ServiceDye name={name} /> : name}
                        <bdi className="text-xs text-muted-foreground">
                          {row.metadata.key}
                        </bdi>
                      </div>,
                      <div key="state" className="flex flex-wrap gap-2">
                        <StatusStamp state={stamp}>{message(label)}</StatusStamp>
                        {row.metadata.retire && row.state === "draft" ? (
                          <StatusStamp state="cancelled">
                            {message("pendingRetirement")}
                          </StatusStamp>
                        ) : null}
                      </div>,
                      ...(kind === "service"
                        ? [
                            formatNumber(row.duration_minutes, locale),
                            <Money
                              key="price"
                              minor={row.price_minor}
                              currency={row.currency}
                              locale={locale}
                            />,
                          ]
                        : [
                            kind === "location" ? (
                              <bdi key="zone">{row.metadata.time_zone}</bdi>
                            ) : (
                              formatNumber(row.metadata.sort_order ?? 0, locale)
                            ),
                          ]),
                      formatNumber(row.revision, locale),
                      <Button key="edit" asChild variant="outline" size="sm">
                        <Link href={`/${locale}/${current}/${row.id}`}>
                          {message("edit")}
                          <span className="sr-only"> {name}</span>
                        </Link>
                      </Button>,
                    ],
                  };
                })}
              />
            ) : (
              <EmptyState
                title={
                  search || status
                    ? locale === "ar"
                      ? "لا توجد نتائج تطابق التصفية."
                      : `No matching ${current}.`
                    : message("empty")
                }
                description={message("emptyHint")}
                action={
                  search || status ? (
                    <Button asChild variant="outline">
                      <Link href={`/${locale}/${current}`}>
                        {locale === "ar" ? "مسح التصفية" : "Clear filters"}
                      </Link>
                    </Button>
                  ) : undefined
                }
              />
            )}
            <CatalogPublicationForm
              locale={locale}
              workspace={state.workspace}
              requestId={crypto.randomUUID()}
            />
          </>
        )}
      </DataPage>
    </WorkspaceShell>
  );
}
export async function CatalogEditorPage({
  locale,
  kind,
  id,
  result,
}: {
  locale: Locale;
  kind: CatalogKindV1;
  id: string;
  result?: string | undefined;
}) {
  if (
    id !== "new" &&
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(id)
  )
    notFound();
  const current = section(kind);
  const state = await loadCatalogWorkspace(locale);
  const message = (key: CatalogMessageKey) => catalogMessage(locale, key);
  const entity =
    state.kind === "ready"
      ? state.workspace.entities.find((row) => row.kind === kind && row.id === id)
      : undefined;
  if (state.kind === "ready" && id !== "new" && !entity) notFound();
  const stamp = entity ? stateStamp(entity.state) : null;
  return (
    <WorkspaceShell locale={locale} current={current} labelledBy="catalog-editor-title">
      <div className="grid gap-8">
        <div className="grid gap-3">
          <Link
            className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline"
            href={`/${locale}/${current}`}
          >
            <ArrowLeft aria-hidden="true" className="size-4 rtl:-scale-x-100" />
            {message("back")}
          </Link>
          <PageHeader
            titleId="catalog-editor-title"
            title={
              entity
                ? locale === "ar"
                  ? entity.name_ar
                  : entity.name_en
                : message("new")
            }
            meta={
              entity && stamp ? (
                <>
                  <StatusStamp state={stamp[0]}>{message(stamp[1])}</StatusStamp>
                  <span className="text-sm text-muted-foreground">
                    {message("revision")} {formatNumber(entity.revision, locale)}
                  </span>
                </>
              ) : null
            }
          />
        </div>
        {state.kind !== "ready" ? (
          <Alert tone="danger">
            <AlertDescription className="text-foreground">
              {message(state.kind)}
            </AlertDescription>
          </Alert>
        ) : id === "new" && !state.workspace.canPublish ? (
          <Alert tone="danger">
            <AlertDescription className="text-foreground">
              {message("denied")}
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {result === "saved" && entity ? (
              <Alert tone="positive">
                <AlertDescription className="text-foreground">
                  {message("saved")}
                </AlertDescription>
              </Alert>
            ) : null}
            <CatalogForm
              locale={locale}
              kind={kind}
              {...(entity ? { entity } : {})}
              workspace={state.workspace}
              requestId={crypto.randomUUID()}
            />
            {entity ? (
              <Section
                id="catalog-preview"
                title={message("preview")}
                description={message("previewHint")}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <article
                    lang="en"
                    dir="ltr"
                    className="grid content-start gap-2 rounded-lg border bg-card p-5"
                  >
                    <h3 className="text-base font-semibold">{entity.name_en}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {entity.description_en}
                    </p>
                    {kind === "location" ? (
                      <p className="text-sm">{entity.address_en}</p>
                    ) : null}
                  </article>
                  <article
                    lang="ar"
                    dir="rtl"
                    className="grid content-start gap-2 rounded-lg border bg-card p-5 font-arabic"
                  >
                    <h3 className="text-base font-semibold">{entity.name_ar}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {entity.description_ar}
                    </p>
                    {kind === "location" ? (
                      <p className="text-sm">{entity.address_ar}</p>
                    ) : null}
                  </article>
                </div>
                {kind === "service" ? (
                  <p className="text-sm font-medium [font-variant-numeric:tabular-nums]">
                    <Money
                      minor={entity.price_minor}
                      currency={entity.currency}
                      locale={locale}
                    />{" "}
                    · {formatNumber(entity.duration_minutes, locale)}{" "}
                    {message("duration")}
                  </p>
                ) : null}
              </Section>
            ) : null}
            <CatalogPublicationForm
              locale={locale}
              workspace={state.workspace}
              requestId={crypto.randomUUID()}
            />
          </>
        )}
      </div>
    </WorkspaceShell>
  );
}
