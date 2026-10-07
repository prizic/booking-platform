import { NextResponse, type NextRequest } from "next/server";
import { createDashboardAuthClient } from "../../_lib/auth-server";
import { applyPrivateNoStoreHeaders } from "../../_lib/private-response";
import { cookies } from "next/headers";
import {
  issueRecoveryTicket,
  recoveryCookieName,
} from "../../_lib/auth-recovery-ticket";

/** Single-use provider link. Neither the token nor email is a tenant selector. */
export async function GET(request: NextRequest) {
  let accepted = false;
  let needsPassword = false;
  try {
    const token = request.nextUrl.searchParams.get("token_hash");
    const type = request.nextUrl.searchParams.get("type");
    const invitation = request.nextUrl.searchParams.get("invitation");
    const client = await createDashboardAuthClient();
    if (
      client &&
      token &&
      token.length <= 2048 &&
      (type === "invite" || type === "magiclink") &&
      invitation &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(
        invitation,
      )
    ) {
      if (
        type === "invite" &&
        (process.env.DASHBOARD_RECOVERY_COOKIE_SECRET?.length ?? 0) < 32
      )
        throw new Error("unavailable");
      const verified = await client.auth.verifyOtp({ token_hash: token, type });
      if (!verified.error) {
        const api = client.schema("api_v1") as unknown as {
          rpc(
            name: string,
            input: Record<string, unknown>,
          ): PromiseLike<{ error: unknown }>;
        };
        const result = await api.rpc("accept_staff_invitation_v1", {
          p_invitation_id: invitation,
        });
        accepted = !result.error;
        if (accepted && type === "invite") {
          const verifiedClaims = await client.auth.getClaims();
          const claims = verifiedClaims.data?.claims;
          if (
            verifiedClaims.error ||
            !claims ||
            typeof claims.sub !== "string" ||
            typeof claims.session_id !== "string"
          )
            throw new Error("unavailable");
          const now = Math.floor(Date.now() / 1000);
          (await cookies()).set(
            recoveryCookieName,
            issueRecoveryTicket(
              process.env.DASHBOARD_RECOVERY_COOKIE_SECRET ?? "",
              claims.sub,
              claims.session_id,
              now,
            ),
            {
              httpOnly: true,
              secure: request.nextUrl.protocol === "https:",
              sameSite: "lax",
              path: "/",
              maxAge: 900,
            },
          );
          needsPassword = true;
        }
      }
    }
  } catch {
    accepted = false; /* Never log callback material or provider bodies. */
  }
  const locale = request.nextUrl.searchParams.get("locale") === "ar" ? "ar" : "en";
  const response = NextResponse.redirect(
    new URL(
      accepted
        ? needsPassword
          ? `/${locale}/auth/update-password`
          : `/${locale}/today`
        : `/${locale}/auth/sign-in?error=invitation`,
      request.url,
    ),
    303,
  );
  applyPrivateNoStoreHeaders(response.headers);
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
