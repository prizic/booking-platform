import type { CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

declare const browserScope: unique symbol;
declare const requestScope: unique symbol;

export type BrowserSupabaseClient = SupabaseClient & {
  readonly [browserScope]: "browser-publishable";
};

export type RequestScopedSupabaseClient = SupabaseClient & {
  readonly [requestScope]: "request-user";
};

export interface PublishableSupabaseConfiguration {
  readonly publishableKey: string;
  readonly url: string;
}

export interface RequestCookie {
  readonly name: string;
  readonly value: string;
}

export interface ResponseCookie extends RequestCookie {
  readonly options: CookieOptions;
}

export interface RequestCookieStore {
  readonly getAll: () =>
    Promise<readonly RequestCookie[] | null> | readonly RequestCookie[] | null;
  readonly setAll?: (
    cookies: readonly ResponseCookie[],
    cacheHeaders: Readonly<Record<string, string>>,
  ) => Promise<void> | void;
}

export function assertPublishableConfiguration(
  config: PublishableSupabaseConfiguration,
): void {
  if (config.url.trim() === "" || config.publishableKey.trim() === "") {
    throw new Error("A Supabase URL and publishable key are required");
  }
}
