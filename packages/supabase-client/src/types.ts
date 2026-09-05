import type { CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types.js";

declare const browserScope: unique symbol;
declare const requestScope: unique symbol;

export type BrowserSupabaseClient = SupabaseClient<Database, "api_v1"> & {
  readonly [browserScope]: "browser-publishable";
};

export type RequestScopedSupabaseClient = SupabaseClient<Database, "api_v1"> & {
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

function isLegacyAnonJwt(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const payload = parts[1];
  if (payload === undefined || !/^[A-Za-z0-9_-]+$/u.test(payload)) return false;

  try {
    const normalized = payload.replace(/-/gu, "+").replace(/_/gu, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    const decoded: unknown = JSON.parse(atob(padded));
    return (
      typeof decoded === "object" &&
      decoded !== null &&
      "role" in decoded &&
      decoded.role === "anon"
    );
  } catch {
    return false;
  }
}

export function assertPublishableConfiguration(
  config: PublishableSupabaseConfiguration,
): void {
  const key = config.publishableKey.trim();
  if (
    config.url.trim() === "" ||
    (!/^sb_publishable_[A-Za-z0-9_-]+$/u.test(key) && !isLegacyAnonJwt(key))
  ) {
    throw new Error("A valid Supabase URL and publishable key are required");
  }
}
