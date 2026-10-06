import type { Locale } from "@wlbp/i18n";
import { BrandShell } from "@wlbp/white-label-ui";
import { redirect } from "next/navigation";
import { createDashboardAuthClient } from "../../../_lib/auth-server";
import { normalizeAuthReturnPath } from "../../../_lib/auth-return-path";
import { authMessage } from "../../../_lib/auth-copy";
import { dashboardBrand } from "../../../_lib/brand";
import { MfaForm } from "./mfa-form";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  readonly params: Promise<{ locale: Locale }>;
  readonly searchParams: Promise<{ returnTo?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const client = await createDashboardAuthClient(false);
  if (!client || (await client.auth.getUser()).error)
    redirect(`/${locale}/auth/sign-in`);
  const { data, error } = await client.auth.mfa.listFactors();
  const factorNames = (data?.all ?? []).filter(
    (factor) => factor.factor_type === "totp",
  );
  const named = (factor: (typeof factorNames)[number]) => ({
    id: factor.id,
    friendlyName: factor.friendly_name || authMessage(locale, "factor"),
  });
  return (
    <BrandShell
      className="auth-shell"
      labelledBy="mfa-title"
      tokens={dashboardBrand.tokens}
    >
      <div className="access-panel">
        <h1 id="mfa-title">{authMessage(locale, "mfaTitle")}</h1>
        <p>{authMessage(locale, "mfaIntro")}</p>
        <MfaForm
          locale={locale}
          returnTo={normalizeAuthReturnPath(locale, query.returnTo)}
          unavailable={Boolean(error)}
          factors={factorNames
            .filter((factor) => factor.status === "verified")
            .map(named)}
          unfinished={factorNames
            .filter((factor) => factor.status === "unverified")
            .map(named)}
        />
      </div>
    </BrandShell>
  );
}
