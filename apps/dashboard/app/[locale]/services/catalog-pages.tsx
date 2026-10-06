import Link from "next/link";
import { notFound } from "next/navigation";
import type { CatalogKindV1 } from "@wlbp/api-contracts";
import { formatCurrency, formatNumber, type Locale } from "@wlbp/i18n";
import { WorkspaceShell } from "../../_lib/workspace-shell";
import { loadCatalogWorkspace } from "./catalog-data-source";
import { CatalogForm, CatalogPublicationForm } from "./catalog-forms";
import { catalogMessage } from "./catalog-copy";

const section = (kind: CatalogKindV1) =>
  kind === "service" ? "services" : kind === "category" ? "categories" : "locations";
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
  const message = (key: Parameters<typeof catalogMessage>[1]) =>
    catalogMessage(locale, key);
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
      <div>
        <header className="dashboard-intro">
          <h1 id="catalog-title">{message(current)}</h1>
          <p>{message("intro")}</p>
          {state.kind === "ready" && state.workspace.canPublish ? (
            <Link className="wlbp-button" href={`/${locale}/${current}/new`}>
              {message("new")}
            </Link>
          ) : null}
        </header>
        {state.kind !== "ready" ? (
          <p role="alert">{message(state.kind)}</p>
        ) : (
          <>
            <form className="workspace-filter-bar" method="get">
              <label>
                {message("search")}
                <input
                  className="wlbp-field__input"
                  name="q"
                  type="search"
                  defaultValue={search}
                  maxLength={100}
                />
              </label>
              <label>
                {message("status")}
                <select
                  className="wlbp-field__input"
                  name="status"
                  defaultValue={status}
                >
                  <option value="">{message("all")}</option>
                  {(["draft", "published", "retired"] as const).map((value) => (
                    <option key={value} value={value}>
                      {message(value)}
                    </option>
                  ))}
                </select>
              </label>
              <button className="wlbp-button wlbp-button--quiet">
                {message("filter")}
              </button>
            </form>
            {rows.length ? (
              <div
                className="workspace-table-scroll"
                role="region"
                aria-label={message(current)}
                tabIndex={0}
              >
                <table className="workspace-table">
                  <thead>
                    <tr>
                      <th scope="col">
                        {message(locale === "ar" ? "nameAr" : "nameEn")}
                      </th>
                      <th scope="col">{message("status")}</th>
                      {kind === "service" ? (
                        <>
                          <th scope="col">{message("duration")}</th>
                          <th scope="col">{message("price")}</th>
                        </>
                      ) : kind === "location" ? (
                        <th scope="col">{message("timeZone")}</th>
                      ) : (
                        <th scope="col">{message("sort")}</th>
                      )}
                      <th scope="col">{message("revision")}</th>
                      <th scope="col">{message("edit")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <th scope="row">
                          {locale === "ar" ? row.name_ar : row.name_en}
                          <small className="workspace-secondary">
                            <bdi>{row.metadata.key}</bdi>
                          </small>
                        </th>
                        <td>
                          {message(row.state)}
                          {row.metadata.retire && row.state === "draft" ? (
                            <small className="workspace-secondary">
                              {message("pendingRetirement")}
                            </small>
                          ) : null}
                        </td>
                        {kind === "service" ? (
                          <>
                            <td>{formatNumber(row.duration_minutes, locale)}</td>
                            <td>
                              {formatCurrency(row.price_minor, row.currency, locale)}
                            </td>
                          </>
                        ) : kind === "location" ? (
                          <td>
                            <bdi>{row.metadata.time_zone}</bdi>
                          </td>
                        ) : (
                          <td>{formatNumber(row.metadata.sort_order ?? 0, locale)}</td>
                        )}
                        <td>{formatNumber(row.revision, locale)}</td>
                        <td>
                          <Link href={`/${locale}/${current}/${row.id}`}>
                            {message("edit")}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>{message("empty")}</p>
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
  const message = (key: Parameters<typeof catalogMessage>[1]) =>
    catalogMessage(locale, key);
  const entity =
    state.kind === "ready"
      ? state.workspace.entities.find((row) => row.kind === kind && row.id === id)
      : undefined;
  if (state.kind === "ready" && id !== "new" && !entity) notFound();
  return (
    <WorkspaceShell locale={locale} current={current} labelledBy="catalog-editor-title">
      <div>
        <header className="dashboard-intro">
          <Link href={`/${locale}/${current}`}>{message("back")}</Link>
          <h1 id="catalog-editor-title">
            {entity
              ? locale === "ar"
                ? entity.name_ar
                : entity.name_en
              : message("new")}
          </h1>
          {entity ? (
            <p>
              {message(entity.state)} · {message("revision")}{" "}
              {formatNumber(entity.revision, locale)}
            </p>
          ) : null}
        </header>
        {state.kind !== "ready" ? (
          <p role="alert">{message(state.kind)}</p>
        ) : id === "new" && !state.workspace.canPublish ? (
          <p role="alert">{message("denied")}</p>
        ) : (
          <>
            {result === "saved" && entity ? (
              <p role="status">{message("saved")}</p>
            ) : null}
            <CatalogForm
              locale={locale}
              kind={kind}
              {...(entity ? { entity } : {})}
              workspace={state.workspace}
              requestId={crypto.randomUUID()}
            />
            {entity ? (
              <section
                className="workspace-section"
                aria-labelledby="catalog-preview-title"
              >
                <h2 id="catalog-preview-title">{message("preview")}</h2>
                <p>{message("previewHint")}</p>
                <div className="catalog-field-columns">
                  <article lang="en" dir="ltr">
                    <h3>{entity.name_en}</h3>
                    <p>{entity.description_en}</p>
                    {kind === "location" ? <p>{entity.address_en}</p> : null}
                  </article>
                  <article lang="ar" dir="rtl">
                    <h3>{entity.name_ar}</h3>
                    <p>{entity.description_ar}</p>
                    {kind === "location" ? <p>{entity.address_ar}</p> : null}
                  </article>
                </div>
                {kind === "service" ? (
                  <p>
                    {formatCurrency(entity.price_minor, entity.currency, locale)} ·{" "}
                    {formatNumber(entity.duration_minutes, locale)}{" "}
                    {message("duration")}
                  </p>
                ) : null}
              </section>
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
