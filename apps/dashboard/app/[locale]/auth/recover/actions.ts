"use server";
import { isLocale } from "@wlbp/i18n";
import { createDashboardAuthClient } from "../../../_lib/auth-server";
import { getDashboardSiteOrigin } from "../../../_lib/site-origin";
import type { AuthFormState } from "../../../_lib/auth-form";
export async function recoverPassword(
  _state: AuthFormState,
  form: FormData,
): Promise<AuthFormState> {
  const locale = form.get("locale");
  const email = form.get("email");
  if (
    !isLocale(locale) ||
    typeof email !== "string" ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)
  )
    return { message: "invalid", field: "email" };
  try {
    const client = await createDashboardAuthClient();
    if (
      client === null ||
      (process.env.DASHBOARD_RECOVERY_COOKIE_SECRET?.length ?? 0) < 32
    )
      return { message: "unavailable" };
    const callback = new URL("/auth/callback", getDashboardSiteOrigin());
    callback.searchParams.set("locale", locale);
    // Return identical confirmation for every provider account outcome.
    await client.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: callback.toString(),
    });
  } catch {
    /* Do not disclose whether the account exists. */
  }
  return { message: "sent", success: true };
}
