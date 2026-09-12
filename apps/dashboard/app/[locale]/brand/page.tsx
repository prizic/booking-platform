import { formatDateTime, type Locale } from "@wlbp/i18n";
import { Badge, Button, StatusMessage, Surface } from "@wlbp/ui-foundation";

import { getDashboardMessage } from "../../_lib/copy";
import type {
  BrandPresentationV1,
  BrandRevisionRowV1,
} from "../../_lib/dashboard-access";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { WorkspaceShell } from "../../_lib/workspace-shell";
import {
  publishBrandAction,
  rollbackBrandAction,
  saveBrandDraftAction,
} from "./actions";
import { brandResultKeys, positiveBrandResults } from "./results";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type BrandPageProps = {
  readonly params: Promise<{ locale: Locale }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BrandPage({ params, searchParams }: BrandPageProps) {
  const { locale } = await params;
  const query = await searchParams;
  const message = (key: Parameters<typeof getDashboardMessage>[1]) =>
    getDashboardMessage(locale, key);

  const request = await loadDashboardRequestAccess(locale);
  const ready = request.source !== null && request.state.kind === "ready";
  const tenantId = ready ? request.state.context.tenantId : null;

  const revisions: readonly BrandRevisionRowV1[] =
    ready && tenantId !== null
      ? ((await request.source?.listBrandRevisions?.({ tenantId }).catch(() => [])) ??
        [])
      : [];
  const presentation: BrandPresentationV1 | null =
    ready && tenantId !== null
      ? ((await request.source
          ?.getBrandPresentation?.({ tenantId })
          .catch(() => null)) ?? null)
      : null;

  const draft = revisions.find((revision) => revision.state === "draft") ?? null;
  const live = revisions.find((revision) => revision.state === "published") ?? null;
  const result = typeof query.result === "string" ? query.result : null;
  const resultKey =
    result !== null && result in brandResultKeys
      ? brandResultKeys[result as keyof typeof brandResultKeys]
      : null;

  return (
    <WorkspaceShell current="brand" labelledBy="brand-title" locale={locale}>
      <Surface as="section" className="requests-queue" labelledBy="brand-title">
        <h1 id="brand-title">{message("brandTitle")}</h1>
        <p>{message("brandSummary")}</p>
        {resultKey === null ? null : (
          <StatusMessage
            tone={positiveBrandResults.has(result ?? "") ? "positive" : "warning"}
          >
            {message(resultKey)}
          </StatusMessage>
        )}

        {presentation === null ? null : (
          <section aria-labelledby="brand-presentation-title">
            <h2 id="brand-presentation-title">{message("brandPresentationTitle")}</h2>
            {/* Decided from state, never from what anybody hopes. A tenant on a
                platform domain with a platform sender is branded, and the
                product says so rather than overclaiming. */}
            <p>
              <Badge
                tone={
                  presentation.presentation === "fully_white_label"
                    ? "positive"
                    : "neutral"
                }
              >
                {message(
                  presentation.presentation === "fully_white_label"
                    ? "brandFullyWhiteLabel"
                    : "brandBranded",
                )}
              </Badge>
            </p>
            <ul>
              <li>
                {message("brandHasDomain")}:{" "}
                {message(presentation.hasVerifiedDomain ? "brandYes" : "brandNo")}
              </li>
              <li>
                {message("brandHasSender")}:{" "}
                {message(presentation.hasTenantSender ? "brandYes" : "brandNo")}
              </li>
              <li>
                {message("brandHasPublished")}:{" "}
                {message(presentation.hasPublishedBrand ? "brandYes" : "brandNo")}
              </li>
              <li>
                {message("brandHasLegal")}:{" "}
                {message(presentation.hasLegalLinks ? "brandYes" : "brandNo")}
              </li>
            </ul>
          </section>
        )}

        <section aria-labelledby="brand-draft-title">
          <h2 id="brand-draft-title">{message("brandDraftTitle")}</h2>
          <p>{message("brandDraftHint")}</p>
          <form action={saveBrandDraftAction}>
            <input type="hidden" name="locale" value={locale} />
            <label htmlFor="brand-key">{message("brandKeyLabel")}</label>
            <input
              defaultValue={live?.brandKey ?? draft?.brandKey ?? ""}
              id="brand-key"
              name="brandKey"
              required
              type="text"
            />
            <label htmlFor="brand-config">{message("brandConfigLabel")}</label>
            <textarea dir="ltr" id="brand-config" name="config" required rows={10} />
            <label htmlFor="brand-content">{message("brandContentLabel")}</label>
            <textarea dir="ltr" id="brand-content" name="content" required rows={6} />
            <Button type="submit">{message("brandSaveAction")}</Button>
          </form>
        </section>

        {draft === null || draft.contentHash === null ? null : (
          <section aria-labelledby="brand-publish-title">
            <h2 id="brand-publish-title">{message("brandPublishTitle")}</h2>
            <p>{message("brandPublishHint")}</p>
            <form action={publishBrandAction}>
              <input type="hidden" name="locale" value={locale} />
              <input
                type="hidden"
                name="brandRevisionId"
                value={draft.brandRevisionId}
              />
              {/* The hash the author reviewed travels with the request, so a
                  draft somebody edited in between is refused rather than
                  shipped under this person's name. */}
              <input type="hidden" name="contentHash" value={draft.contentHash} />
              <Button type="submit">{message("brandPublishAction")}</Button>
            </form>
          </section>
        )}

        <section aria-labelledby="brand-history-title">
          <h2 id="brand-history-title">{message("brandHistoryTitle")}</h2>
          {revisions.length === 0 ? (
            <p>{message("brandHistoryEmpty")}</p>
          ) : (
            <ul aria-label={message("brandHistoryTitle")}>
              {revisions.map((revision) => (
                <li key={revision.brandRevisionId}>
                  <bdi>{revision.brandKey}</bdi> v{revision.revision} · {revision.state}
                  {revision.publishedAt === null
                    ? null
                    : ` · ${formatDateTime(revision.publishedAt, locale, "UTC")}`}
                  {revision.notes === null ? null : ` · ${revision.notes}`}
                  {revision.state === "retired" ? (
                    <form action={rollbackBrandAction}>
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="brandId" value={revision.brandId} />
                      <input
                        type="hidden"
                        name="toRevision"
                        value={revision.revision}
                      />
                      <Button type="submit" variant="secondary">
                        {message("brandRollbackAction")}
                      </Button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </Surface>
    </WorkspaceShell>
  );
}
