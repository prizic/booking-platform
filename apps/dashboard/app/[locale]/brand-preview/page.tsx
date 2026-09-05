import { formatNumber, type Locale } from "@wlbp/i18n";
import {
  Badge,
  Button,
  ErrorSummary,
  StatusMessage,
  Surface,
  TextField,
} from "@wlbp/ui-foundation";
import { BrandShell, resolveBrandAssets } from "@wlbp/white-label-ui";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { dashboardBrand } from "../../_lib/brand";
import { getBrandPreviewMessage } from "../../_lib/brand-preview-copy";
import { instanceLocalePolicy } from "../../_lib/locale-policy";
import { getDashboardSiteOrigin } from "../../_lib/site-origin";

type BrandPreviewPageProps = {
  params: Promise<{ locale: Locale }>;
};

export async function generateMetadata({
  params,
}: BrandPreviewPageProps): Promise<Metadata> {
  const { locale } = await params;
  const siteOrigin = getDashboardSiteOrigin();

  return {
    title: getBrandPreviewMessage(locale, "title"),
    description: getBrandPreviewMessage(locale, "summary"),
    alternates: {
      canonical: new URL(`/${locale}/brand-preview`, siteOrigin),
      languages: {
        en: new URL("/en/brand-preview", siteOrigin),
        ar: new URL("/ar/brand-preview", siteOrigin),
        "x-default": new URL(
          `/${instanceLocalePolicy.defaultLocale}/brand-preview`,
          siteOrigin,
        ),
      },
    },
  };
}

export default async function BrandPreviewPage({ params }: BrandPreviewPageProps) {
  const { locale } = await params;
  const message = (key: Parameters<typeof getBrandPreviewMessage>[1]) =>
    getBrandPreviewMessage(locale, key);
  const calendarStates = [
    ["available", "positive"],
    ["held", "warning"],
    ["unavailable", "danger"],
    ["selected", "positive"],
    ["past", "neutral"],
    ["overCapacity", "danger"],
  ] as const;
  const lightAssets = resolveBrandAssets(dashboardBrand.assets, "light");
  const darkAssets = resolveBrandAssets(dashboardBrand.assets, "dark");

  return (
    <BrandShell
      className="brand-preview-shell"
      labelledBy="brand-preview-title"
      tokens={dashboardBrand.tokens}
    >
      <header className="brand-preview-header">
        <Link href={`/${locale}`}>{message("back")}</Link>
        <strong>{message("longName")}</strong>
      </header>

      <section className="brand-preview-intro">
        <h1 id="brand-preview-title">{message("title")}</h1>
        <p>{message("summary")}</p>
      </section>

      <div className="brand-preview-grid">
        <Surface as="section" className="preview-section" labelledBy="buttons-title">
          <h2 id="buttons-title">{message("buttonsTitle")}</h2>
          <div className="preview-button-states">
            <Button>{message("buttonDefault")}</Button>
            <Button variant="secondary">{message("buttonSecondary")}</Button>
            <Button className="is-hover-preview">{message("buttonHover")}</Button>
            <Button className="is-focus-preview">{message("buttonFocus")}</Button>
            <Button className="is-active-preview">{message("buttonActive")}</Button>
            <Button disabled>{message("buttonDisabled")}</Button>
            <Button loading loadingLabel={message("buttonLoading")}>
              {message("buttonDefault")}
            </Button>
          </div>
        </Surface>

        <Surface as="section" className="preview-section" labelledBy="form-title">
          <h2 id="form-title">{message("formTitle")}</h2>
          <ErrorSummary title={message("formErrorTitle")}>
            <a href="#preview-email">{message("formError")}</a>
          </ErrorSummary>
          <TextField
            description={message("formDescription")}
            error={message("formError")}
            id="preview-email"
            label={message("formLabel")}
            name="email"
            type="email"
            defaultValue="name@"
          />
        </Surface>

        <Surface
          as="section"
          className="preview-section preview-calendar"
          labelledBy="calendar-title"
        >
          <h2 id="calendar-title">{message("calendarTitle")}</h2>
          <p>{message("calendarDescription")}</p>
          <ol>
            {calendarStates.map(([key, tone], index) => (
              <li key={key}>
                <time dateTime={`2026-09-${String(index + 8).padStart(2, "0")}`}>
                  {formatNumber(index + 8, locale, { minimumIntegerDigits: 2 })}
                </time>
                <Badge tone={tone}>{message(key)}</Badge>
              </li>
            ))}
          </ol>
        </Surface>

        <Surface as="section" className="preview-section" labelledBy="empty-title">
          <h2 id="empty-title">{message("emptyTitle")}</h2>
          <StatusMessage>{message("emptyDescription")}</StatusMessage>
        </Surface>

        <Surface
          as="section"
          className="preview-section preview-assets"
          labelledBy="assets-title"
        >
          <h2 id="assets-title">{message("assetTitle")}</h2>
          <div>
            <span className="preview-logo preview-logo--light">
              <Image
                alt={message("lightAsset")}
                height={64}
                src={lightAssets.logo}
                width={240}
              />
            </span>
            <span className="preview-logo preview-logo--dark">
              <Image
                alt={message("darkAsset")}
                height={64}
                src={darkAssets.logo}
                width={240}
              />
            </span>
          </div>
        </Surface>

        <Surface
          as="section"
          className="preview-section preview-email"
          labelledBy="email-title"
        >
          <h2 id="email-title">{message("emailTitle")}</h2>
          <article>
            <strong>{message("emailSubject")}</strong>
            <p>{message("emailGreeting")}</p>
            <p>{message("emailBody")}</p>
          </article>
        </Surface>
      </div>
    </BrandShell>
  );
}
