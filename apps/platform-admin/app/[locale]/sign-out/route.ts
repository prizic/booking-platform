import { isLocale } from "@wlbp/i18n";
import { NextResponse, type NextRequest } from "next/server";
import { isSameOriginPost, publicRequestOrigin } from "../../_lib/request-origin";
import { createPlatformAdminRequestClient } from "../../_lib/platform-admin-server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  const target = isLocale(locale) ? locale : "en";
  // Same-origin only: a cross-site form must not be able to end a session.
  if (!isSameOriginPost(request.url, request.headers)) {
    return new NextResponse(null, { status: 403 });
  }
  const client = await createPlatformAdminRequestClient();
  await client?.auth.signOut();
  return NextResponse.redirect(
    new URL(`/${target}/login`, publicRequestOrigin(request.url, request.headers)),
    303,
  );
}
