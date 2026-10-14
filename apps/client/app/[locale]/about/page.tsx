import type { Locale } from "@wlbp/i18n";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  Section,
} from "@wlbp/ui-foundation";
import { MapPin, Phone } from "lucide-react";
import { journeyMessage } from "../../_lib/journey-copy";
import { loadPublishedSiteContent } from "../../_lib/published-site-content";
import { publicChannelLinks } from "../../_lib/public-channel-links";
import { getPublicPageMetadata } from "../../_lib/public-page-metadata";
import { PublicReadError } from "../../_lib/ui/public-read-state";
import { SiteFrame, siteContainerClass } from "../../_lib/ui/site-frame";

type Props = { params: Promise<{ locale: Locale }> };
export async function generateMetadata({ params }: Props) {
  return getPublicPageMetadata((await params).locale, "/about", "about");
}
export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  const published = await loadPublishedSiteContent();
  const content = published.outcome === "ready" ? published.content : undefined;
  const about = content?.about;
  const phone = publicChannelLinks(content?.contact).phone;
  const hasAbout = Boolean(
    about?.experience || about?.whyChooseUs || about?.address || about?.mapUrl,
  );
  return (
    <SiteFrame locale={locale} switchPath="/about">
      <div className={`${siteContainerClass} grid gap-8 py-10 md:py-14`}>
        <PageHeader
          title={journeyMessage(locale, "about")}
          description={journeyMessage(locale, "aboutIntro")}
          actions={
            phone ? (
              <Button asChild variant="outline">
                <a href={phone} rel="noreferrer">
                  <Phone aria-hidden="true" />
                  {journeyMessage(locale, "call")}
                </a>
              </Button>
            ) : undefined
          }
        />
        {published.outcome === "error" ? (
          <PublicReadError locale={locale} kind="content" />
        ) : (
          <>
            {!hasAbout ? (
              <EmptyState
                title={journeyMessage(locale, "aboutEmptyTitle")}
                description={journeyMessage(locale, "aboutEmptyBody")}
              />
            ) : null}
            {about?.experience ? (
              <Section id="experience" title={journeyMessage(locale, "experience")}>
                <p className="max-w-3xl whitespace-pre-line leading-relaxed text-muted-foreground">
                  {about.experience[locale]}
                </p>
              </Section>
            ) : null}
            {about?.whyChooseUs ? (
              <Section id="why-choose-us" title={journeyMessage(locale, "whyChooseUs")}>
                <p className="max-w-3xl whitespace-pre-line leading-relaxed text-muted-foreground">
                  {about.whyChooseUs[locale]}
                </p>
              </Section>
            ) : null}
            {about?.address || about?.mapUrl ? (
              <Section id="visit" title={journeyMessage(locale, "address")}>
                {about.address ? (
                  <address className="max-w-3xl whitespace-pre-line leading-relaxed text-muted-foreground not-italic">
                    {about.address[locale]}
                  </address>
                ) : null}
                {about.mapUrl ? (
                  <Card className="max-w-2xl">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <MapPin className="size-6" aria-hidden="true" />
                        {journeyMessage(locale, "map")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                      <p className="text-sm text-muted-foreground">
                        {journeyMessage(locale, "mapHint")}
                      </p>
                      <Button asChild className="justify-self-start">
                        <a href={about.mapUrl} rel="noreferrer">
                          {journeyMessage(locale, "directions")}
                        </a>
                      </Button>
                    </CardContent>
                  </Card>
                ) : null}
              </Section>
            ) : null}
          </>
        )}
      </div>
    </SiteFrame>
  );
}
