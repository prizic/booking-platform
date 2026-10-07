import type { Locale } from "@wlbp/i18n";

import { bookingFlowCopy } from "../../_lib/copy";
import { SiteFrame } from "../../_lib/ui/site-frame";
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
    <SiteFrame locale={locale}>
      <div className="mx-auto w-full max-w-3xl px-4 py-10 md:px-6 md:py-14">
        <ProposalResponse
          actionToken={actionToken}
          copy={bookingFlowCopy(locale)}
          locale={locale}
          timeZone="Asia/Riyadh"
        />
      </div>
    </SiteFrame>
  );
}
