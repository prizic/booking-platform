import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getDirection, isLocale, type Locale } from "@wlbp/i18n";
import { getClientMessage } from "../_lib/copy";
import { clientBrand } from "../_lib/brand";
import { instanceLocalePolicy } from "../_lib/locale-policy";
import "../globals.css";

type LocaleLayoutProps = Readonly<{
  children: ReactNode;
  params: Promise<{ locale: string }>;
}>;

export const dynamic = "force-dynamic";

function requireLocale(value: string): Locale {
  if (!isLocale(value)) {
    notFound();
  }

  return value;
}

export async function generateMetadata({
  params,
}: LocaleLayoutProps): Promise<Metadata> {
  const locale = requireLocale((await params).locale);

  return {
    title: `${clientBrand.name} — ${getClientMessage(locale, "title")}`,
    description: getClientMessage(locale, "summary"),
    icons: {
      icon: clientBrand.assets.favicon,
      apple: clientBrand.assets.icon,
    },
    openGraph: {
      images: [clientBrand.assets.socialImage],
      siteName: clientBrand.name,
    },
    alternates: {
      canonical: `/${locale}`,
      languages: {
        en: "/en",
        ar: "/ar",
        "x-default": `/${instanceLocalePolicy.defaultLocale}`,
      },
    },
  };
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const locale = requireLocale((await params).locale);

  return (
    <html lang={locale} dir={getDirection(locale)}>
      <body>{children}</body>
    </html>
  );
}
