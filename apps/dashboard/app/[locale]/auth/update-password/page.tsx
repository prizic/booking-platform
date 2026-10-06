import type { Locale } from "@wlbp/i18n";
import Link from "next/link";
import { BrandShell } from "@wlbp/white-label-ui";
import { dashboardBrand } from "../../../_lib/brand";
import { authMessage } from "../../../_lib/auth-copy";
import { AuthForm } from "../../../_lib/auth-form";
import { normalizeAuthReturnPath } from "../../../_lib/auth-return-path";
import { updatePassword } from "./actions";
import { createDashboardAuthClient } from "../../../_lib/auth-server";
import { isRecoverySession } from "../../../_lib/auth-recovery-session";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  readonly params: Promise<{ locale: Locale }>;
  readonly searchParams: Promise<{ returnTo?: string; error?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const client = await createDashboardAuthClient(false);
  if (!client || !(await isRecoverySession(client)))
    redirect(`/${locale}/auth/recover?error=expired`);
  return (
    <BrandShell
      className="auth-shell"
      labelledBy="auth-title"
      tokens={dashboardBrand.tokens}
    >
      <div className="access-panel">
        <Link href={`/${locale}/today`}>{dashboardBrand.name}</Link>
        <h1 id="auth-title">{authMessage(locale, "updateTitle")}</h1>
        {query.error ? <p role="alert">{authMessage(locale, "expired")}</p> : null}
        <AuthForm
          action={updatePassword}
          mode="update-password"
          locale={locale}
          returnTo={normalizeAuthReturnPath(locale, query.returnTo)}
        />
        <Link href={`/${locale}/auth/sign-in`}>{authMessage(locale, "signIn")}</Link>
        <nav aria-label={locale === "en" ? "Language" : "اللغة"}>
          <Link href="/en/auth/update-password">English</Link>{" "}
          <Link href="/ar/auth/update-password">العربية</Link>
        </nav>
      </div>
    </BrandShell>
  );
}
