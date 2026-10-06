import Link from "next/link";
import type { Locale } from "@wlbp/i18n";
import { BrandShell, parseBrandConfig } from "@wlbp/white-label-ui";
import { Button, Surface } from "@wlbp/ui-foundation";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { brandObject } from "./brand-fields";
export async function DraftBrandPreview({
  locale,
  token,
}: {
  locale: Locale;
  token: string | null;
}) {
  const m = (en: string, ar: string) => (locale === "ar" ? ar : en);
  const request = await loadDashboardRequestAccess(locale);
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
      <main>
        <h1>{m("Draft preview unavailable", "معاينة المسودة غير متاحة")}</h1>
        <p>
          {m(
            "The preview expired or is outside your current tenant. Issue a new preview from Brand.",
            "انتهت المعاينة أو أنها خارج مؤسستك الحالية. أنشئ معاينة جديدة من العلامة.",
          )}
        </p>
        <Link href={`/${locale}/brand`}>
          {m("Back to Brand", "العودة إلى العلامة")}
        </Link>
      </main>
    );
  }
  const config = parseBrandConfig(document.config),
    content = brandObject(document.content),
    title = brandObject(content.title ?? {}),
    contact = brandObject(content.contact ?? {}),
    legal = brandObject(content.legal ?? {});
  return (
    <BrandShell
      labelledBy="draft-preview-title"
      tokens={config.tokens}
      className="brand-preview-shell"
    >
      <header className="brand-preview-header">
        <Link href={`/${locale}/brand`}>
          {m("Back to Brand", "العودة إلى العلامة")}
        </Link>
        <Link href={`/${locale === "ar" ? "en" : "ar"}/brand-preview?mode=draft`}>
          {locale === "ar" ? "English" : "العربية"}
        </Link>
      </header>
      <section className="brand-preview-intro">
        <h1 id="draft-preview-title">{String(title[locale] ?? config.name)}</h1>
        <p>
          {m(
            "Saved draft preview — unpublished",
            "معاينة المسودة المحفوظة — غير منشورة",
          )}{" "}
          · {String(document.revision)}
        </p>
      </section>
      <Surface
        as="section"
        className="preview-section"
        labelledBy="draft-appointment-title"
      >
        <h2 id="draft-appointment-title">
          {m("Your next appointment", "موعدك القادم")}
        </h2>
        <p>
          {m(
            "Preview of the saved identity, colors, typography, and customer-facing links.",
            "معاينة الهوية والألوان والخطوط وروابط العميل المحفوظة.",
          )}
        </p>
        <Button>{m("Choose an appointment", "اختيار موعد")}</Button>
        <p>{String(contact.email ?? "")}</p>
      </Surface>
      <footer className="workspace-filter-bar">
        {typeof legal.privacyUrl === "string" ? (
          <Link href={legal.privacyUrl}>{m("Privacy", "الخصوصية")}</Link>
        ) : null}{" "}
        {typeof legal.termsUrl === "string" ? (
          <Link href={legal.termsUrl}>{m("Terms", "الشروط")}</Link>
        ) : null}
      </footer>
    </BrandShell>
  );
}
