import { formatNumber, type Locale } from "@wlbp/i18n";
import { Badge, Surface } from "@wlbp/ui-foundation";
import Link from "next/link";
import { getAdminMessage } from "../_lib/copy";

type AdminPageProps = {
  params: Promise<{ locale: Locale }>;
};

export default async function PlatformAdminPage({ params }: AdminPageProps) {
  const { locale } = await params;
  const message = (key: Parameters<typeof getAdminMessage>[1]) =>
    getAdminMessage(locale, key);

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <Link
          className="admin-brand"
          href={`/${locale}`}
          aria-label={message("brandLabel")}
        >
          <span aria-hidden="true">A</span>
          <div>
            <strong>Atlas</strong>
            <small>{message("platformOperations")}</small>
          </div>
        </Link>
        <div className="admin-header-actions">
          <Badge tone="warning">{message("privateStatus")}</Badge>
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
        </div>
      </header>

      <section className="admin-intro" aria-labelledby="admin-title">
        <p>{message("eyebrow")}</p>
        <h1 id="admin-title">{message("title")}</h1>
        <span>{message("summary")}</span>
      </section>

      <Surface as="section" className="fleet-panel" labelledBy="fleet-title">
        <div className="fleet-panel-heading">
          <div>
            <p>{message("controlCode")}</p>
            <h2 id="fleet-title">{message("fleetTitle")}</h2>
          </div>
          <span className="system-pulse">
            <span aria-hidden="true" />
            {message("systemReady")}
          </span>
        </div>

        <div className="fleet-grid">
          <article>
            <span aria-hidden="true">01</span>
            <h3>{message("tenantRegistry")}</h3>
            <strong>—</strong>
            <small>{message("activeInstances")}</small>
          </article>
          <article>
            <span aria-hidden="true">02</span>
            <h3>{message("releaseChannels")}</h3>
            <strong>{formatNumber(0, locale)}</strong>
            <small>{message("pendingJobs")}</small>
          </article>
          <article>
            <span aria-hidden="true">03</span>
            <h3>{message("platformHealth")}</h3>
            <strong>{message("healthReady")}</strong>
            <small>{message("privateStatus")}</small>
          </article>
        </div>

        <p className="operator-notice">{message("operatorNotice")}</p>
      </Surface>
    </main>
  );
}
