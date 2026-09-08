import { parsePublicRuntimeConfig } from "@wlbp/config";
import { createRequestScopedSupabaseClient } from "@wlbp/supabase-client/server";
import {
  extractRequestHostname,
  type RuntimeEnvironment,
} from "@wlbp/tenant-resolution";
import { headers } from "next/headers";

export function runtimeEnvironment(): RuntimeEnvironment {
  const value = process.env.WLBP_RUNTIME_ENV;
  if (
    value === "local" ||
    value === "test" ||
    value === "development" ||
    value === "preview" ||
    value === "production"
  ) {
    return value;
  }
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

/**
 * Anonymous api_v1 access for one request, with the hostname the platform
 * trusts. The hostname is evidence for tenant resolution in the database; it is
 * never authorization on its own.
 */
export async function createPublicApiContext(): Promise<{
  readonly api: {
    rpc(name: string, args: Record<string, unknown>): PromiseLike<never>;
  };
  readonly hostname: string;
} | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const configuration = parsePublicRuntimeConfig({
    environment: runtimeEnvironment(),
    supabasePublishableKey: key,
    supabaseUrl: url,
  });
  const hostname = extractRequestHostname(await headers(), {
    ...(process.env.LOCAL_TENANT_HOST
      ? { localFallback: process.env.LOCAL_TENANT_HOST }
      : {}),
    runtimeEnvironment: runtimeEnvironment(),
  });
  const client = createRequestScopedSupabaseClient(
    {
      publishableKey: configuration.supabasePublishableKey,
      url: configuration.supabaseUrl,
    },
    { getAll: () => [] },
  );
  return {
    api: client.schema("api_v1") as never,
    hostname,
  };
}

export function contractErrorResponse(code: string, status: number): Response {
  return Response.json(
    { error: { code, messageKey: `booking.error.${code}` } },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

/** Stable error codes map to a status; nothing else leaks the reason. */
export function contractErrorStatus(code: string): number {
  switch (code) {
    case "invalid_request":
      return 400;
    case "not_authorized":
      return 403;
    case "slot_unavailable":
    case "capacity_exhausted":
    case "revision_conflict":
    case "idempotency_conflict":
      return 409;
    case "policy_denied":
      return 422;
    case "payment_pending":
      return 402;
    default:
      return 503;
  }
}
