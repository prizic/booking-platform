import type { Locale } from "@wlbp/i18n";
import { BrandShell } from "@wlbp/white-label-ui";
import Image from "next/image";
import Link from "next/link";

import { clientBrand } from "../../_lib/brand";
import { loadPublishedCatalog } from "../../_lib/catalog-data-source";
import { availabilityPickerCopy, bookingFlowCopy } from "../../_lib/copy";
import { getClientMessage } from "../../_lib/copy";
import { BookingFlow } from "./booking-flow";

type BookingPageProps = {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function identifier(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(candidate)
    ? candidate
    : null;
}

export default async function BookingPage({ params, searchParams }: BookingPageProps) {
  const { locale } = await params;
  const query = await searchParams;
  const catalog = await loadPublishedCatalog(locale);
  // A service page links straight into its own booking journey. The requested
  // pair is only a hint: the database re-reads the published catalog, so an
  // unpublished or cross-tenant pair simply fails there.
  const requestedService = identifier(query.service);
  const requestedLocation = identifier(query.location);
  const first =
    catalog.find(
      (item) =>
        item.serviceId === requestedService && item.locationId === requestedLocation,
    ) ??
    (requestedService !== null && requestedLocation !== null
      ? {
          locationId: requestedLocation,
          locationTimeZone: catalog[0]?.locationTimeZone ?? "Asia/Riyadh",
          serviceId: requestedService,
        }
      : (catalog[0] ?? null));

  return (
    <BrandShell
      className="client-shell"
      labelledBy="booking-title"
      tokens={clientBrand.tokens}
    >
      <header className="client-header">
        <Link className="wordmark" href={`/${locale}`} aria-label={clientBrand.name}>
          <Image
            alt=""
            aria-hidden="true"
            height={40}
            src={clientBrand.assets.icon}
            width={40}
          />
          <span>{clientBrand.name}</span>
        </Link>
        <nav aria-label={getClientMessage(locale, "languageNavigation")}>
          <Link aria-current={locale === "en" ? "page" : undefined} href="/en/book">
            <span aria-hidden="true">EN</span>
            <span className="sr-only">
              {getClientMessage(locale, "languageEnglish")}
            </span>
          </Link>
          <Link aria-current={locale === "ar" ? "page" : undefined} href="/ar/book">
            <span aria-hidden="true">عربي</span>
            <span className="sr-only">
              {getClientMessage(locale, "languageArabic")}
            </span>
          </Link>
        </nav>
      </header>

      <div className="client-main">
        <BookingFlow
          copy={{
            availability: availabilityPickerCopy(locale),
            booking: bookingFlowCopy(locale),
          }}
          locale={locale}
          locationId={first?.locationId ?? null}
          locationTimeZone={first?.locationTimeZone ?? "Asia/Riyadh"}
          serviceId={first?.serviceId ?? null}
        />
      </div>
    </BrandShell>
  );
}
