import { NextResponse, type NextRequest } from "next/server";
import { createDashboardAuthClient } from "../../_lib/auth-server";
import { applyPrivateNoStoreHeaders } from "../../_lib/private-response";
import { cookies } from "next/headers";
import {
  issueRecoveryTicket,
  recoveryCookieName,
  recoveryLifetimeSeconds,
} from "../../_lib/auth-recovery-ticket";
export async function GET(request: NextRequest) {
  const locale = request.nextUrl.searchParams.get("locale") === "ar" ? "ar" : "en";
  let recovered = false;
  const store = await cookies();
  store.delete(recoveryCookieName);
  try {
    const client = await createDashboardAuthClient();
    const code = request.nextUrl.searchParams.get("code");
    const flowId = request.nextUrl.searchParams.get("sb_flow_id");
    const secret = process.env.DASHBOARD_RECOVERY_COOKIE_SECRET;
    if (
      client &&
      secret &&
      secret.length >= 32 &&
      code &&
      code.length <= 2048 &&
      (!flowId || /^[A-Za-z0-9_-]{1,128}$/u.test(flowId))
    ) {
      const { data, error } = await client.auth.exchangeCodeForSession(
        code,
        flowId ? { flowId } : undefined,
      );
      recovered = !error && "redirectType" in data && data.redirectType === "recovery";
      if (recovered) {
        const verified = await client.auth.getClaims();
        const claims = verified.data?.claims;
        if (verified.error || !claims || typeof claims.session_id !== "string")
          recovered = false;
        else
          store.set(
            recoveryCookieName,
            issueRecoveryTicket(
              secret,
              claims.sub,
              claims.session_id,
              Math.floor(Date.now() / 1000),
            ),
            {
              httpOnly: true,
              secure: request.nextUrl.protocol === "https:",
              sameSite: "lax",
              path: "/",
              maxAge: recoveryLifetimeSeconds,
            },
          );
      }
    }
  } catch {
    /* Callback material is never logged or returned. */
  }
  const response = NextResponse.redirect(
    new URL(
      `/${locale}/auth/${recovered ? "update-password" : "recover?error=expired"}`,
      request.url,
    ),
    303,
  );
  applyPrivateNoStoreHeaders(response.headers);
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
