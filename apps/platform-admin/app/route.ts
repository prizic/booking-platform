import { NextResponse, type NextRequest } from "next/server";
import { negotiateLocale } from "./_lib/negotiate-locale";

function redirectToDefaultLocale(request: NextRequest) {
  const locale = negotiateLocale(request.headers.get("accept-language"));
  return NextResponse.redirect(new URL(`/${locale}`, request.url), 308);
}

export const GET = redirectToDefaultLocale;
export const HEAD = redirectToDefaultLocale;
