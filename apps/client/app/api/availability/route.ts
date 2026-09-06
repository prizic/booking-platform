import { parsePublicRuntimeConfig } from "@wlbp/config";
import { createRequestScopedSupabaseClient } from "@wlbp/supabase-client/server";
import {
  extractRequestHostname,
  type RuntimeEnvironment,
} from "@wlbp/tenant-resolution";
import { headers } from "next/headers";

import {
  ClientAvailabilityError,
  createClientAvailabilityDataSource,
} from "../../_lib/availability-data-source";
import { parseAvailabilitySearchParams } from "../../_lib/availability-request";

export const dynamic = "force-dynamic";

function runtimeEnvironment(): RuntimeEnvironment {
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

function errorResponse(code: string, status: number): Response {
  return Response.json(
    { error: { code, messageKey: `availability.error.${code}` } },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

export async function GET(request: Request): Promise<Response> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) {
      return errorResponse("availability_unavailable", 503);
    }
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
    const api = client.schema("api_v1") as unknown as Parameters<
      typeof createClientAvailabilityDataSource
    >[0];
    const query = parseAvailabilitySearchParams(new URL(request.url).searchParams);
    const data = await createClientAvailabilityDataSource(
      api,
      hostname,
    ).getAvailability(query);

    return Response.json(data, {
      headers: {
        // The host and complete bounded query are part of the CDN key. This endpoint
        // deliberately creates an anonymous client, so no session data enters it.
        "Cache-Control": "public, max-age=0, s-maxage=15, stale-while-revalidate=15",
        "X-Availability-Advisory": "true",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof ClientAvailabilityError) {
      const status = error.code === "availability_unavailable" ? 503 : 400;
      return errorResponse(error.code, status);
    }
    return errorResponse("availability_unavailable", 503);
  }
}
