"use client";

import { createBrowserClient as createSsrBrowserClient } from "@supabase/ssr";

import {
  assertPublishableConfiguration,
  type BrowserSupabaseClient,
  type PublishableSupabaseConfiguration,
} from "./types.js";
import type { Database } from "./database.types.js";

export function createBrowserSupabaseClient(
  config: PublishableSupabaseConfiguration,
): BrowserSupabaseClient {
  assertPublishableConfiguration(config);
  return createSsrBrowserClient<Database, "api_v1">(config.url, config.publishableKey, {
    // The generic above is type-only. Without this the client sends
    // Content-Profile: public, which this project does not expose.
    db: { schema: "api_v1" },
  }) as unknown as BrowserSupabaseClient;
}
