import { formatCurrency, formatDateTime, type Locale } from "@wlbp/i18n";
import { Badge, LinkButton } from "@wlbp/ui-foundation";
import { BrandShell } from "@wlbp/white-label-ui";
import Image from "next/image";
import Link from "next/link";
import { availabilityPickerCopy, getClientMessage } from "../_lib/copy";
import { clientBrand } from "../_lib/brand";
import { BookingPreview } from "./booking-preview";
import { loadPublishedCatalog } from "../_lib/catalog-data-source";
import { AvailabilityPicker } from "./availability-picker";

type ClientPageProps = {
  params: Promise<{ locale: Locale }>;
};

export default async function ClientPage({ params }: ClientPageProps) {
  const { locale } = await params;
  const message = (key: Parameters<typeof getClientMessage>[1]) =>
    getClientMessage(locale, key);
  const timeZone = "Asia/Riyadh";
  const catalog = await loadPublishedCatalog(locale);

  return (
    <BrandShell
      className="client-shell"
      labelledBy="client-title"
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
        <nav aria-label={message("languageNavigation")}>
          <Link aria-current={locale === "en" ? "page" : undefined} href="/en">
            <span aria-hidden="true">EN</span>
            <span className="sr-only">{message("languageEnglish")}</span>
          </Link>
          <Link aria-current={locale === "ar" ? "page" : undefined} href="/ar">
            <span aria-hidden="true">عربي</span>
            <span className="sr-only">{message("languageArabic")}</span>
          </Link>
        </nav>
      </header>

      <div className="client-main">
        <section className="client-intro" aria-labelledby="client-title">
          <Badge>{message("eyebrow")}</Badge>
          <h1 id="client-title">{message("title")}</h1>
          <p className="client-summary">{message("summary")}</p>
          <div className="client-actions">
            <LinkButton href={`/${locale}#journey`}>
              {message("primaryAction")}
            </LinkButton>
            <Link className="secondary-link" href={`/${locale}#status`}>
              {message("secondaryAction")}
            </Link>
          </div>
        </section>

        <BookingPreview
          copy={{
            appointmentLabel: message("appointmentLabel"),
            customerNameDescription: message("customerNameDescription"),
            customerNameLabel: message("customerNameLabel"),
            errorSummaryTitle: message("errorSummaryTitle"),
            nameRequired: message("nameRequired"),
            previewLabel: message("previewLabel"),
            priceLabel: message("priceLabel"),
            status: message("status"),
            submitAction: message("submitAction"),
            successMessage: message("successMessage"),
            timezoneLabel: message("timezoneLabel"),
          }}
          formattedDateTime={formatDateTime(
            "2026-09-08T15:30:00.000Z",
            locale,
            timeZone,
          )}
          formattedPrice={formatCurrency(18_000, "SAR", locale)}
          timeZone={timeZone}
        />
        <AvailabilityPicker
          copy={availabilityPickerCopy(locale)}
          locale={locale}
          locationId={catalog[0]?.locationId ?? null}
          locationTimeZone={catalog[0]?.locationTimeZone ?? timeZone}
          serviceId={catalog[0]?.serviceId ?? null}
        />
        <section aria-labelledby="catalog-title" className="catalog-section">
          <h2 id="catalog-title">
            {locale === "ar" ? "الخدمات المتاحة" : "Available services"}
          </h2>
          {catalog.length === 0 ? (
            <p>
              {locale === "ar"
                ? "لا توجد خدمات منشورة حاليًا."
                : "No published services are available yet."}
            </p>
          ) : (
            <ul>
              {catalog.map((item) => (
                <li key={`${item.serviceId}:${item.locationId}`}>
                  <Link href={`/${locale}${item.canonicalPath}`}>
                    <strong>{item.serviceName}</strong>
                  </Link>
                  <p>{item.serviceDescription}</p>
                  <small>
                    {item.locationName} · {item.durationMinutes}{" "}
                    {locale === "ar" ? "دقيقة" : "minutes"}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </BrandShell>
  );
}
