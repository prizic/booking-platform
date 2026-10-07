import type { Locale } from "@wlbp/i18n";
import { Alert, AlertDescription } from "@wlbp/ui-foundation";
import Link from "next/link";
import { authMessage } from "../../../_lib/auth-copy";
import { RecoverForm } from "../../../_lib/auth-form";
import { AuthFrame, authLinkClass } from "../../../_lib/auth-frame";
import { recoverPassword } from "./actions";
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
      title={authMessage(locale, "recoverTitle")}
      path="/auth/recover"
      footer={
        <Link className={authLinkClass} href={`/${locale}/auth/sign-in`}>
          {authMessage(locale, "signIn")}
        </Link>
      }
    >
      {query.error ? (
        <Alert tone="danger">
          <AlertDescription className="text-foreground">
            {authMessage(locale, "expired")}
          </AlertDescription>
        </Alert>
      ) : null}
      <RecoverForm action={recoverPassword} locale={locale} />
    </AuthFrame>
  );
}
