import { BrandPublicationForm } from "./brand-publication-form";
import { BrandForm } from "./brand-form";
import { parseBrandEditor, brandChangedSections } from "./brand-fields";
import { dashboardBrand } from "../../_lib/brand";
import { workspaceStatus } from "../../_lib/workspace-status";
import { formatNumber, type Locale } from "@wlbp/i18n";
import { formatWhen } from "../../_lib/booking-display";
import {
  Alert,
  AlertDescription,
  Button,
  EmptyState,
  Facts,
  PageHeader,
  ReferenceCode,
  Section,
  StatusStamp,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type StampState,
} from "@wlbp/ui-foundation";
import { Eye } from "lucide-react";

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
  const yesNo = (value: boolean) => (
    <StatusStamp state={value ? "confirmed" : "neutral"}>
      {message(value ? "brandYes" : "brandNo")}
    </StatusStamp>
  );

  return (
    <WorkspaceShell current="brand" labelledBy="brand-title" locale={locale}>
      <div className="grid gap-10">
        <PageHeader
          titleId="brand-title"
          title={message("brandTitle")}
          description={message("brandSummary")}
        />
        {resultKey === null ? null : (
          <Alert tone={positiveBrandResults.has(result ?? "") ? "positive" : "warning"}>
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
            <Alert tone="danger">
              <AlertDescription className="text-foreground">
                {message("requestsResultUnavailable")}
              </AlertDescription>
            </Alert>
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
                <form action={previewBrandAction}>
                  <input name="locale" type="hidden" value={locale} />
                  <input
                    name="brandRevisionId"
                    type="hidden"
                    value={draft.brandRevisionId}
                  />
                  <Button type="submit" variant="outline">
                    <Eye aria-hidden="true" />
                    {message("brandPreviewAction")}
                  </Button>
                </form>
                <BrandPublicationForm
                  locale={locale}
                  action={publishBrandAction}
                  label={message("brandPublishAction")}
                  title={m(
                    "Publish this brand draft?",
                    "هل تريد نشر مسودة العلامة هذه؟",
                  )}
                  fields={{
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
            <Alert tone="danger">
              <AlertDescription className="text-foreground">
                {message("requestsResultUnavailable")}
              </AlertDescription>
            </Alert>
          ) : revisions.length === 0 ? (
            <EmptyState title={message("brandHistoryEmpty")} />
          ) : (
            <Table label={message("brandHistoryTitle")}>
              <TableHeader>
                <TableRow>
                  <TableHead>{m("Revision", "النسخة")}</TableHead>
                  <TableHead>{m("State", "الحالة")}</TableHead>
                  <TableHead>{m("Published (UTC)", "تاريخ النشر (UTC)")}</TableHead>
                  <TableHead>{m("Notes", "ملاحظات")}</TableHead>
                  <TableHead className="text-end">
                    <span className="sr-only">{message("brandRollbackAction")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {revisions.map((revision) => (
                  <TableRow key={revision.brandRevisionId}>
                    <TableCell>
                      <ReferenceCode>
                        {revision.brandKey} v{revision.revision}
                      </ReferenceCode>
                    </TableCell>
                    <TableCell>
                      <StatusStamp state={revisionStamp(revision.state)}>
                        {workspaceStatus(locale, revision.state)}
                      </StatusStamp>
                    </TableCell>
                    <TableCell>
                      {revision.publishedAt === null
                        ? "—"
                        : formatWhen(revision.publishedAt, locale, "UTC")}
                    </TableCell>
                    <TableCell className="max-w-72 whitespace-normal text-muted-foreground">
                      {revision.notes ?? "—"}
                    </TableCell>
                    <TableCell className="text-end">
                      {revision.state === "retired" ? (
                        <BrandPublicationForm
                          locale={locale}
                          action={rollbackBrandAction}
                          label={message("brandRollbackAction")}
                          title={m(
                            `Roll back to revision ${formatNumber(revision.revision, locale)}?`,
                            `هل تريد الرجوع إلى النسخة ${formatNumber(revision.revision, locale)}؟`,
                          )}
                          variant="outline"
                          fields={{
                            brandId: revision.brandId,
                            toRevision: String(revision.revision),
                          }}
                        />
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>
      </div>
    </WorkspaceShell>
  );
}
