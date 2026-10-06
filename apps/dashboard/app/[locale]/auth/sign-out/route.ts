import { isLocale } from "@wlbp/i18n";
import { NextResponse, type NextRequest } from "next/server";
import { createDashboardAuthClient } from "../../../_lib/auth-server";
import { applyPrivateNoStoreHeaders } from "../../../_lib/private-response";
import { cookies } from "next/headers";
import { recoveryCookieName } from "../../../_lib/auth-recovery-ticket";
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ locale: string }> },
) {
  const { locale } = await context.params;
  if (!isLocale(locale)) return new NextResponse(null, { status: 404 });
  if (request.headers.get("origin") !== request.nextUrl.origin)
    return new NextResponse(null, { status: 403 });
  const client = await createDashboardAuthClient();
  if (client) {
    const { error } = await client.auth.signOut();
    if (error) return new NextResponse(null, { status: 503 });
  }
  (await cookies()).delete(recoveryCookieName);
  const response = NextResponse.redirect(
    new URL(`/${locale}/auth/sign-in`, request.url),
    303,
  );
  applyPrivateNoStoreHeaders(response.headers);
  return response;
}
