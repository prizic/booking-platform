import type { Locale } from "@wlbp/i18n";
import { ReferenceCode, StatusStamp } from "@wlbp/ui-foundation";
import Link from "next/link";
import type { ReactNode } from "react";
import type { TodayItemV1 } from "../dashboard-access";
import { formatTimeRange, stampStateFor } from "../booking-display";
import { workspaceStatus } from "../workspace-status";
import { ServiceDye } from "./service-dye";
import { textLinkClass } from "./text-link";

/**
 * The ordered agenda of bookings: time, service, customer, status in words,
 * reference and a link. It is the accessible alternative to the woven bands
 * and the whole schedule on phones.
 */
export function BookingAgenda({
  items,
  locale,
  label,
  displayTimeZone,
  customerHidden,
  openLabel,
  extra,
}: {
  readonly items: readonly TodayItemV1[];
  readonly locale: Locale;
  readonly label: string;
  /** Times in another zone than this one are followed by their zone. */
  readonly displayTimeZone: string;
  readonly customerHidden: string;
  readonly openLabel: string;
  readonly extra?: (item: TodayItemV1) => ReactNode;
}) {
  return (
    <ol aria-label={label} className="divide-y rounded-lg border bg-card">
      {items.map((item) => (
        <li
          key={item.bookingId}
          className="grid gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-center"
        >
          <p className="grid text-sm font-semibold [font-variant-numeric:tabular-nums]">
            <time dateTime={item.startAt}>
              {formatTimeRange(item.startAt, item.endAt, locale, item.locationTimeZone)}
            </time>
            {item.locationTimeZone === displayTimeZone ? null : (
              <bdi className="text-xs font-normal text-muted-foreground">
                {item.locationTimeZone}
              </bdi>
            )}
          </p>
          <div className="grid min-w-0 gap-0.5">
            <p className="font-semibold text-foreground">
              <ServiceDye name={item.serviceName} />
            </p>
            <p className="text-sm break-words text-muted-foreground">
              <bdi>{item.customerDisplayName ?? customerHidden}</bdi>
              <span aria-hidden="true"> · </span>
              <bdi>{item.locationName}</bdi>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <StatusStamp state={stampStateFor(item.status)}>
              {workspaceStatus(locale, item.status)}
            </StatusStamp>
            <ReferenceCode>{item.publicReference}</ReferenceCode>
            {extra?.(item)}
            <Link
              className={textLinkClass}
              href={`/${locale}/bookings/${item.bookingId}`}
            >
              {openLabel}
              <span className="sr-only">
                {" "}
                <bdi>{item.publicReference}</bdi>
              </span>
            </Link>
          </div>
        </li>
      ))}
    </ol>
  );
}
