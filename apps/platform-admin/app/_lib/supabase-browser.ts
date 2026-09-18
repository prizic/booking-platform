"use client";

import { createBrowserSupabaseClient } from "@wlbp/supabase-client/browser";
import type { BrowserSupabaseClient } from "@wlbp/supabase-client";

export function getPlatformAdminBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("Supabase browser configuration is missing");
  }
  return createBrowserSupabaseClient({ publishableKey, url });
}

/**
 * A TOTP factor at aal1 always needs the same two calls to reach aal2,
 * whether it is a first-time enrollment or a returning sign-in — one place
 * for that instead of the login and enrollment pages each repeating it.
 */
export async function verifyMfaCode(
  client: BrowserSupabaseClient,
  factorId: string,
  code: string,
) {
  const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({
    factorId,
  });
  if (challengeError) return { error: challengeError };
  return client.auth.mfa.verify({ challengeId: challenge.id, code, factorId });
}
