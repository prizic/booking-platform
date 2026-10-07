import type { ResponseCookie } from "@wlbp/supabase-client";
import { cookies } from "next/headers";
import { createRequestScopedSupabaseClient } from "@wlbp/supabase-client/server";
import { getDashboardRuntimeConfiguration } from "./dashboard-server";

/** Writable only in Actions/Route Handlers; workspace loaders remain read-only. */
export async function createDashboardAuthClient(writable = true) {
  const configuration = getDashboardRuntimeConfiguration();
  if (configuration === null) return null;
  const store = await cookies();
  return createRequestScopedSupabaseClient(
    {
      url: configuration.supabaseUrl,
      publishableKey: configuration.supabasePublishableKey,
    },
    {
      getAll: () => store.getAll(),
      ...(writable
        ? {
            setAll: (values: readonly ResponseCookie[]) => {
              for (const { name, value, options } of values)
                store.set(name, value, options);
            },
          }
        : {}),
    },
  );
}
