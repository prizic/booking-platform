import type { Locale } from "@wlbp/i18n";
import { BrandShell } from "@wlbp/white-label-ui";
import Link from "next/link";

import { clientBrand } from "../../_lib/brand";
import { bookingFlowCopy, getClientMessage } from "../../_lib/copy";
import { ManageBooking } from "./manage-booking";

type ManagePageProps = {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

// The manage surface is never indexed and never leaks its URL to a third party
// (ADR-0004 decision 13).
export const metadata = { robots: { follow: false, index: false } };

export default async function ManagePage({ params, searchParams }: ManagePageProps) {
  const { locale } = await params;
  const query = await searchParams;
  const candidate = Array.isArray(query.token) ? query.token[0] : query.token;
  const token =
    typeof candidate === "string" && /^[a-f0-9]{64}$/u.test(candidate)
      ? candidate
      : null;

  return (
    <BrandShell
      className="client-shell"
      labelledBy="manage-title"
      tokens={clientBrand.tokens}
    >
      <header className="client-header">
        <Link className="wordmark" href={`/${locale}`} aria-label={clientBrand.name}>
          <span>{clientBrand.name}</span>
        </Link>
        <nav aria-label={getClientMessage(locale, "languageNavigation")}>
          <Link aria-current={locale === "en" ? "page" : undefined} href="/en">
            <span aria-hidden="true">EN</span>
            <span className="sr-only">
              {getClientMessage(locale, "languageEnglish")}
            </span>
          </Link>
          <Link aria-current={locale === "ar" ? "page" : undefined} href="/ar">
            <span aria-hidden="true">عربي</span>
            <span className="sr-only">
              {getClientMessage(locale, "languageArabic")}
            </span>
          </Link>
        </nav>
      </header>
      <div className="client-main">
        {/* The token is read on the client and posted in a request body; it is
            never rendered into a link, a form action, or a redirect. */}
        <ManageBooking copy={bookingFlowCopy(locale)} locale={locale} token={token} />
      </div>
    </BrandShell>
  );
}
