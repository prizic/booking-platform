"use client";

import { actionError, actionOk, type ActionResult } from "@wlbp/ui-foundation";
import type { SignInInput, TotpCodeInput } from "./schemas/auth";
import { getPlatformAdminBrowserClient, verifyMfaCode } from "./supabase-browser";

/** Where a successful password sign-in goes next. */
export type SignInNext =
  { next: "mfa"; factorId: string } | { next: "enroll" } | { next: "done" };

/**
 * Password sign-in through Supabase Auth in the browser (no server action:
 * the session cookie is written by the browser client). Fails with
 * `invalid_credentials`, `auth_unavailable` or `no_factor`.
 */
export async function signInWithPassword({
  email,
  password,
}: SignInInput): Promise<ActionResult<SignInNext>> {
  const client = getPlatformAdminBrowserClient();
  const { error } = await client.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error)
    return actionError(
      error.status === 400 ? "invalid_credentials" : "auth_unavailable",
    );
  const { data: aal } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
    const { data: factors } = await client.auth.mfa.listFactors();
    const factor = factors?.totp.find((entry) => entry.status === "verified");
    return factor
      ? actionOk({ next: "mfa", factorId: factor.id })
      : actionError("no_factor");
  }
  if (aal?.nextLevel === "aal1") return actionOk({ next: "enroll" });
  return actionOk({ next: "done" });
}

/** Verifies a TOTP code for a factor, reaching aal2. Fails with `invalid_code`. */
export async function verifyFactorCode(
  factorId: string,
  { code }: TotpCodeInput,
): Promise<ActionResult> {
  const { error } = await verifyMfaCode(
    getPlatformAdminBrowserClient(),
    factorId,
    code.trim(),
  );
  return error ? actionError("invalid_code") : actionOk();
}

/** A signed-in aal1 session with a verified factor goes straight to the code step. */
export async function pendingFactor(): Promise<string | null> {
  const client = getPlatformAdminBrowserClient();
  const { data } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (data?.currentLevel !== "aal1" || data.nextLevel !== "aal2") return null;
  const { data: factors } = await client.auth.mfa.listFactors();
  return factors?.totp.find((entry) => entry.status === "verified")?.id ?? null;
}
