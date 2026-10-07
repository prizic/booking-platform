import type { Locale } from "@wlbp/i18n";

import { loadPublishedCatalog } from "../../_lib/catalog-data-source";
import { availabilityPickerCopy, bookingFlowCopy } from "../../_lib/copy";
import { SiteFrame } from "../../_lib/ui/site-frame";
import { loadWhatsAppAvailability } from "../../_lib/whatsapp-availability";
import { whatsAppConsentContent } from "../../_lib/whatsapp-consent";
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
  const [catalog, whatsAppAvailable] = await Promise.all([
    loadPublishedCatalog(locale),
    loadWhatsAppAvailability(),
  ]);
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
    <SiteFrame locale={locale} switchPath="/book">
      <div className="mx-auto w-full max-w-3xl px-4 py-10 md:px-6 md:py-14">
        <BookingFlow
          copy={{
            availability: availabilityPickerCopy(locale),
            booking: bookingFlowCopy(locale),
          }}
          locale={locale}
          locationId={first?.locationId ?? null}
          locationTimeZone={first?.locationTimeZone ?? "Asia/Riyadh"}
          serviceId={first?.serviceId ?? null}
          // No WhatsApp UI at all unless the tenant offers the channel now.
          whatsApp={whatsAppAvailable ? whatsAppConsentContent(locale) : null}
        />
      </div>
    </SiteFrame>
  );
}
