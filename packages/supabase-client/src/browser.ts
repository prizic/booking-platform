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
  return createSsrBrowserClient<Database, "api_v1">(
    config.url,
    config.publishableKey,
  ) as unknown as BrowserSupabaseClient;
}
