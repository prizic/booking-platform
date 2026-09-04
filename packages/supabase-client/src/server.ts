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

  return createSsrServerClient(config.url, config.publishableKey, {
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
