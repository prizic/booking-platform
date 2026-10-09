import type { Locale } from "@wlbp/i18n";

import { bookingFlowCopy } from "../../_lib/copy";
import { SiteFrame } from "../../_lib/ui/site-frame";
import { ManageBooking } from "./manage-booking";
import { manageIntentFromParam } from "./manage-schema";

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
  // Each token authorizes exactly one intent (ADR-0004 decision 6), so the page
  // redeems the link with the intent it was minted for rather than always
  // asking to view. The database still checks it against the stored intent.
  const intent = manageIntentFromParam(query.intent);
  // Display-only: a link that arrived from the view-link exchange already has
  // a code queued at issuance, so the step-up card says to check the inbox
  // instead of implying nothing was sent. It grants nothing.
  const issued = Array.isArray(query.issued) ? query.issued[0] : query.issued;

  return (
    <SiteFrame locale={locale}>
      <div className="mx-auto w-full max-w-3xl px-4 py-10 md:px-6 md:py-14">
        {/* The token is read on the client and posted in a request body; it is
            never rendered into a link, a form action, or a redirect. */}
        <ManageBooking
          copy={bookingFlowCopy(locale)}
          intent={intent}
          justIssued={issued === "1"}
          locale={locale}
          token={token}
        />
      </div>
    </SiteFrame>
  );
}
