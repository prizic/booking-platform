"use server";
import { getVerifiedIdentity, hasRecentAal2 } from "@wlbp/auth";
import { createDashboardAuthClient } from "../../../_lib/auth-server";
import { authenticatorQrCode } from "../../../_lib/auth-qr-code";
export interface MfaResult {
  readonly ok: boolean;
  readonly factorId?: string;
  readonly qrCode?: string;
  readonly secret?: string;
}
export async function enrollAuthenticator(): Promise<MfaResult> {
  try {
    const client = await createDashboardAuthClient();
    if (!client || !(await getVerifiedIdentity(client))) return { ok: false };
    const { data, error } = await client.auth.mfa.enroll({ factorType: "totp" });
    return error || !data
      ? { ok: false }
      : {
          ok: true,
          factorId: data.id,
          qrCode: authenticatorQrCode(data.totp.qr_code),
          secret: data.totp.secret,
        };
  } catch {
    return { ok: false };
  }
}
export async function verifyAuthenticator(
  factorId: string,
  code: string,
): Promise<MfaResult> {
  if (!/^[a-f0-9-]{36}$/iu.test(factorId) || !/^\d{6}$/u.test(code))
    return { ok: false };
  try {
    const client = await createDashboardAuthClient();
    if (!client || !(await getVerifiedIdentity(client))) return { ok: false };
    const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code });
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}
export async function removeAuthenticator(factorId: string): Promise<MfaResult> {
  if (!/^[a-f0-9-]{36}$/iu.test(factorId)) return { ok: false };
  try {
    const client = await createDashboardAuthClient();
    if (!client) return { ok: false };
    const identity = await getVerifiedIdentity(client);
    if (!identity || !hasRecentAal2(identity, Math.floor(Date.now() / 1000), 300))
      return { ok: false };
    const { error } = await client.auth.mfa.unenroll({ factorId });
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}
/** Cancelling setup cannot remove a verified authenticator at AAL1. */
export async function cancelAuthenticatorSetup(factorId: string): Promise<MfaResult> {
  if (!/^[a-f0-9-]{36}$/iu.test(factorId)) return { ok: false };
  try {
    const client = await createDashboardAuthClient();
    if (!client || !(await getVerifiedIdentity(client))) return { ok: false };
    const { data, error } = await client.auth.mfa.listFactors();
    const factor = data?.all.find(
      (item) =>
        item.id === factorId &&
        item.factor_type === "totp" &&
        item.status === "unverified",
    );
    if (error || !factor) return { ok: false };
    const removed = await client.auth.mfa.unenroll({ factorId });
    return { ok: !removed.error };
  } catch {
    return { ok: false };
  }
}
