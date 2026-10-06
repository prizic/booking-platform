import type { Locale } from "@wlbp/i18n";
import Link from "next/link";
import { BrandShell } from "@wlbp/white-label-ui";
import { dashboardBrand } from "../../../_lib/brand";
import { authMessage } from "../../../_lib/auth-copy";
import { AuthForm } from "../../../_lib/auth-form";
import { normalizeAuthReturnPath } from "../../../_lib/auth-return-path";
import { signIn } from "./actions";
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
  return (
    <BrandShell
      className="auth-shell"
      labelledBy="auth-title"
      tokens={dashboardBrand.tokens}
    >
      <div className="access-panel">
        <Link href={`/${locale}/today`}>{dashboardBrand.name}</Link>
        <h1 id="auth-title">{authMessage(locale, "signIn")}</h1>
        {query.error ? (
          <p role="alert">
            {authMessage(
              locale,
              query.error === "invitation" ? "invitationExpired" : "expired",
            )}
          </p>
        ) : null}
        <AuthForm
          action={signIn}
          mode="sign-in"
          locale={locale}
          returnTo={normalizeAuthReturnPath(locale, query.returnTo)}
        />
        <Link href={`/${locale}/auth/recover`}>{authMessage(locale, "recover")}</Link>
        <nav aria-label={locale === "en" ? "Language" : "اللغة"}>
          <Link href="/en/auth/sign-in">English</Link>{" "}
          <Link href="/ar/auth/sign-in">العربية</Link>
        </nav>
      </div>
    </BrandShell>
  );
}
