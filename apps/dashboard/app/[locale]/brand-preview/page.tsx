import { cookies } from "next/headers";
import { DraftBrandPreview } from "../brand/draft-brand-preview";
import { formatNumber, type Locale } from "@wlbp/i18n";
import {
  Button,
  EmptyState,
  ErrorSummary,
  PageHeader,
  Section,
  StatusStamp,
  TextField,
  type StampState,
} from "@wlbp/ui-foundation";
import { resolveBrandAssets } from "@wlbp/white-label-ui";
import { ArrowLeft, CalendarSearch } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { dashboardBrand } from "../../_lib/brand";
import { getBrandPreviewMessage } from "../../_lib/brand-preview-copy";
import { instanceLocalePolicy } from "../../_lib/locale-policy";
import { getDashboardSiteOrigin } from "../../_lib/site-origin";
import { BrandScope } from "./brand-scope";

type BrandPreviewPageProps = {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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

const panel = "grid content-start gap-4 rounded-lg border bg-card p-5";

export default async function BrandPreviewPage({
  params,
  searchParams,
}: BrandPreviewPageProps) {
  const { locale } = await params;
  if ((await searchParams).mode === "draft")
    return (
      <DraftBrandPreview
        locale={locale}
        token={(await cookies()).get("dashboard-brand-preview")?.value ?? null}
      />
    );
  const message = (key: Parameters<typeof getBrandPreviewMessage>[1]) =>
    getBrandPreviewMessage(locale, key);
  const calendarStates: readonly (readonly [
    Parameters<typeof getBrandPreviewMessage>[1],
    StampState,
  ])[] = [
    ["available", "confirmed"],
    ["held", "requested"],
    ["unavailable", "cancelled"],
    ["selected", "active"],
    ["past", "completed"],
    ["overCapacity", "failed"],
  ];
  const lightAssets = resolveBrandAssets(dashboardBrand.assets, "light");
  const darkAssets = resolveBrandAssets(dashboardBrand.assets, "dark");

  return (
    <BrandScope tokens={dashboardBrand.tokens} locale={locale} className="min-h-dvh">
      <main
        aria-labelledby="brand-preview-title"
        className="mx-auto grid max-w-6xl gap-8 p-4 md:p-8"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="ghost">
            <Link href={`/${locale}`}>
              <ArrowLeft aria-hidden="true" />
              {message("back")}
            </Link>
          </Button>
          <strong className="text-sm font-semibold text-muted-foreground">
            {message("longName")}
          </strong>
        </div>

        <PageHeader
          titleId="brand-preview-title"
          title={message("title")}
          description={message("summary")}
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <Section id="buttons" title={message("buttonsTitle")}>
            <div className={panel}>
              <div className="flex flex-wrap items-center gap-3">
                <Button>{message("buttonDefault")}</Button>
                <Button variant="outline">{message("buttonSecondary")}</Button>
                <Button className="bg-primary/90">{message("buttonHover")}</Button>
                <Button className="ring-[3px] ring-ring/50">
                  {message("buttonFocus")}
                </Button>
                <Button className="bg-primary/85">{message("buttonActive")}</Button>
                <Button disabled>{message("buttonDisabled")}</Button>
                <Button loading loadingLabel={message("buttonLoading")}>
                  {message("buttonDefault")}
                </Button>
              </div>
            </div>
          </Section>

          <Section id="form" title={message("formTitle")}>
            <div className={panel}>
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
                dir="ltr"
                defaultValue="name@"
              />
            </div>
          </Section>

          <Section
            id="calendar"
            title={message("calendarTitle")}
            description={message("calendarDescription")}
          >
            <ol className={`${panel} grid-cols-2 sm:grid-cols-3`}>
              {calendarStates.map(([key, state], index) => (
                <li key={key} className="grid justify-items-start gap-1.5">
                  <time
                    className="text-lg font-semibold [font-variant-numeric:tabular-nums]"
                    dateTime={`2026-09-${String(index + 8).padStart(2, "0")}`}
                  >
                    {formatNumber(index + 8, locale, { minimumIntegerDigits: 2 })}
                  </time>
                  <StatusStamp state={state}>{message(key)}</StatusStamp>
                </li>
              ))}
            </ol>
          </Section>

          <Section id="empty" title={message("emptyTitle")}>
            <EmptyState
              icon={<CalendarSearch />}
              title={message("emptyTitle")}
              description={message("emptyDescription")}
            />
          </Section>

          <Section id="assets" title={message("assetTitle")}>
            <div className={`${panel} sm:grid-cols-2`}>
              <div className="grid place-items-center rounded-md border bg-background p-4">
                <Image
                  alt={message("lightAsset")}
                  height={64}
                  src={lightAssets.logo}
                  width={240}
                  className="h-16 w-auto"
                />
              </div>
              {dashboardBrand.tokens.colorDark ? (
                <BrandScope
                  tokens={dashboardBrand.tokens}
                  locale={locale}
                  theme="dark"
                  className="grid place-items-center rounded-md border p-4"
                >
                  <Image
                    alt={message("darkAsset")}
                    height={64}
                    src={darkAssets.logo}
                    width={240}
                    className="h-16 w-auto"
                  />
                </BrandScope>
              ) : (
                <div className="grid place-items-center rounded-md border bg-foreground p-4">
                  <Image
                    alt={message("darkAsset")}
                    height={64}
                    src={darkAssets.logo}
                    width={240}
                    className="h-16 w-auto"
                  />
                </div>
              )}
            </div>
          </Section>

          <Section id="email" title={message("emailTitle")}>
            <article className={panel}>
              <strong className="text-base font-semibold">
                {message("emailSubject")}
              </strong>
              <p>{message("emailGreeting")}</p>
              <p className="text-muted-foreground">{message("emailBody")}</p>
            </article>
          </Section>
        </div>
      </main>
    </BrandScope>
  );
}
