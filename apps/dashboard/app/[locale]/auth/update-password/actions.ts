"use server";
import {
  actionError,
  parseActionInput,
  type ActionResult,
} from "@wlbp/ui-foundation/actions";
import { redirect } from "next/navigation";
import { createDashboardAuthClient } from "../../../_lib/auth-server";
import { isRecoverySession } from "../../../_lib/auth-recovery-session";
import { recoveryCookieName } from "../../../_lib/auth-recovery-ticket";
import { cookies } from "next/headers";
import {
  updatePasswordSchema,
  type UpdatePasswordInput,
} from "../../../_lib/auth-schema";

export async function updatePassword(
  input: UpdatePasswordInput,
): Promise<ActionResult> {
  const parsed = parseActionInput(updatePasswordSchema, input);
  if (!parsed.ok) return parsed.result;
  const { locale, password } = parsed.data;
  try {
    const client = await createDashboardAuthClient();
    if (client === null) return actionError("unavailable");
    if (!(await isRecoverySession(client))) return actionError("expired");
    const result = await client.auth.updateUser({ password });
    if (result.error) return actionError("expired");
    (await cookies()).delete(recoveryCookieName);
    const signedOut = await client.auth.signOut({ scope: "global" });
    if (signedOut.error) return actionError("unavailable");
  } catch {
    return actionError("unavailable");
  }
  redirect(`/${locale}/auth/sign-in`);
}
