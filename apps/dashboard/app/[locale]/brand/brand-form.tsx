"use client";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@wlbp/i18n";
import type { BrandConfig } from "@wlbp/white-label-ui";
import { saveStructuredBrandAction } from "./actions";
import { getDashboardMessage } from "../../_lib/copy";
import { brandObject } from "./brand-fields";
const colorLabels = {
  background: ["Background", "الخلفية"],
  surface: ["Surface", "السطح"],
  text: ["Text", "النص"],
  muted: ["Secondary text", "النص الثانوي"],
  border: ["Border", "الحدود"],
  primary: ["Primary action", "الإجراء الرئيسي"],
  onPrimary: ["Text on primary", "نص الإجراء الرئيسي"],
  success: ["Success", "النجاح"],
  onSuccess: ["Text on success", "نص النجاح"],
  warning: ["Warning", "التحذير"],
  onWarning: ["Text on warning", "نص التحذير"],
  danger: ["Error", "الخطأ"],
  onDanger: ["Text on error", "نص الخطأ"],
  focus: ["Keyboard focus", "تركيز لوحة المفاتيح"],
} as const;
export function BrandForm({
  locale,
  brandKey,
  contentHash,
  config,
  content,
}: {
  locale: Locale;
  brandKey: string;
  contentHash: string | null;
  config: BrandConfig;
  content: Readonly<Record<string, unknown>>;
}) {
  const [state, action, pending] = useActionState(saveStructuredBrandAction, {});
  const router = useRouter();
  const m = (en: string, ar: string) => (locale === "ar" ? ar : en);
  useEffect(() => {
    if (state.saved) router.refresh();
  }, [state, router]);
  const title = brandObject(content.title ?? {}),
    contact = brandObject(content.contact ?? {}),
    legal = brandObject(content.legal ?? {});
  return (
    <form
      action={action}
      className="catalog-form"
      onReset={(event) => event.preventDefault()}
    >
      <input name="locale" type="hidden" value={locale} />
      <input name="brandKey" type="hidden" value={brandKey} />
      <input name="contentHash" type="hidden" value={contentHash ?? ""} />
      <fieldset disabled={pending}>
        <legend>{m("Identity and contact", "الهوية والتواصل")}</legend>
        <label>
          {m("Brand name", "اسم العلامة")}
          <input name="name" required maxLength={160} defaultValue={config.name} />
        </label>
        <label>
          {m("English display name", "اسم العرض الإنجليزي")}
          <input
            name="title-en"
            lang="en"
            dir="ltr"
            required
            maxLength={160}
            defaultValue={String(title.en ?? config.name)}
          />
        </label>
        <label>
          {m("Arabic display name", "اسم العرض العربي")}
          <input
            name="title-ar"
            lang="ar"
            dir="rtl"
            required
            maxLength={160}
            defaultValue={String(title.ar ?? "")}
          />
        </label>
        <label>
          {m("Contact email", "بريد التواصل")}
          <input
            name="email"
            type="email"
            required
            defaultValue={String(contact.email ?? "")}
          />
        </label>
        {(["privacyUrl", "termsUrl"] as const).map((key) => (
          <label key={key}>
            {key === "privacyUrl"
              ? m("Privacy policy URL", "رابط سياسة الخصوصية")
              : m("Terms URL", "رابط الشروط")}
            <input
              name={key}
              type="url"
              dir="ltr"
              required
              defaultValue={String(legal[key] ?? "")}
            />
          </label>
        ))}
      </fieldset>
      <fieldset disabled={pending}>
        <legend>{m("Semantic colors", "الألوان الدلالية")}</legend>
        <p>
          {m(
            "Foreground, surface and focus contrast pairs are validated together before saving.",
            "يُتحقق من تباين النصوص والأسطح والتركيز معاً قبل الحفظ.",
          )}
        </p>
        <div className="catalog-columns">
          {(Object.keys(config.tokens.color) as (keyof typeof colorLabels)[]).map(
            (key) => (
              <label key={key}>
                {colorLabels[key][locale === "ar" ? 1 : 0]}
                <input
                  name={`color-${key}`}
                  type="text"
                  dir="ltr"
                  required
                  pattern="#[0-9a-fA-F]{6}"
                  maxLength={7}
                  defaultValue={config.tokens.color[key]}
                />
              </label>
            ),
          )}
        </div>
      </fieldset>
      <fieldset disabled={pending}>
        <legend>{m("Shipped fonts", "الخطوط المرفقة")}</legend>
        {(
          [
            "bodyFamily",
            "displayFamily",
            "arabicBodyFamily",
            "arabicDisplayFamily",
          ] as const
        ).map((key, index) => (
          <label key={key}>
            {
              [
                m("English body", "النص الإنجليزي"),
                m("English headings", "العناوين الإنجليزية"),
                m("Arabic body", "النص العربي"),
                m("Arabic headings", "العناوين العربية"),
              ][index]
            }
            <select name={`font-${key}`} defaultValue={config.tokens.typography[key]}>
              {[
                ...new Set([
                  config.tokens.typography[key],
                  'Inter, "Noto Sans Arabic", sans-serif',
                  '"Noto Sans Arabic", sans-serif',
                  '"Noto Naskh Arabic", serif',
                ]),
              ].map((font) => (
                <option key={font} value={font}>
                  {font}
                </option>
              ))}
            </select>
          </label>
        ))}
      </fieldset>
      <section>
        <h3>{m("Materialized PNG assets", "صور PNG المُجهَّزة")}</h3>
        <p>
          {m(
            "Upload is not available in this editor. Validated paths are preserved. Changing deployed files requires the platform materialization workflow.",
            "رفع الصور غير متاح في هذا المحرر. تُحفظ المسارات الموثقة. يتطلب تغيير الملفات المنشورة سير تجهيز الصور على المنصة.",
          )}
        </p>
        <ul>
          {Object.entries(config.assets).map(([key, path]) => (
            <li key={key}>
              <bdi>
                {key}: {path}
              </bdi>
            </li>
          ))}
        </ul>
      </section>
      <button type="submit" disabled={pending}>
        {m(pending ? "Saving…" : "Save draft", pending ? "جارٍ الحفظ…" : "حفظ المسودة")}
      </button>
      {state.message ? (
        <p role={state.saved ? "status" : "alert"}>
          {getDashboardMessage(locale, state.message)}
        </p>
      ) : null}
      {state.field ? (
        <p role="alert">
          {m(
            "Review identity, legal links, colors and fonts.",
            "راجع الهوية والروابط القانونية والألوان والخطوط.",
          )}
        </p>
      ) : null}
      {state.message === "requestsResultConflict" ? (
        <button type="button" onClick={() => router.refresh()}>
          {m("Reload and review", "إعادة التحميل والمراجعة")}
        </button>
      ) : null}
    </form>
  );
}
