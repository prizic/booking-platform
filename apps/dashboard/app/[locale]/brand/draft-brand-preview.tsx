import Link from "next/link";
import Image from "next/image";
import type { Locale } from "@wlbp/i18n";
import {
  parseBrandConfig,
  resolveBrandAssets,
  type BrandConfig,
} from "@wlbp/white-label-ui";
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  StatusStamp,
} from "@wlbp/ui-foundation";
import { ArrowLeft, CalendarPlus, Languages } from "lucide-react";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { BrandScope } from "../brand-preview/brand-scope";
import { brandObject } from "./brand-document";

/** How the Client presents the saved draft, drawn with the same foundation components. */
function ClientMock({
  config,
  theme,
  locale,
  title,
  email,
  privacyUrl,
  termsUrl,
  heading,
  content,
}: {
  config: BrandConfig;
  theme: "light" | "dark";
  locale: Locale;
  title: string;
  email: string;
  privacyUrl: string | null;
  termsUrl: string | null;
  heading: "h1" | "p";
  content: Readonly<Record<string, unknown>>;
}) {
  const m = (en: string, ar: string) => (locale === "ar" ? ar : en);
  const Title = heading;
  const about = brandObject(content.about ?? {});
  const contact = brandObject(content.contact ?? {});
  const stores = brandObject(content.appStores ?? {});
  const safeUrl = (value: unknown) => {
    if (typeof value !== "string") return null;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password ? value : null;
    } catch {
      return null;
    }
  };
  const phone =
    typeof contact.phone === "string" && /^\+[1-9]\d{1,14}$/u.test(contact.phone)
      ? contact.phone
      : null;
  const whatsapp =
    typeof contact.whatsapp === "string" && /^\+[1-9]\d{1,14}$/u.test(contact.whatsapp)
      ? contact.whatsapp
      : null;
  const logo = resolveBrandAssets(config.assets, theme).logo;
  return (
    <BrandScope
      tokens={config.tokens}
      locale={locale}
      theme={theme}
      className="overflow-hidden rounded-xl border"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b bg-card px-5 py-4">
        <Image alt={title} height={40} src={logo} width={160} className="h-10 w-auto" />
        <span className="text-sm font-semibold text-muted-foreground">
          {m("Book an appointment", "احجز موعدًا")}
        </span>
      </div>
      <div className="grid gap-6 p-5 md:p-8">
        <div className="grid gap-2">
          <Title
            {...(heading === "h1" ? { id: "draft-preview-title" } : {})}
            className="text-2xl leading-tight font-bold text-balance md:text-3xl"
          >
            {title}
          </Title>
          <p className="text-muted-foreground">
            {m(
              "Preview of the saved identity, colors, typography, and customer-facing links.",
              "معاينة الهوية والألوان والخطوط وروابط العملاء المحفوظة.",
            )}
          </p>
        </div>
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle as={heading === "h1" ? "h2" : "h3"}>
              {m("Your next appointment", "موعدك القادم")}
            </CardTitle>
            <CardDescription>
              <bdi>{email}</bdi>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button>
              <CalendarPlus aria-hidden="true" />
              {m("Choose an appointment", "اختيار موعد")}
            </Button>
            <StatusStamp state="confirmed">{m("Confirmed", "مؤكد")}</StatusStamp>
          </CardContent>
        </Card>
        <section aria-label={m("Contact", "تواصل معنا")} className="grid gap-3">
          <h2 className="text-lg font-semibold">{m("Contact", "تواصل معنا")}</h2>
          <div className="flex flex-wrap gap-3">
            {email ? (
              <Button asChild variant="outline">
                <a href={`mailto:${email}`}>{m("Email", "البريد الإلكتروني")}</a>
              </Button>
            ) : null}
            {phone ? (
              <Button asChild variant="outline">
                <a href={`tel:${phone}`}>{m("Call", "اتصل بنا")}</a>
              </Button>
            ) : null}
            {whatsapp ? (
              <Button asChild variant="outline">
                <a href={`https://wa.me/${whatsapp.slice(1)}`}>WhatsApp</a>
              </Button>
            ) : null}
          </div>
        </section>
        {(
          [
            ["experience", "Experience", "الخبرة"],
            ["whyChooseUs", "Why choose us", "لماذا تختارنا"],
            ["address", "Address", "العنوان"],
          ] as const
        ).map(([key, en, ar]) => {
          const value = brandObject(about[key] ?? {})[locale];
          return typeof value === "string" && value ? (
            <section key={key} className="grid gap-2">
              <h2 className="text-lg font-semibold">{m(en, ar)}</h2>
              <p className="whitespace-pre-line">{value}</p>
            </section>
          ) : null;
        })}
        {safeUrl(about.mapUrl) ? (
          <a
            href={safeUrl(about.mapUrl)!}
            className="font-semibold text-primary underline"
          >
            {m("Open map", "افتح الخريطة")}
          </a>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 border-t bg-card px-5 py-4 text-sm">
        {safeUrl(stores.appStoreUrl) ? (
          <Button asChild variant="outline">
            <a href={safeUrl(stores.appStoreUrl)!}>App Store</a>
          </Button>
        ) : null}
        {safeUrl(stores.googlePlayUrl) ? (
          <Button asChild variant="outline">
            <a href={safeUrl(stores.googlePlayUrl)!}>Google Play</a>
          </Button>
        ) : null}
        {privacyUrl ? (
          <Link
            className="font-semibold text-primary underline-offset-4 hover:underline"
            href={privacyUrl}
          >
            {m("Privacy", "الخصوصية")}
          </Link>
        ) : null}
        {termsUrl ? (
          <Link
            className="font-semibold text-primary underline-offset-4 hover:underline"
            href={termsUrl}
          >
            {m("Terms", "الشروط")}
          </Link>
        ) : null}
      </div>
    </BrandScope>
  );
}

export async function DraftBrandPreview({
  locale,
  token,
}: {
  locale: Locale;
  token: string | null;
}) {
  const m = (en: string, ar: string) => (locale === "ar" ? ar : en);
  const request = await loadDashboardRequestAccess(locale);
  const back = (
    <Button asChild variant="ghost">
      <Link href={`/${locale}/brand`}>
        <ArrowLeft aria-hidden="true" />
        {m("Back to Brand", "العودة إلى العلامة")}
      </Link>
    </Button>
  );
  let document;
  try {
    if (!token || request.state.kind !== "ready" || !request.source?.redeemBrandPreview)
      throw new Error();
    const value = await request.source.redeemBrandPreview(
      request.state.context.dashboardHostname,
      token,
    );
    document = brandObject(Array.isArray(value) ? value[0] : value);
  } catch {
    return (
      <main className="mx-auto grid min-h-dvh max-w-2xl content-center gap-6 p-6">
        <h1 className="text-2xl leading-tight font-bold">
          {m("Draft preview unavailable", "معاينة المسودة غير متاحة")}
        </h1>
        <Alert tone="warning">
          <AlertDescription className="text-foreground">
            {m(
              "The preview expired or is outside your current tenant. Issue a new preview from Brand.",
              "انتهت المعاينة أو أنها خارج منشأتك الحالية. أنشئ معاينة جديدة من صفحة العلامة.",
            )}
          </AlertDescription>
        </Alert>
        <div>{back}</div>
      </main>
    );
  }
  const config = parseBrandConfig(document.config),
    content = brandObject(document.content),
    title = brandObject(content.title ?? {}),
    contact = brandObject(content.contact ?? {}),
    legal = brandObject(content.legal ?? {});
  const mock = {
    config,
    content,
    locale,
    title: String(title[locale] ?? config.name),
    email: String(contact.email ?? ""),
    privacyUrl: typeof legal.privacyUrl === "string" ? legal.privacyUrl : null,
    termsUrl: typeof legal.termsUrl === "string" ? legal.termsUrl : null,
  };
  return (
    <main
      aria-labelledby="draft-preview-title"
      className="mx-auto grid max-w-5xl gap-6 p-4 md:p-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {back}
        <div className="flex flex-wrap items-center gap-3">
          <StatusStamp state="pending">
            {m(
              "Saved draft preview — unpublished",
              "معاينة المسودة المحفوظة — غير منشورة",
            )}{" "}
            · <bdi>{String(document.revision)}</bdi>
          </StatusStamp>
          <Button asChild variant="outline" size="sm">
            <Link href={`/${locale === "ar" ? "en" : "ar"}/brand-preview?mode=draft`}>
              <Languages aria-hidden="true" />
              {locale === "ar" ? "English" : "العربية"}
            </Link>
          </Button>
        </div>
      </div>
      <ClientMock {...mock} theme="light" heading="h1" />
      {config.tokens.colorDark ? (
        <section aria-labelledby="draft-preview-dark" className="grid gap-3">
          <h2 id="draft-preview-dark" className="text-lg font-semibold">
            {m("Dark theme", "المظهر الداكن")}
          </h2>
          <ClientMock {...mock} theme="dark" heading="p" />
        </section>
      ) : null}
    </main>
  );
}
