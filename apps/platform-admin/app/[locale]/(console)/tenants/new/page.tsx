import { Alert } from "@wlbp/ui-foundation";
import { say, stateCopy } from "../../../../_lib/copy";
import { atLeast, getOperator } from "../../../../_lib/operator-page";
import { pageLocale } from "../../../../_lib/page-locale";
import { PageHeader } from "../../../../_lib/shell/page-header";
import { TextFormField } from "../../../../_lib/ui/form-fields";
import { OperatorForm } from "../../../../_lib/ui/operator-form";
import { tenantsCopy as c } from "../copy";

export const dynamic = "force-dynamic";

export default async function NewTenantPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = await pageLocale(params);
  const operator = await getOperator(locale);
  if (!operator) return null;
  return (
    <>
      <PageHeader
        locale={locale}
        title={say(locale, c.newTitle)}
        description={say(locale, c.newDescription)}
        breadcrumbs={[
          [say(locale, c.title), `/${locale}/tenants`],
          [say(locale, c.newTitle)],
        ]}
      />
      <section className="max-w-2xl rounded-lg border bg-card p-5 md:p-6">
        {atLeast(operator.role, "admin") ? (
          <OperatorForm
            locale={locale}
            operation="createTenant"
            submit={say(locale, c.register)}
            successMessage={say(locale, c.created_ok)}
            values={{ name: "", brandKey: "" }}
          >
            {/* The kit generates a fresh idempotency key per visit: a double submit replays. */}
            <TextFormField
              id="name"
              name="name"
              label={say(locale, c.tenantName)}
              required
              maxLength={160}
            />
            <TextFormField
              id="brandKey"
              name="brandKey"
              label={say(locale, c.brandKey)}
              description={say(locale, c.brandKeyHint)}
              required
              maxLength={63}
              autoComplete="off"
            />
          </OperatorForm>
        ) : (
          <Alert tone="info">{say(locale, stateCopy.roleRequired)}</Alert>
        )}
      </section>
    </>
  );
}
