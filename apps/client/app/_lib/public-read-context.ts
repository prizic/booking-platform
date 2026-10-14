import { parsePublicRuntimeConfig } from "@wlbp/config";
import { createRequestScopedSupabaseClient } from "@wlbp/supabase-client/server";
import { extractRequestHostname } from "@wlbp/tenant-resolution";
import { headers } from "next/headers";

import { runtimeEnvironment } from "./tenant-request";

export interface PublicRpcResult {
  readonly data: unknown;
  readonly error: { readonly code?: string } | null;
}
export interface PublicRpcRequest extends PromiseLike<PublicRpcResult> {
  setHeader?(name: string, value: string): PublicRpcRequest;
}
export interface PublicRpcClient {
  rpc(name: string, args: Record<string, unknown>): PublicRpcRequest;
}

export type PublicReadFailure = {
  readonly outcome: "error";
  readonly reason: "configuration" | "tenant" | "read" | "parse";
};

/** Anonymous, request-scoped reads. No staff session or shared authorization cache. */
export async function createPublicReadContext(): Promise<
  | {
      readonly outcome: "ready";
      readonly api: PublicRpcClient;
      readonly hostname: string;
    }
  | PublicReadFailure
> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { outcome: "error", reason: "configuration" };
  let configuration;
  try {
    configuration = parsePublicRuntimeConfig({
      environment: runtimeEnvironment(),
      supabaseUrl: url,
      supabasePublishableKey: key,
    });
  } catch {
    return { outcome: "error", reason: "configuration" };
  }
  let hostname: string;
  try {
    hostname = extractRequestHostname(await headers(), {
      ...(process.env.LOCAL_TENANT_HOST
        ? { localFallback: process.env.LOCAL_TENANT_HOST }
        : {}),
      runtimeEnvironment: runtimeEnvironment(),
    });
  } catch {
    return { outcome: "error", reason: "tenant" };
  }
  try {
    const client = createRequestScopedSupabaseClient(
      {
        url: configuration.supabaseUrl,
        publishableKey: configuration.supabasePublishableKey,
      },
      { getAll: () => [] },
    );
    return {
      outcome: "ready",
      hostname,
      api: client.schema("api_v1") as unknown as PublicRpcClient,
    };
  } catch {
    return { outcome: "error", reason: "configuration" };
  }
}

export function publicRpcFailure(error: { readonly code?: string }): PublicReadFailure {
  return { outcome: "error", reason: error.code === "42501" ? "tenant" : "read" };
}

/** Fixed diagnostic vocabulary only: never log exceptions, hosts, content or credentials. */
export function reportPublicReadFailure(
  operation: "catalog" | "brand",
  failure: PublicReadFailure,
): void {
  console.warn(
    JSON.stringify({
      event: "client_public_read_failure",
      operation,
      outcome: failure.reason,
    }),
  );
}
