"use client";

import { getPlatformAdminBrowserClient, verifyMfaCode } from "../supabase-browser";

/** A fresh TOTP verification; the refreshed session cookie carries the new amr time. */
export async function verifyStepUp(
  code: string,
): Promise<"ok" | "invalid" | "no-factor"> {
  const client = getPlatformAdminBrowserClient();
  const { data } = await client.auth.mfa.listFactors();
  const factor = data?.totp.find((entry) => entry.status === "verified");
  if (!factor) return "no-factor";
  const { error } = await verifyMfaCode(client, factor.id, code);
  return error ? "invalid" : "ok";
}
