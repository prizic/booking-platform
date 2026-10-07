import { isLocale } from "@wlbp/i18n";
import { LOCALE_COOKIE } from "@wlbp/ui-foundation/preferences";
import { NextResponse, type NextRequest } from "next/server";
import { instanceLocalePolicy } from "./_lib/locale-policy";

/** `/` opens in the visitor's remembered language, otherwise the instance default. */
function redirectToDefaultLocale(request: NextRequest) {
  const remembered = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale =
    isLocale(remembered) && instanceLocalePolicy.supportedLocales.includes(remembered)
      ? remembered
      : instanceLocalePolicy.defaultLocale;
  return NextResponse.redirect(new URL(`/${locale}`, request.url), 307);
}

export const GET = redirectToDefaultLocale;
export const HEAD = redirectToDefaultLocale;
