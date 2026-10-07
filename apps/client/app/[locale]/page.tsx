import { formatNumber, type Locale } from "@wlbp/i18n";
import { Button, EmptyState, Section } from "@wlbp/ui-foundation";
import { ArrowRight, CalendarDays, MapPin, Timer } from "lucide-react";
import Link from "next/link";

import { availabilityPickerCopy, getClientMessage } from "../_lib/copy";
import { loadPublishedCatalog } from "../_lib/catalog-data-source";
import { instanceText } from "../_lib/instance-text";
import { ServiceDye } from "../_lib/ui/service-dye";
import { SiteFrame, siteContainerClass } from "../_lib/ui/site-frame";
import { AvailabilityPicker } from "./availability-picker";

type ClientPageProps = {
  params: Promise<{ locale: Locale }>;
};

export default async function ClientPage({ params }: ClientPageProps) {
  const { locale } = await params;
  const message = (key: Parameters<typeof getClientMessage>[1]) =>
    getClientMessage(locale, key);
  const text = instanceText(locale);
  const timeZone = "Asia/Riyadh";
  const catalog = await loadPublishedCatalog(locale);

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
                <Link href={`/${locale}#services`}>
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
          {catalog.length === 0 ? (
            <EmptyState
              icon={<CalendarDays aria-hidden="true" />}
              title={message("catalogEmptyTitle")}
              description={message("catalogEmptyBody")}
            />
          ) : (
            <ul className="divide-y rounded-lg border bg-card">
              {catalog.map((item) => (
                <li
                  key={`${item.serviceId}:${item.locationId}`}
                  className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between md:px-6"
                >
                  <div className="grid min-w-0 gap-1.5">
                    <h3
                      id={`service-${item.serviceId}-${item.locationId}`}
                      className="flex items-center gap-2.5 text-base font-semibold text-balance"
                    >
                      <ServiceDye serviceKey={item.serviceName} />
                      {item.serviceName}
                    </h3>
                    {item.serviceDescription.trim() === "" ? null : (
                      <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                        {item.serviceDescription}
                      </p>
                    )}
                    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin aria-hidden="true" className="size-4" />
                        {item.locationName}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Timer aria-hidden="true" className="size-4" />
                        {formatNumber(item.durationMinutes, locale, {
                          style: "unit",
                          unit: "minute",
                          unitDisplay: "long",
                        })}
                      </span>
                    </p>
                  </div>
                  <Button
                    asChild
                    variant="secondary"
                    className="self-start sm:self-center"
                  >
                    <Link
                      aria-describedby={`service-${item.serviceId}-${item.locationId}`}
                      href={`/${locale}/book?service=${item.serviceId}&location=${item.locationId}`}
                    >
                      {text("home.services.bookAction")}
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <div id="availability" className="scroll-mt-6">
          <AvailabilityPicker
            copy={{
              ...availabilityPickerCopy(locale),
              summary: text("home.availability.intro"),
              title: text("home.availability.title"),
            }}
            locale={locale}
            locationId={catalog[0]?.locationId ?? null}
            locationTimeZone={catalog[0]?.locationTimeZone ?? timeZone}
            serviceId={catalog[0]?.serviceId ?? null}
          />
        </div>

        <Section id="manage" title={text("home.manage.title")} className="scroll-mt-6">
          <p className="max-w-2xl text-[0.9375rem] leading-relaxed text-muted-foreground">
            {text("home.manage.body")}
          </p>
        </Section>
      </div>
    </SiteFrame>
  );
}
