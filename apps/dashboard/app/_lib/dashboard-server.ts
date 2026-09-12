import { parsePublicRuntimeConfig, type RuntimeEnvironment } from "@wlbp/config";
import { createRequestScopedSupabaseClient } from "@wlbp/supabase-client/server";
import { extractRequestHostname } from "@wlbp/tenant-resolution";
import type { Locale } from "@wlbp/i18n";
import { cookies, headers } from "next/headers";
import { cache } from "react";

import { loadDashboardAccess, type DashboardAccessState } from "./dashboard-access";
import { createDashboardDataSource } from "./dashboard-data-source";

function runtimeEnvironment(): RuntimeEnvironment {
  const configured = process.env.WLBP_RUNTIME_ENV;
  if (
    configured === "local" ||
    configured === "test" ||
    configured === "development" ||
    configured === "preview" ||
    configured === "production"
  ) {
    return configured;
  }
  return process.env.NODE_ENV === "production"
    ? "production"
    : process.env.NODE_ENV === "test"
      ? "test"
      : "development";
}

export function getDashboardRuntimeConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return null;

  return parsePublicRuntimeConfig({
    environment: runtimeEnvironment(),
    supabasePublishableKey: publishableKey,
    supabaseUrl: url,
  });
}

export async function createDashboardRequestDataSource() {
  const configuration = getDashboardRuntimeConfiguration();
  if (configuration === null) return null;
  const cookieStore = await cookies();
  const client = createRequestScopedSupabaseClient(
    {
      publishableKey: configuration.supabasePublishableKey,
      url: configuration.supabaseUrl,
    },
    { getAll: () => cookieStore.getAll() },
  );
  return createDashboardDataSource(client);
}

export type DashboardRequestAccess =
  | {
      readonly source: null;
      readonly state: { readonly kind: "configuration-missing" };
    }
  | {
      readonly source: Awaited<ReturnType<typeof createDashboardRequestDataSource>>;
      readonly state: DashboardAccessState;
    };

/**
 * Memoized for the life of one request. Every surface already calls this once,
 * and issue #102 added a second caller in the shell; without `cache` that would
 * be a second round trip per page for an answer that cannot have changed.
 */
export const loadDashboardRequestAccess = cache(
  async function loadDashboardRequestAccess(
    locale: Locale,
  ): Promise<DashboardRequestAccess> {
    const source = await createDashboardRequestDataSource();
    if (source === null) {
      return { source: null, state: { kind: "configuration-missing" } };
    }

    let hostname: string;
    try {
      const localFallback = process.env.LOCAL_TENANT_HOST;
      hostname = extractRequestHostname(await headers(), {
        ...(localFallback === undefined ? {} : { localFallback }),
        runtimeEnvironment: runtimeEnvironment(),
      });
    } catch {
      return {
        source,
        state: { kind: "denied", reason: "invalid_host" },
      };
    }

    return {
      source,
      state: await loadDashboardAccess({ hostname, locale }, source),
    };
  },
);
