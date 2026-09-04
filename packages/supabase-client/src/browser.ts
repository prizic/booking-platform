"use client";

import { createBrowserClient as createSsrBrowserClient } from "@supabase/ssr";

import {
  assertPublishableConfiguration,
  type BrowserSupabaseClient,
  type PublishableSupabaseConfiguration,
} from "./types.js";

export function createBrowserSupabaseClient(
  config: PublishableSupabaseConfiguration,
): BrowserSupabaseClient {
  assertPublishableConfiguration(config);
  return createSsrBrowserClient(
    config.url,
    config.publishableKey,
  ) as unknown as BrowserSupabaseClient;
}
