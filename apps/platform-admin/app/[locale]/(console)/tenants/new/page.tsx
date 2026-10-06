import { TextField } from "@wlbp/ui-foundation";
import { randomUUID } from "node:crypto";
import { say, stateCopy } from "../../../../_lib/copy";
import { createTenantAction } from "../../../../_lib/actions/tenants";
import { atLeast, getOperator } from "../../../../_lib/operator-page";
import { pageLocale } from "../../../../_lib/page-locale";
import { PageHeader } from "../../../../_lib/shell/page-header";
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
      <section className="section">
        {atLeast(operator.role, "admin") ? (
          <OperatorForm
            locale={locale}
            action={createTenantAction}
            submit={say(locale, c.register)}
            successMessage={say(locale, c.created_ok)}
          >
            {/* A fresh key per render: a double submit replays, a new visit creates. */}
            <input type="hidden" name="idempotencyKey" value={randomUUID()} />
            <TextField
              id="name"
              name="name"
              label={say(locale, c.tenantName)}
              required
              maxLength={160}
            />
            <TextField
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
          <p className="notice">{say(locale, stateCopy.roleRequired)}</p>
        )}
      </section>
    </>
  );
}
