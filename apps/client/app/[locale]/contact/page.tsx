import type { Locale } from "@wlbp/i18n";
import { EmptyState, PageHeader } from "@wlbp/ui-foundation";
import { journeyMessage } from "../../_lib/journey-copy";
import { loadPublishedSiteContent } from "../../_lib/published-site-content";
import { getPublicPageMetadata } from "../../_lib/public-page-metadata";
import { ContactChannels } from "../../_lib/ui/contact-channels";
import { PublicReadError } from "../../_lib/ui/public-read-state";
import { SiteFrame, siteContainerClass } from "../../_lib/ui/site-frame";

type Props = { params: Promise<{ locale: Locale }> };
export async function generateMetadata({ params }: Props) {
  return getPublicPageMetadata((await params).locale, "/contact", "contact");
}
export default async function ContactPage({ params }: Props) {
  const { locale } = await params;
  const published = await loadPublishedSiteContent();
  const contact = published.outcome === "ready" ? published.content.contact : undefined;
  const hasChannels = Boolean(contact?.email || contact?.phone || contact?.whatsapp);
  return (
    <SiteFrame locale={locale} switchPath="/contact">
      <div className={`${siteContainerClass} grid gap-8 py-10 md:py-14`}>
        <PageHeader
          title={journeyMessage(locale, "contact")}
          description={journeyMessage(locale, "contactIntro")}
        />
        {published.outcome === "error" ? (
          <PublicReadError locale={locale} kind="content" />
        ) : hasChannels ? (
          <ContactChannels contact={contact} locale={locale} />
        ) : (
          <EmptyState
            title={journeyMessage(locale, "contactEmptyTitle")}
            description={journeyMessage(locale, "contactEmptyBody")}
          />
        )}
      </div>
    </SiteFrame>
  );
}
