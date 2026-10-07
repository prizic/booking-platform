import type { Locale } from "@wlbp/i18n";
import { Alert, AlertDescription } from "@wlbp/ui-foundation";
import Link from "next/link";
import { authMessage } from "../../../_lib/auth-copy";
import { AuthForm } from "../../../_lib/auth-form";
import { AuthFrame, authLinkClass } from "../../../_lib/auth-frame";
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
    <AuthFrame
      locale={locale}
      titleId="auth-title"
      title={authMessage(locale, "updateTitle")}
      path="/auth/update-password"
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
      <AuthForm
        action={updatePassword}
        mode="update-password"
        locale={locale}
        returnTo={normalizeAuthReturnPath(locale, query.returnTo)}
      />
    </AuthFrame>
  );
}
