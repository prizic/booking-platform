"use server";
import { getVerifiedIdentity, hasRecentAal2 } from "@wlbp/auth";
import {
  actionError,
  actionOk,
  parseActionInput,
  type ActionResult,
} from "@wlbp/ui-foundation/actions";
import { createDashboardAuthClient } from "../../../_lib/auth-server";
import { authenticatorQrCode } from "../../../_lib/auth-qr-code";
import {
  cancelAuthenticatorSetupSchema,
  removeAuthenticatorSchema,
  verifyAuthenticatorSchema,
  type CancelAuthenticatorSetupInput,
  type RemoveAuthenticatorInput,
  type VerifyAuthenticatorInput,
} from "./mfa-schema";

export interface AuthenticatorSetup {
  readonly factorId: string;
  readonly qrCode: string;
  readonly secret: string;
}

/*
 * Failures carry one of two codes, as before: "invalid" (the code or the step
 * was refused) and "unavailable" (setup could not run). Nothing says why.
 */

export async function enrollAuthenticator(): Promise<ActionResult<AuthenticatorSetup>> {
  try {
    const client = await createDashboardAuthClient();
    if (!client || !(await getVerifiedIdentity(client)))
      return actionError("unavailable");
    const { data, error } = await client.auth.mfa.enroll({ factorType: "totp" });
    return error || !data
      ? actionError("unavailable")
      : actionOk({
          factorId: data.id,
          qrCode: authenticatorQrCode(data.totp.qr_code),
          secret: data.totp.secret,
        });
  } catch {
    return actionError("unavailable");
  }
}

export async function verifyAuthenticator(
  input: VerifyAuthenticatorInput,
): Promise<ActionResult> {
  const parsed = parseActionInput(verifyAuthenticatorSchema, input);
  if (!parsed.ok) return parsed.result;
  const { code, factorId } = parsed.data;
  try {
    const client = await createDashboardAuthClient();
    if (!client || !(await getVerifiedIdentity(client))) return actionError("invalid");
    const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code });
    return error ? actionError("invalid") : actionOk();
  } catch {
    return actionError("invalid");
  }
}

export async function removeAuthenticator(
  input: RemoveAuthenticatorInput,
): Promise<ActionResult> {
  const parsed = parseActionInput(removeAuthenticatorSchema, input);
  if (!parsed.ok) return parsed.result;
  const { factorId } = parsed.data;
  try {
    const client = await createDashboardAuthClient();
    if (!client) return actionError("invalid");
    const identity = await getVerifiedIdentity(client);
    if (!identity || !hasRecentAal2(identity, Math.floor(Date.now() / 1000), 300))
      return actionError("invalid");
    const { error } = await client.auth.mfa.unenroll({ factorId });
    return error ? actionError("invalid") : actionOk();
  } catch {
    return actionError("invalid");
  }
}

/** Cancelling setup cannot remove a verified authenticator at AAL1. */
export async function cancelAuthenticatorSetup(
  input: CancelAuthenticatorSetupInput,
): Promise<ActionResult> {
  const parsed = parseActionInput(cancelAuthenticatorSetupSchema, input);
  if (!parsed.ok) return actionError("unavailable");
  const { factorId } = parsed.data;
  try {
    const client = await createDashboardAuthClient();
    if (!client || !(await getVerifiedIdentity(client)))
      return actionError("unavailable");
    const { data, error } = await client.auth.mfa.listFactors();
    const factor = data?.all.find(
      (item) =>
        item.id === factorId &&
        item.factor_type === "totp" &&
        item.status === "unverified",
    );
    if (error || !factor) return actionError("unavailable");
    const removed = await client.auth.mfa.unenroll({ factorId });
    return removed.error ? actionError("unavailable") : actionOk();
  } catch {
    return actionError("unavailable");
  }
}
