"use client";

import { actionError, actionOk, type ActionResult } from "@wlbp/ui-foundation";
import { getPlatformAdminBrowserClient, verifyMfaCode } from "../supabase-browser";
import type { TotpCodeInput } from "../schemas/auth";

/**
 * A fresh TOTP verification; the refreshed session cookie carries the new amr
 * time. Fails with `no_factor` or `invalid_code`.
 */
export async function verifyStepUp({ code }: TotpCodeInput): Promise<ActionResult> {
  const client = getPlatformAdminBrowserClient();
  const { data } = await client.auth.mfa.listFactors();
  const factor = data?.totp.find((entry) => entry.status === "verified");
  if (!factor) return actionError("no_factor");
  const { error } = await verifyMfaCode(client, factor.id, code.trim());
  return error ? actionError("invalid_code") : actionOk();
}
