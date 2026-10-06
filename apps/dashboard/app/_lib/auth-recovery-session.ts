// The reviewed public server entry owns the server-only poison marker.
import "@wlbp/supabase-client/server";
import { cookies } from "next/headers";
import type { RequestScopedSupabaseClient } from "@wlbp/supabase-client";
import { hasRecentRecoveryAuthentication } from "./auth-recovery";
import { recoveryCookieName, verifyRecoveryTicket } from "./auth-recovery-ticket";

export async function isRecoverySession(
  client: RequestScopedSupabaseClient,
): Promise<boolean> {
  const { data, error } = await client.auth.getClaims();
  const claims = data?.claims;
  if (
    error ||
    !claims ||
    !hasRecentRecoveryAuthentication(claims, Math.floor(Date.now() / 1000)) ||
    typeof claims.session_id !== "string"
  )
    return false;
  return verifyRecoveryTicket(
    (await cookies()).get(recoveryCookieName)?.value,
    process.env.DASHBOARD_RECOVERY_COOKIE_SECRET,
    claims.sub,
    claims.session_id,
    Math.floor(Date.now() / 1000),
  );
}
