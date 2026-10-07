import type { Locale } from "@wlbp/i18n";
import { redirect } from "next/navigation";
import { createDashboardAuthClient } from "../../../_lib/auth-server";
import { normalizeAuthReturnPath } from "../../../_lib/auth-return-path";
import { authMessage } from "../../../_lib/auth-copy";
import { AuthFrame, authLinkClass } from "../../../_lib/auth-frame";
import { pwaMessage } from "../../../_lib/pwa-copy";
import Link from "next/link";
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
    <AuthFrame
      locale={locale}
      titleId="mfa-title"
      title={authMessage(locale, "mfaTitle")}
      intro={authMessage(locale, "mfaIntro")}
      path="/auth/mfa"
      footer={
        <Link href={`/${locale}/install`} className={authLinkClass}>
          {pwaMessage(locale, "installLink")}
        </Link>
      }
    >
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
    </AuthFrame>
  );
}
