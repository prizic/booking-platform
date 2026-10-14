import { paginateRows } from "../../_lib/data-page-query";
import { WorkspacePagination } from "../../_lib/ui/workspace-pagination";
import { ReadRetry } from "../../_lib/ui/read-retry";
import Link from "next/link";
import { BrandPreviewButton, BrandPublicationForm } from "./brand-publication-form";
import { BrandForm } from "./brand-form";
import { parseBrandEditor, brandChangedSections } from "./brand-document";
import { dashboardBrand } from "../../_lib/brand";
import { workspaceStatus } from "../../_lib/workspace-status";
import { formatNumber, type Locale } from "@wlbp/i18n";
import { formatWhen } from "../../_lib/booking-display";
import {
  Alert,
  AlertDescription,
  EmptyState,
  Facts,
  DataPage,
  DataTable,
  Button,
  Toolbar,
  ReferenceCode,
  Section,
  StatusStamp,
  type StampState,
  ErrorState,
} from "@wlbp/ui-foundation";

import { getDashboardMessage } from "../../_lib/copy";

import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { WorkspaceShell } from "../../_lib/workspace-shell";
import { brandResultKeys, positiveBrandResults } from "./results";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type BrandPageProps = {
  readonly params: Promise<{ locale: Locale }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function revisionStamp(state: string): StampState {
  if (state === "draft") return "pending";
  if (state === "published" || state === "active") return "confirmed";
  if (state === "retired") return "completed";
  return "neutral";
}

export default async function BrandPage({ params, searchParams }: BrandPageProps) {
  const { locale } = await params;
  const query = await searchParams;
  const message = (key: Parameters<typeof getDashboardMessage>[1]) =>
    getDashboardMessage(locale, key);
  const m = (en: string, ar: string) => (locale === "ar" ? ar : en);

  const request = await loadDashboardRequestAccess(locale);
  const ready = request.source !== null && request.state.kind === "ready";
  const tenantId = ready ? request.state.context.tenantId : null;

  const [revisions, presentation, editor] = await Promise.all([
    ready && tenantId !== null
      ? (request.source?.listBrandRevisions?.({ tenantId }).catch(() => null) ?? null)
      : null,
    ready && tenantId !== null
      ? (request.source?.getBrandPresentation?.({ tenantId }).catch(() => null) ?? null)
      : null,
    ready && tenantId !== null
      ? request.source
          ?.getBrandEditor?.(tenantId)
          .then(parseBrandEditor)
          .catch(() => undefined)
      : undefined,
  ]);
  const historyPaging = paginateRows(revisions ?? [], query);
  const draft = revisions?.find((revision) => revision.state === "draft") ?? null;
  const result = typeof query.result === "string" ? query.result : null;
  const resultKey =
    result !== null && result in brandResultKeys
      ? brandResultKeys[result as keyof typeof brandResultKeys]
      : null;
  const yesNo = (value: boolean) => (
    <StatusStamp state={value ? "confirmed" : "neutral"}>
      {message(value ? "brandYes" : "brandNo")}
    </StatusStamp>
  );

  return (
    <WorkspaceShell current="brand" labelledBy="brand-title" locale={locale}>
      <div className="grid gap-10">
        <DataPage
          pagination={
            revisions !== null ? (
              <WorkspacePagination
                locale={locale}
                path={`/${locale}/brand`}
                query={query}
                {...historyPaging}
              />
            ) : null
          }
          titleId="brand-title"
          title={message("brandTitle")}
          description={message("brandSummary")}
          toolbar={
            <Toolbar
              role="toolbar"
              aria-label={locale === "ar" ? "التصفية" : "Filters"}
            >
              <Button asChild variant="outline" size="sm">
                <Link href={"#brand-draft"}>
                  {locale === "ar" ? "تعديل المسودة" : "Edit draft"}
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={"#brand-history"}>
                  {locale === "ar" ? "سجل النشر" : "Publication history"}
                </Link>
              </Button>
            </Toolbar>
          }
        >
          {resultKey === null ? null : (
            <Alert
              tone={positiveBrandResults.has(result ?? "") ? "positive" : "warning"}
            >
              <AlertDescription className="text-foreground">
                {message(resultKey)}
              </AlertDescription>
            </Alert>
          )}

          {presentation === null ? null : (
            <Section
              id="brand-presentation"
              title={message("brandPresentationTitle")}
              actions={
                /* Decided from state, never from what anybody hopes. A tenant on a
                 platform domain with a platform sender is branded, and the
                 product says so rather than overclaiming. */
                <StatusStamp
                  state={
                    presentation.presentation === "fully_white_label"
                      ? "confirmed"
                      : "neutral"
                  }
                >
                  {message(
                    presentation.presentation === "fully_white_label"
                      ? "brandFullyWhiteLabel"
                      : "brandBranded",
                  )}
                </StatusStamp>
              }
            >
              <Facts
                columns={2}
                items={[
                  {
                    key: "domain",
                    label: message("brandHasDomain"),
                    value: yesNo(presentation.hasVerifiedDomain),
                  },
                  {
                    key: "sender",
                    label: message("brandHasSender"),
                    value: yesNo(presentation.hasTenantSender),
                  },
                  {
                    key: "published",
                    label: message("brandHasPublished"),
                    value: yesNo(presentation.hasPublishedBrand),
                  },
                  {
                    key: "legal",
                    label: message("brandHasLegal"),
                    value: yesNo(presentation.hasLegalLinks),
                  },
                ]}
              />
            </Section>
          )}

          <Section
            id="brand-draft"
            title={message("brandDraftTitle")}
            description={
              <>
                {m(
                  "Your logo, colours and customer-facing text all come from here: what you save becomes a draft, and customers see it only after you publish.",
                  "من هنا يأتي شعارك وألوانك ونصوص العملاء: ما تحفظه يصبح مسودة، ولا يراه العملاء إلا بعد النشر.",
                )}{" "}
                {message("brandDraftHint")}
              </>
            }
          >
            {editor === undefined ? (
              <ErrorState
                title={<>{message("requestsResultUnavailable")}</>}
                retry={<ReadRetry locale={locale} />}
              />
            ) : (
              <BrandForm
                locale={locale}
                brandKey={editor?.brandKey ?? "default"}
                contentHash={editor?.contentHash ?? null}
                config={editor?.config ?? dashboardBrand}
                content={editor?.content ?? {}}
              />
            )}
          </Section>

          {draft === null || draft.contentHash === null ? null : (
            <Section
              id="brand-publish"
              title={message("brandPublishTitle")}
              description={message("brandPublishHint")}
            >
              <div className="grid gap-4 rounded-lg border bg-card p-5 md:p-6">
                {editor ? (
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold">
                      {m("Changed sections:", "الأقسام المتغيرة:")}
                    </span>
                    {brandChangedSections(editor).length ? (
                      brandChangedSections(editor).map((key) => (
                        <StatusStamp key={key} state="active">
                          {
                            {
                              identity: m("Identity", "الهوية"),
                              colors: m("Colors", "الألوان"),
                              typography: m("Typography", "الخطوط"),
                              assets: m("Assets", "الصور"),
                              content: m("Content", "المحتوى"),
                            }[key as "identity"]
                          }
                        </StatusStamp>
                      ))
                    ) : (
                      <span className="text-muted-foreground">
                        {m("No changes", "لا تغيير")}
                      </span>
                    )}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-4">
                  <BrandPreviewButton
                    locale={locale}
                    brandRevisionId={draft.brandRevisionId}
                    label={message("brandPreviewAction")}
                  />
                  <BrandPublicationForm
                    locale={locale}
                    label={message("brandPublishAction")}
                    title={m(
                      "Publish this brand draft?",
                      "هل تريد نشر مسودة العلامة هذه؟",
                    )}
                    change={{
                      kind: "publish",
                      brandRevisionId: draft.brandRevisionId,
                      contentHash: draft.contentHash,
                    }}
                  />
                </div>
              </div>
            </Section>
          )}

          <Section id="brand-history" title={message("brandHistoryTitle")}>
            {revisions === null ? (
              <ErrorState
                title={<>{message("requestsResultUnavailable")}</>}
                retry={<ReadRetry locale={locale} />}
              />
            ) : revisions.length === 0 ? (
              <EmptyState title={message("brandHistoryEmpty")} />
            ) : (
              <DataTable
                id="brand-records"
                caption={message("brandHistoryTitle")}
                columns={[
                  { key: "column-0", label: m("Revision", "النسخة") },
                  { key: "column-1", label: m("State", "الحالة") },
                  { key: "column-2", label: m("Published (UTC)", "تاريخ النشر (UTC)") },
                  { key: "column-3", label: m("Notes", "ملاحظات") },
                  {
                    key: "column-4",
                    label: message("brandRollbackAction"),
                    kind: "actions",
                  },
                ]}
                rows={historyPaging.rows.map((revision) => ({
                  key: revision.brandRevisionId,
                  cells: [
                    <>
                      <ReferenceCode>
                        {revision.brandKey} v{revision.revision}
                      </ReferenceCode>
                    </>,
                    <>
                      <StatusStamp state={revisionStamp(revision.state)}>
                        {workspaceStatus(locale, revision.state)}
                      </StatusStamp>
                    </>,
                    <>
                      {revision.publishedAt === null
                        ? "—"
                        : formatWhen(revision.publishedAt, locale, "UTC")}
                    </>,
                    <>{revision.notes ?? "—"}</>,
                    <>
                      {revision.state === "retired" ? (
                        <BrandPublicationForm
                          locale={locale}
                          label={message("brandRollbackAction")}
                          title={m(
                            `Roll back to revision ${formatNumber(revision.revision, locale)}?`,
                            `هل تريد الرجوع إلى النسخة ${formatNumber(revision.revision, locale)}؟`,
                          )}
                          variant="outline"
                          change={{
                            kind: "rollback",
                            brandId: revision.brandId,
                            toRevision: revision.revision,
                          }}
                        />
                      ) : null}
                    </>,
                  ],
                }))}
              />
            )}
          </Section>
        </DataPage>
      </div>
    </WorkspaceShell>
  );
}
