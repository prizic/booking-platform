import type { PublicCatalogItemV1 } from "@wlbp/api-contracts";
import { formatCurrency, formatNumber, type Locale } from "@wlbp/i18n";
import { Button, StatusStamp } from "@wlbp/ui-foundation";
import { ArrowRight, MapPin, Timer } from "lucide-react";
import Link from "next/link";
import { journeyMessage } from "../journey-copy";
import { ServiceDye } from "./service-dye";

export function ServiceList({
  items,
  locale,
  headingLevel = 3,
}: {
  readonly headingLevel?: 2 | 3;
  readonly items: readonly PublicCatalogItemV1[];
  readonly locale: Locale;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <ul
      aria-label={journeyMessage(locale, "services")}
      className="divide-y rounded-lg border bg-card"
    >
      {items.map((item) => {
        const href = `/${locale}/book?service=${item.serviceId}&location=${item.locationId}`;
        const headingId = `service-${item.serviceId}-${item.locationId}`;
        return (
          <li
            key={headingId}
            className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between md:px-6"
          >
            <div className="grid min-w-0 gap-2">
              <Heading
                id={headingId}
                className="flex items-center gap-2.5 text-base font-semibold text-balance"
              >
                <ServiceDye serviceKey={item.serviceName} />
                <Link
                  href={href}
                  className="rounded-sm outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {item.serviceName}
                </Link>
              </Heading>
              {item.serviceDescription.trim() ? (
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  {item.serviceDescription}
                </p>
              ) : null}
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
                <span>
                  <span className="sr-only">{journeyMessage(locale, "price")} </span>
                  {formatCurrency(item.price.minorUnits, item.price.currency, locale)}
                </span>
              </p>
              {item.approvalRequired ? (
                <StatusStamp state="requested">
                  {journeyMessage(locale, "approval")}
                </StatusStamp>
              ) : null}
            </div>
            <Button asChild variant="secondary" className="self-start sm:self-center">
              <Link href={href} aria-describedby={headingId}>
                {journeyMessage(locale, "book")}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
