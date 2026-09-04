import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

declare const privilegedScope: unique symbol;

export type PrivilegedSupabaseClient = SupabaseClient & {
  readonly [privilegedScope]: "platform-privileged";
};

export interface PrivilegedSupabaseConfiguration {
  readonly credential: string;
  readonly url: string;
}

export function createPrivilegedSupabaseClient(
  config: PrivilegedSupabaseConfiguration,
): PrivilegedSupabaseClient {
  if (config.url.trim() === "" || config.credential.trim() === "") {
    throw new Error(
      "A Supabase URL and platform-side privileged credential are required",
    );
  }

  return createClient(config.url, config.credential, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  }) as unknown as PrivilegedSupabaseClient;
}
