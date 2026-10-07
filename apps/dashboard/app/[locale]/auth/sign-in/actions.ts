"use server";
import {
  actionError,
  parseActionInput,
  type ActionResult,
} from "@wlbp/ui-foundation/actions";
import { redirect } from "next/navigation";
import { createDashboardAuthClient } from "../../../_lib/auth-server";
import { normalizeAuthReturnPath } from "../../../_lib/auth-return-path";
import { signInSchema, type SignInInput } from "../../../_lib/auth-schema";
import { cookies } from "next/headers";
import { recoveryCookieName } from "../../../_lib/auth-recovery-ticket";

export async function signIn(input: SignInInput): Promise<ActionResult> {
  const parsed = parseActionInput(signInSchema, input);
  if (!parsed.ok) return parsed.result;
  const { email, locale, password, returnTo } = parsed.data;
  try {
    const client = await createDashboardAuthClient();
    if (client === null) return actionError("unavailable");
    const { error } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) return actionError("credentials");
    (await cookies()).delete(recoveryCookieName);
  } catch {
    return actionError("unavailable");
  }
  // The destination rechecks active membership and current tenant context.
  redirect(normalizeAuthReturnPath(locale, returnTo));
}
