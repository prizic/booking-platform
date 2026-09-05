import { createContentSecurityPolicy } from "@wlbp/config";
import { createRequestScopedSupabaseClient } from "@wlbp/supabase-client/server";
import { type NextRequest, NextResponse } from "next/server";

import { applyPrivateNoStoreHeaders } from "./app/_lib/private-response";

export async function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const policy = createContentSecurityPolicy(nonce, {
    connectSources: supabaseUrl === undefined ? [] : [supabaseUrl],
    development: process.env.NODE_ENV !== "production",
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (supabaseUrl !== undefined && publishableKey !== undefined) {
    const client = createRequestScopedSupabaseClient(
      { publishableKey, url: supabaseUrl },
      {
        getAll: () => request.cookies.getAll(),
        setAll: (values, cacheHeaders) => {
          for (const cookie of values) {
            request.cookies.set(cookie.name, cookie.value);
          }
          requestHeaders.set("cookie", request.cookies.toString());
          response = NextResponse.next({ request: { headers: requestHeaders } });
          for (const cookie of values) {
            response.cookies.set(cookie.name, cookie.value, cookie.options);
          }
          for (const [name, value] of Object.entries(cacheHeaders)) {
            response.headers.set(name, value);
          }
        },
      },
    );
    try {
      await client.auth.getClaims();
    } catch {
      // The server data-access layer independently verifies identity and fails closed.
    }
  }

  response.headers.set("Content-Security-Policy", policy);
  applyPrivateNoStoreHeaders(response.headers);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
