import type { Locale } from "@wlbp/i18n";
import { PageHeader } from "@wlbp/ui-foundation";
import { journeyMessage } from "../../_lib/journey-copy";
import { getPublicPageMetadata } from "../../_lib/public-page-metadata";
import { SiteFrame, siteContainerClass } from "../../_lib/ui/site-frame";
import { RecoveryForm } from "./recovery-form";

type Props = { params: Promise<{ locale: Locale }> };
export async function generateMetadata({ params }: Props) {
  return {
    ...(await getPublicPageMetadata(
      (await params).locale,
      "/find-booking",
      "findBooking",
    )),
    robots: { index: false, follow: false },
    referrer: "no-referrer" as const,
  };
}
export default async function FindBookingPage({ params }: Props) {
  const { locale } = await params;
  return (
    <SiteFrame locale={locale} switchPath="/find-booking">
      <div className={`${siteContainerClass} grid gap-8 py-10 md:py-14`}>
        <PageHeader
          title={journeyMessage(locale, "findBooking")}
          description={journeyMessage(locale, "recoveryIntro")}
        />
        <RecoveryForm locale={locale} />
      </div>
    </SiteFrame>
  );
}
