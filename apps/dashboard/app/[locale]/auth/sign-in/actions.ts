"use server";
import { isLocale } from "@wlbp/i18n";
import { redirect } from "next/navigation";
import { createDashboardAuthClient } from "../../../_lib/auth-server";
import { normalizeAuthReturnPath } from "../../../_lib/auth-return-path";
import type { AuthFormState } from "../../../_lib/auth-form";
import { cookies } from "next/headers";
import { recoveryCookieName } from "../../../_lib/auth-recovery-ticket";

export async function signIn(
  _state: AuthFormState,
  form: FormData,
): Promise<AuthFormState> {
  const locale = form.get("locale");
  const email = form.get("email");
  const password = form.get("password");
  if (
    !isLocale(locale) ||
    typeof email !== "string" ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)
  )
    return { message: "invalid", field: "email" };
  if (typeof password !== "string" || password.length < 1 || password.length > 256)
    return { message: "invalid", field: "password" };
  try {
    const client = await createDashboardAuthClient();
    if (client === null) return { message: "unavailable" };
    const { error } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) return { message: "credentials" };
    (await cookies()).delete(recoveryCookieName);
  } catch {
    return { message: "unavailable" };
  }
  // The destination rechecks active membership and current tenant context.
  redirect(normalizeAuthReturnPath(locale, form.get("returnTo")));
}
