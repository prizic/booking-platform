import type { Locale } from "@wlbp/i18n";
import { Button, Section } from "@wlbp/ui-foundation";
import { CalendarDays } from "lucide-react";
import Link from "next/link";

import { availabilityPickerCopy } from "../_lib/copy";
import { loadPublishedCatalog } from "../_lib/catalog-data-source";
import { instanceText } from "../_lib/instance-text";
import { CatalogEmpty, PublicReadError } from "../_lib/ui/public-read-state";
import { ServiceList } from "../_lib/ui/service-list";
import { journeyMessage } from "../_lib/journey-copy";
import { SiteFrame, siteContainerClass } from "../_lib/ui/site-frame";
import { AvailabilityPicker } from "./availability-picker";

type ClientPageProps = {
  params: Promise<{ locale: Locale }>;
};

export default async function ClientPage({ params }: ClientPageProps) {
  const { locale } = await params;
  const text = instanceText(locale);
  const timeZone = "Asia/Riyadh";
  const catalog = await loadPublishedCatalog(locale);
  const first = catalog.outcome === "ready" ? catalog.items[0] : undefined;

  return (
    <SiteFrame locale={locale}>
      {/* First viewport: what the business offers and the way to book it.
          The headline holds the leading column; the summary and the two
          actions sit against its last line on the trailing side. */}
      <section aria-labelledby="client-title" className="border-b bg-card">
        <div
          className={`${siteContainerClass} grid gap-8 py-14 md:py-20 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-end lg:gap-16`}
        >
          {/* `client-intro` and `client-hero-actions` are layout hooks for the
              direction-aware composition test; they carry no styles. */}
          <h1
            id="client-title"
            className="client-intro text-4xl leading-tight font-bold tracking-tight text-balance md:text-5xl md:leading-[1.12] lg:text-6xl lg:leading-[1.08]"
          >
            {text("home.hero.title")}
          </h1>
          <div className="client-hero-actions grid content-end gap-6">
            <p className="max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground">
              {text("home.hero.summary")}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link href={`/${locale}/book`}>
                  <CalendarDays aria-hidden="true" />
                  {text("home.hero.primaryAction")}
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href={`/${locale}/services`}>
                  {text("home.hero.secondaryAction")}
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <div className={`${siteContainerClass} grid gap-16 pt-12 md:pt-16`}>
        <Section
          id="services"
          title={text("home.services.title")}
          description={text("home.services.intro")}
          className="scroll-mt-6"
        >
          {catalog.outcome === "error" ? (
            <PublicReadError locale={locale} kind="catalog" />
          ) : catalog.outcome === "empty" ? (
            <CatalogEmpty locale={locale} />
          ) : (
            <ServiceList items={catalog.items} locale={locale} />
          )}
        </Section>

        {first ? (
          <div id="availability" className="scroll-mt-6">
            <AvailabilityPicker
              copy={{
                ...availabilityPickerCopy(locale),
                summary: text("home.availability.intro"),
                title: text("home.availability.title"),
              }}
              locale={locale}
              locationId={first.locationId}
              locationTimeZone={first.locationTimeZone ?? timeZone}
              serviceId={first.serviceId}
            />
          </div>
        ) : null}

        <Section id="manage" title={text("home.manage.title")} className="scroll-mt-6">
          <p className="max-w-2xl text-[0.9375rem] leading-relaxed text-muted-foreground">
            {text("home.manage.body")}
          </p>
          <div>
            <Button asChild variant="outline">
              <Link href={`/${locale}/find-booking`}>
                {journeyMessage(locale, "findBooking")}
              </Link>
            </Button>
          </div>
        </Section>
      </div>
    </SiteFrame>
  );
}
