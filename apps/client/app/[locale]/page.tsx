import type { Locale } from "@wlbp/i18n";
import { Badge, LinkButton, Surface } from "@wlbp/ui-foundation";
import { BrandShell } from "@wlbp/white-label-ui";
import Link from "next/link";
import { getClientMessage } from "../_lib/copy";

type ClientPageProps = {
  params: Promise<{ locale: Locale }>;
};

export default async function ClientPage({ params }: ClientPageProps) {
  const { locale } = await params;
  const message = (key: Parameters<typeof getClientMessage>[1]) =>
    getClientMessage(locale, key);

  return (
    <BrandShell className="client-shell" labelledBy="client-title">
      <header className="client-header">
        <Link className="wordmark" href={`/${locale}`} aria-label="Nawa">
          <span className="wordmark-mark" aria-hidden="true">
            N
          </span>
          <span>Nawa</span>
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

        <Surface as="section" className="journey-card" labelledBy="journey-label">
          <div className="journey-card-heading">
            <p id="journey-label">{message("previewLabel")}</p>
            <Badge tone="positive">{message("status")}</Badge>
          </div>
          <ol id="journey" className="journey-steps">
            <li>
              <span aria-hidden="true">01</span>
              <strong>{message("stepDiscover")}</strong>
            </li>
            <li>
              <span aria-hidden="true">02</span>
              <strong>{message("stepChoose")}</strong>
            </li>
            <li>
              <span aria-hidden="true">03</span>
              <strong>{message("stepConfirm")}</strong>
            </li>
          </ol>
          <p id="status" className="timezone-note">
            <span aria-hidden="true">◷</span>
            {message("timezone")}
          </p>
        </Surface>
      </div>
    </BrandShell>
  );
}
