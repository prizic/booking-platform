import type { Locale } from "@wlbp/i18n";
import { Alert, AlertDescription } from "@wlbp/ui-foundation";
import Link from "next/link";
import { authMessage } from "../../../_lib/auth-copy";
import { SignInForm } from "../../../_lib/auth-form";
import { AuthFrame, authLinkClass } from "../../../_lib/auth-frame";
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
    <AuthFrame
      locale={locale}
      titleId="auth-title"
      title={authMessage(locale, "signIn")}
      intro={authMessage(locale, "intro")}
      path="/auth/sign-in"
      footer={
        <Link className={authLinkClass} href={`/${locale}/auth/recover`}>
          {authMessage(locale, "recover")}
        </Link>
      }
    >
      {query.error ? (
        <Alert tone="danger">
          <AlertDescription className="text-foreground">
            {authMessage(
              locale,
              query.error === "invitation" ? "invitationExpired" : "expired",
            )}
          </AlertDescription>
        </Alert>
      ) : null}
      <SignInForm
        action={signIn}
        locale={locale}
        returnTo={normalizeAuthReturnPath(locale, query.returnTo)}
      />
    </AuthFrame>
  );
}
