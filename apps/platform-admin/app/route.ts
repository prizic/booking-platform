import { isLocale } from "@wlbp/i18n";
import { LOCALE_COOKIE } from "@wlbp/ui-foundation/preferences";
import { NextResponse, type NextRequest } from "next/server";

const defaultLocale = "ar";

/** `/` opens in the operator's remembered language, otherwise Arabic. */
function redirectToDefaultLocale(request: NextRequest) {
  const remembered = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(remembered) ? remembered : defaultLocale;
  return NextResponse.redirect(new URL(`/${locale}`, request.url), 307);
}

export const GET = redirectToDefaultLocale;
export const HEAD = redirectToDefaultLocale;
