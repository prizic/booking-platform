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
  Field,
  Input,
  Label,
  PageHeader,
  Section,
  StatusStamp,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Toolbar,
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
  const rows =
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
  return (
    <WorkspaceShell locale={locale} current={current} labelledBy="catalog-title">
      <div className="grid gap-8">
        <PageHeader
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
        />
        {state.kind !== "ready" ? (
          <Alert tone="danger">
            <AlertDescription className="text-foreground">
              {message(state.kind)}
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <form method="get">
              <Toolbar>
                <Field className="md:min-w-64">
                  <Label htmlFor="catalog-search">{message("search")}</Label>
                  <Input
                    id="catalog-search"
                    name="q"
                    type="search"
                    defaultValue={search}
                    maxLength={100}
                  />
                </Field>
                <Field className="md:min-w-48">
                  <Label htmlFor="catalog-status">{message("status")}</Label>
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
                </Field>
                <Button type="submit" variant="outline">
                  <Search aria-hidden="true" />
                  {message("filter")}
                </Button>
              </Toolbar>
            </form>
            {rows.length ? (
              <Table label={message(current)}>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      {message(locale === "ar" ? "nameAr" : "nameEn")}
                    </TableHead>
                    <TableHead>{message("status")}</TableHead>
                    {kind === "service" ? (
                      <>
                        <TableHead className="text-end">
                          {message("duration")}
                        </TableHead>
                        <TableHead className="text-end">{message("price")}</TableHead>
                      </>
                    ) : kind === "location" ? (
                      <TableHead>{message("timeZone")}</TableHead>
                    ) : (
                      <TableHead className="text-end">{message("sort")}</TableHead>
                    )}
                    <TableHead className="text-end">{message("revision")}</TableHead>
                    <TableHead className="text-end">
                      <span className="sr-only">{message("edit")}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const [stamp, label] = stateStamp(row.state);
                    const name = locale === "ar" ? row.name_ar : row.name_en;
                    return (
                      <TableRow key={row.id}>
                        <TableHead
                          scope="row"
                          className="h-auto py-3 text-sm font-semibold whitespace-normal text-foreground"
                        >
                          {/* A service carries the dye it wears on the bands. */}
                          {kind === "service" ? <ServiceDye name={name} /> : name}
                          <span className="block text-xs font-normal text-muted-foreground">
                            <bdi>{row.metadata.key}</bdi>
                          </span>
                        </TableHead>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusStamp state={stamp}>{message(label)}</StatusStamp>
                            {row.metadata.retire && row.state === "draft" ? (
                              <StatusStamp state="cancelled">
                                {message("pendingRetirement")}
                              </StatusStamp>
                            ) : null}
                          </div>
                        </TableCell>
                        {kind === "service" ? (
                          <>
                            <TableCell className="text-end">
                              {formatNumber(row.duration_minutes, locale)}
                            </TableCell>
                            <TableCell className="text-end">
                              <Money
                                minor={row.price_minor}
                                currency={row.currency}
                                locale={locale}
                              />
                            </TableCell>
                          </>
                        ) : kind === "location" ? (
                          <TableCell>
                            <bdi>{row.metadata.time_zone}</bdi>
                          </TableCell>
                        ) : (
                          <TableCell className="text-end">
                            {formatNumber(row.metadata.sort_order ?? 0, locale)}
                          </TableCell>
                        )}
                        <TableCell className="text-end">
                          {formatNumber(row.revision, locale)}
                        </TableCell>
                        <TableCell className="text-end">
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/${locale}/${current}/${row.id}`}>
                              {message("edit")}
                              <span className="sr-only"> {name}</span>
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <EmptyState title={message("empty")} description={message("emptyHint")} />
            )}
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
