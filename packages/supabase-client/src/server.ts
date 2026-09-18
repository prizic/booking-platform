import "server-only";

import {
  createServerClient as createSsrServerClient,
  type SetAllCookies,
} from "@supabase/ssr";

import {
  assertPublishableConfiguration,
  type PublishableSupabaseConfiguration,
  type RequestCookieStore,
  type RequestScopedSupabaseClient,
} from "./types.js";
import type { Database } from "./database.types.js";

export function createRequestScopedSupabaseClient(
  config: PublishableSupabaseConfiguration,
  cookies: RequestCookieStore,
): RequestScopedSupabaseClient {
  assertPublishableConfiguration(config);
  const setAll: SetAllCookies | undefined =
    cookies.setAll === undefined
      ? undefined
      : async (values, cacheHeaders) => {
          await cookies.setAll?.(values, cacheHeaders);
        };

  return createSsrServerClient<Database, "api_v1">(config.url, config.publishableKey, {
    // The generic above is type-only. Without this the client sends
    // Content-Profile: public, which this project does not expose.
    db: { schema: "api_v1" },
    cookies: {
      getAll: async () => {
        const values = await cookies.getAll();
        return values === null
          ? null
          : values.map(({ name, value }) => ({ name, value }));
      },
      ...(setAll === undefined ? {} : { setAll }),
    },
  }) as unknown as RequestScopedSupabaseClient;
}
