import { parsePublicRuntimeConfig, type RuntimeEnvironment } from "@wlbp/config";
import { createRequestScopedSupabaseClient } from "@wlbp/supabase-client/server";
import { cookies } from "next/headers";

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
