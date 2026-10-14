import type { Locale } from "@wlbp/i18n";
import { PageHeader } from "@wlbp/ui-foundation";
import { loadPublishedCatalog } from "../../_lib/catalog-data-source";
import { journeyMessage } from "../../_lib/journey-copy";
import { getPublicPageMetadata } from "../../_lib/public-page-metadata";
import { CatalogEmpty, PublicReadError } from "../../_lib/ui/public-read-state";
import { SiteFrame, siteContainerClass } from "../../_lib/ui/site-frame";
import { ServiceDiscovery } from "./service-discovery";

type Props = { params: Promise<{ locale: Locale }> };
export async function generateMetadata({ params }: Props) {
  return getPublicPageMetadata((await params).locale, "/services", "services");
}
export default async function ServicesPage({ params }: Props) {
  const { locale } = await params;
  const catalog = await loadPublishedCatalog(locale);
  return (
    <SiteFrame locale={locale} switchPath="/services">
      <div className={`${siteContainerClass} grid gap-8 py-10 md:py-14`}>
        <PageHeader
          title={journeyMessage(locale, "services")}
          description={journeyMessage(locale, "servicesIntro")}
        />
        {catalog.outcome === "error" ? (
          <PublicReadError locale={locale} kind="catalog" />
        ) : catalog.outcome === "empty" ? (
          <CatalogEmpty locale={locale} />
        ) : (
          <ServiceDiscovery items={catalog.items} locale={locale} />
        )}
      </div>
    </SiteFrame>
  );
}
