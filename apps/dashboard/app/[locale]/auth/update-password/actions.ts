"use server";
import { isLocale } from "@wlbp/i18n";
import { redirect } from "next/navigation";
import { createDashboardAuthClient } from "../../../_lib/auth-server";
import { isRecoverySession } from "../../../_lib/auth-recovery-session";
import { recoveryCookieName } from "../../../_lib/auth-recovery-ticket";
import { cookies } from "next/headers";
import type { AuthFormState } from "../../../_lib/auth-form";
export async function updatePassword(
  _state: AuthFormState,
  form: FormData,
): Promise<AuthFormState> {
  const locale = form.get("locale");
  const password = form.get("password");
  if (
    !isLocale(locale) ||
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 256 ||
    password !== form.get("confirmation")
  )
    return { message: "invalid", field: "password" };
  try {
    const client = await createDashboardAuthClient();
    if (client === null) return { message: "unavailable" };
    if (!(await isRecoverySession(client))) return { message: "expired" };
    const result = await client.auth.updateUser({ password });
    if (result.error) return { message: "expired" };
    (await cookies()).delete(recoveryCookieName);
    const signedOut = await client.auth.signOut({ scope: "global" });
    if (signedOut.error) return { message: "unavailable" };
  } catch {
    return { message: "unavailable" };
  }
  redirect(`/${locale}/auth/sign-in`);
}
