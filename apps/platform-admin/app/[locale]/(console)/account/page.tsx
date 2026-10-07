import { formatNumber } from "@wlbp/i18n";
import { Alert, Section } from "@wlbp/ui-foundation";
import { accountCopy as c } from "../../../_lib/admin-copy";
import { fill, say } from "../../../_lib/copy";
import { callOperator } from "../../../_lib/operator-api";
import { getOperator } from "../../../_lib/operator-page";
import { pageLocale } from "../../../_lib/page-locale";
import { PageHeader } from "../../../_lib/shell/page-header";
import { Facts } from "../../../_lib/ui/facts";
import { Unknown, UnavailableState } from "../../../_lib/ui/states";
import { RoleBadge } from "../../../_lib/ui/status-badge";
import { TimeValue } from "../../../_lib/ui/time";
import { Factors } from "./factors";

export const dynamic = "force-dynamic";

export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = await pageLocale(params);
  const operator = await getOperator(locale);
  if (!operator) return null;
  const context = await callOperator("get_operator_context_v1");
  const row = context.ok ? context.data[0] : undefined;
  const age = row?.aal2_age_seconds;

  return (
    <>
      <PageHeader
        locale={locale}
        timesInUtc
        title={say(locale, c.title)}
        description={say(locale, c.description)}
      />
      {!context.ok ? (
        <UnavailableState locale={locale} code={context.code} />
      ) : (
        <section aria-labelledby="standing-title" className="grid gap-4">
          <h2 id="standing-title" className="sr-only">
            {say(locale, c.title)}
          </h2>
          <Facts
            items={[
              [say(locale, c.email), <bdi key="e">{operator.email}</bdi>],
              [
                say(locale, c.role),
                <RoleBadge key="r" locale={locale} role={operator.role} />,
              ],
              [
                say(locale, c.expires),
                <TimeValue
                  key="x"
                  locale={locale}
                  value={operator.expiresAt}
                  empty="none"
                />,
              ],
              [
                say(locale, c.lastVerified),
                age === null || age === undefined ? (
                  <Unknown key="v" locale={locale} kind="unknown" />
                ) : (
                  fill(locale, c.minutesAgo, {
                    n: formatNumber(Math.floor(age / 60), locale),
                  })
                ),
              ],
            ]}
          />
          <p className="text-sm leading-relaxed text-muted-foreground">
            {fill(locale, c.stepUp, {
              n: formatNumber(operator.stepUpSeconds / 60, locale),
            })}
          </p>
        </section>
      )}
      <Section id="factors" title={say(locale, c.factors)}>
        <Factors locale={locale} />
      </Section>
      <Section id="recovery" title={say(locale, c.recoveryTitle)}>
        <Alert tone="info">{say(locale, c.recovery)}</Alert>
      </Section>
    </>
  );
}
