import { BrandPublicationForm } from "./brand-publication-form";
import { BrandForm } from "./brand-form";
import { parseBrandEditor, brandChangedSections } from "./brand-fields";
import { dashboardBrand } from "../../_lib/brand";
import { workspaceStatus } from "../../_lib/workspace-status";
import { formatDateTime, type Locale } from "@wlbp/i18n";
import { Badge, Button, StatusMessage, Surface } from "@wlbp/ui-foundation";

import { getDashboardMessage } from "../../_lib/copy";
import type {
  BrandPresentationV1,
  BrandRevisionRowV1,
} from "../../_lib/dashboard-access";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { WorkspaceShell } from "../../_lib/workspace-shell";
import { publishBrandAction, rollbackBrandAction, previewBrandAction } from "./actions";
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

  const revisions: readonly BrandRevisionRowV1[] | null =
    ready && tenantId !== null
      ? ((await request.source?.listBrandRevisions?.({ tenantId }).catch(() => null)) ??
        null)
      : [];
  const presentation: BrandPresentationV1 | null =
    ready && tenantId !== null
      ? ((await request.source
          ?.getBrandPresentation?.({ tenantId })
          .catch(() => null)) ?? null)
      : null;

  const editor =
    ready && tenantId !== null
      ? await request.source
          ?.getBrandEditor?.(tenantId)
          .then(parseBrandEditor)
          .catch(() => undefined)
      : undefined;
  const draft = revisions?.find((revision) => revision.state === "draft") ?? null;
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
          {editor === undefined ? (
            <p role="alert">{message("requestsResultUnavailable")}</p>
          ) : (
            <BrandForm
              locale={locale}
              brandKey={editor?.brandKey ?? "default"}
              contentHash={editor?.contentHash ?? null}
              config={editor?.config ?? dashboardBrand}
              content={editor?.content ?? {}}
            />
          )}
        </section>

        {draft === null || draft.contentHash === null ? null : (
          <section aria-labelledby="brand-publish-title">
            <h2 id="brand-publish-title">{message("brandPublishTitle")}</h2>
            <p>{message("brandPublishHint")}</p>
            <form action={previewBrandAction}>
              <input name="locale" type="hidden" value={locale} />
              <input
                name="brandRevisionId"
                type="hidden"
                value={draft.brandRevisionId}
              />
              <Button type="submit" variant="secondary">
                {message("brandPreviewAction")}
              </Button>
            </form>
            {editor ? (
              <p>
                {locale === "ar" ? "الأقسام المتغيرة: " : "Changed sections: "}
                {brandChangedSections(editor)
                  .map(
                    (key) =>
                      ({
                        identity: locale === "ar" ? "الهوية" : "Identity",
                        colors: locale === "ar" ? "الألوان" : "Colors",
                        typography: locale === "ar" ? "الخطوط" : "Typography",
                        assets: locale === "ar" ? "الصور" : "Assets",
                        content: locale === "ar" ? "المحتوى" : "Content",
                      })[key as "identity"],
                  )
                  .join(" · ") || (locale === "ar" ? "لا تغيير" : "No changes")}
              </p>
            ) : null}
            <BrandPublicationForm
              locale={locale}
              action={publishBrandAction}
              label={message("brandPublishAction")}
              fields={{
                brandRevisionId: draft.brandRevisionId,
                contentHash: draft.contentHash,
              }}
            />
          </section>
        )}

        <section aria-labelledby="brand-history-title">
          <h2 id="brand-history-title">{message("brandHistoryTitle")}</h2>
          {revisions === null ? (
            <p role="alert">{message("requestsResultUnavailable")}</p>
          ) : revisions.length === 0 ? (
            <p>{message("brandHistoryEmpty")}</p>
          ) : (
            <ul aria-label={message("brandHistoryTitle")}>
              {revisions.map((revision) => (
                <li key={revision.brandRevisionId}>
                  <bdi>{revision.brandKey}</bdi> v{revision.revision} ·{" "}
                  {workspaceStatus(locale, revision.state)}
                  {revision.publishedAt === null
                    ? null
                    : ` · ${formatDateTime(revision.publishedAt, locale, "UTC")}`}
                  {revision.notes === null ? null : ` · ${revision.notes}`}
                  {revision.state === "retired" ? (
                    <BrandPublicationForm
                      locale={locale}
                      action={rollbackBrandAction}
                      label={message("brandRollbackAction")}
                      fields={{
                        brandId: revision.brandId,
                        toRevision: String(revision.revision),
                      }}
                    />
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
