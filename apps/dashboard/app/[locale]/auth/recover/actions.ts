"use server";
import {
  actionError,
  actionOk,
  parseActionInput,
  type ActionResult,
} from "@wlbp/ui-foundation/actions";
import { createDashboardAuthClient } from "../../../_lib/auth-server";
import { getDashboardSiteOrigin } from "../../../_lib/site-origin";
import { recoverSchema, type RecoverInput } from "../../../_lib/auth-schema";

export async function recoverPassword(input: RecoverInput): Promise<ActionResult> {
  const parsed = parseActionInput(recoverSchema, input);
  if (!parsed.ok) return parsed.result;
  const { email, locale } = parsed.data;
  try {
    const client = await createDashboardAuthClient();
    if (
      client === null ||
      (process.env.DASHBOARD_RECOVERY_COOKIE_SECRET?.length ?? 0) < 32
    )
      return actionError("unavailable");
    const callback = new URL("/auth/callback", getDashboardSiteOrigin());
    callback.searchParams.set("locale", locale);
    // Return identical confirmation for every provider account outcome.
    await client.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: callback.toString(),
    });
  } catch {
    /* Do not disclose whether the account exists. */
  }
  return actionOk(undefined, "sent");
}
