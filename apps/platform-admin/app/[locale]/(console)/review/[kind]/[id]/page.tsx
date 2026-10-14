import { Alert, ReferenceCode, Section } from "@wlbp/ui-foundation";
import { notFound } from "next/navigation";
import { auditActionCopy } from "../../../../../_lib/audit-copy";
import { copyFor, say } from "../../../../../_lib/copy";
import { reviewCopy as c } from "../../../../../_lib/lifecycle-copy";
import { callOperator } from "../../../../../_lib/operator-api";
import { atLeast, getOperator } from "../../../../../_lib/operator-page";
import { pageLocale } from "../../../../../_lib/page-locale";
import { reviewApprovalCopy } from "../../../../../_lib/review-presentation";
import { asUuid } from "../../../../../_lib/schemas/fields";
import { PageHeader } from "../../../../../_lib/shell/page-header";
import { ActionDialog } from "../../../../../_lib/ui/action-dialog";
import { Facts } from "../../../../../_lib/ui/facts";
import { EmptyState, UnavailableState, Unknown } from "../../../../../_lib/ui/states";
import { StatusBadge } from "../../../../../_lib/ui/status-badge";
import { TextLink } from "../../../../../_lib/ui/text";
import { TimeValue } from "../../../../../_lib/ui/time";
import { ReviewDetails } from "../../../../../_lib/ui/review-details";
export const dynamic = "force-dynamic";
export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ locale: string; kind: string; id: string }>;
}) {
  const locale = await pageLocale(params);
  const { kind, id } = await params;
  const operator = await getOperator(locale);
  if (!operator) return null;
  if ((kind !== "job" && kind !== "support") || !asUuid(id)) notFound();
  const result = await callOperator("get_operator_review_v1", {
    p_kind: kind,
    p_id: id,
  });
  if (!result.ok && result.code === "not_found") notFound();
  if (!result.ok)
    return (
      <>
        <PageHeader locale={locale} title={say(locale, c.title)} />
        <UnavailableState locale={locale} code={result.code} />
      </>
    );
  const d = result.data;
  const title = copyFor(c, d.action, locale);
  const admin = atLeast(operator.role, "admin");
  return (
    <>
      <PageHeader
        locale={locale}
        title={title}
        timesInUtc
        breadcrumbs={[[say(locale, c.title), `/${locale}/review`], [title]]}
        meta={<ReferenceCode>{d.id}</ReferenceCode>}
        actions={<StatusBadge locale={locale} status={d.status} />}
      />
      <Facts
        items={[
          [
            say(locale, c.tenant),
            d.tenant_id ? (
              <TextLink key="t" href={`/${locale}/tenants/${d.tenant_id}`}>
                <bdi>{d.tenant_name ?? d.tenant_id}</bdi>
              </TextLink>
            ) : (
              "—"
            ),
          ],
          [
            say(locale, c.requester),
            d.requested_by ? (
              <bdi key="r">{d.requested_by}</bdi>
            ) : (
              <Unknown key="r" locale={locale} kind="notReported" />
            ),
          ],
          [
            say(locale, c.reason),
            d.reason ?? <Unknown key="reason" locale={locale} kind="notReported" />,
          ],
          [
            say(locale, c.requestedAt),
            <TimeValue key="at" locale={locale} value={d.requested_at} />,
          ],
        ]}
      />
      {d.status === "pending" ? (
        d.can_decide && admin ? (
          <div className="flex flex-wrap gap-3">
            {(["approve", "reject"] as const).map((decision) => (
              <ActionDialog
                key={decision}
                locale={locale}
                operation="decideReview"
                trigger={say(locale, c[decision])}
                title={say(locale, c[decision])}
                description={say(locale, c.decisionBody)}
                submit={say(locale, c[decision])}
                successMessage={say(
                  locale,
                  decision === "approve" ? reviewApprovalCopy(d) : c.rejected,
                )}
                danger={decision === "reject"}
                hidden={{ kind: d.kind, id: d.id, decision }}
              />
            ))}
          </div>
        ) : (
          <Alert>{say(locale, admin ? c.independent : c.readOnly)}</Alert>
        )
      ) : (
        <Alert>{say(locale, c.decided)}</Alert>
      )}
      <Section id="review-detail" title={say(locale, c.detail)}>
        {d.kind === "job" ? (
          <TextLink href={`/${locale}/jobs/${d.id}`}>{say(locale, c.job)}</TextLink>
        ) : null}
        <ReviewDetails locale={locale} detail={d.detail} />
      </Section>
      <Section id="review-history" title={say(locale, c.history)}>
        {d.history.length === 0 ? (
          <EmptyState locale={locale} title={say(locale, c.noHistory)} />
        ) : (
          <ol className="divide-y rounded-lg border bg-card">
            {d.history.map((event) => (
              <li key={event.id} className="grid gap-2 p-4 text-sm">
                <TimeValue locale={locale} value={event.created_at} />
                <strong>{copyFor(auditActionCopy, event.action, locale)}</strong>
                <p>
                  <bdi>{event.operator_id}</bdi> · {event.reason}
                </p>
                <StatusBadge locale={locale} status={event.outcome} />
              </li>
            ))}
          </ol>
        )}
      </Section>
    </>
  );
}
