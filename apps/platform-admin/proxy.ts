import { createContentSecurityPolicy } from "@wlbp/config";
import { createRequestScopedSupabaseClient } from "@wlbp/supabase-client/server";
import { type NextRequest, NextResponse } from "next/server";

function applyPrivateNoStoreHeaders(headers: Headers): void {
  headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  headers.set("CDN-Cache-Control", "no-store");
  headers.set("Expires", "0");
  headers.set("Pragma", "no-cache");
}

export async function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const policy = createContentSecurityPolicy(nonce, {
    connectSources: supabaseUrl ? [supabaseUrl] : [],
    development: process.env.NODE_ENV !== "production",
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  // Server components cannot write cookies, so a rotated refresh token must be
  // persisted here or the next request presents a token that was already used.
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (supabaseUrl && publishableKey) {
    const client = createRequestScopedSupabaseClient(
      { publishableKey, url: supabaseUrl },
      {
        getAll: () => request.cookies.getAll(),
        setAll: (values, cacheHeaders) => {
          for (const cookie of values) request.cookies.set(cookie.name, cookie.value);
          requestHeaders.set("cookie", request.cookies.toString());
          response = NextResponse.next({ request: { headers: requestHeaders } });
          for (const cookie of values)
            response.cookies.set(cookie.name, cookie.value, cookie.options);
          for (const [name, value] of Object.entries(cacheHeaders))
            response.headers.set(name, value);
        },
      },
    );
    try {
      await client.auth.getClaims();
    } catch {
      // The page guard verifies identity again and fails closed.
    }
  }

  response.headers.set("Content-Security-Policy", policy);
  applyPrivateNoStoreHeaders(response.headers);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|fonts/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
