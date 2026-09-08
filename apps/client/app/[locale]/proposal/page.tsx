import type { Locale } from "@wlbp/i18n";
import { BrandShell } from "@wlbp/white-label-ui";
import Link from "next/link";

import { clientBrand } from "../../_lib/brand";
import { bookingFlowCopy, getClientMessage } from "../../_lib/copy";
import { ProposalResponse } from "./proposal-response";

type ProposalPageProps = {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function ProposalPage({
  params,
  searchParams,
}: ProposalPageProps) {
  const { locale } = await params;
  const query = await searchParams;
  const candidate = Array.isArray(query.token) ? query.token[0] : query.token;
  // The token authorizes exactly one proposal decision in the database; the page
  // only checks that it is shaped like one before offering the choice.
  const actionToken =
    typeof candidate === "string" && /^[a-f0-9]{64}$/u.test(candidate)
      ? candidate
      : null;

  return (
    <BrandShell
      className="client-shell"
      labelledBy="proposal-title"
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
        <ProposalResponse
          actionToken={actionToken}
          copy={bookingFlowCopy(locale)}
          locale={locale}
          timeZone="Asia/Riyadh"
        />
      </div>
    </BrandShell>
  );
}
