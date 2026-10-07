"use client";
import { useActionState, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { RotateCw } from "lucide-react";
import type { Locale } from "@wlbp/i18n";
import type { BrandConfig } from "@wlbp/white-label-ui";
import {
  Alert,
  AlertDescription,
  Button,
  Facts,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSet,
  Input,
  Label,
  RequiredMark,
  cn,
} from "@wlbp/ui-foundation";
import { saveStructuredBrandAction } from "./actions";
import { getDashboardMessage } from "../../_lib/copy";
import { brandObject } from "./brand-fields";
import { ChoiceSelect, FormActions, keepUnsavedInput } from "../services/form-kit";

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
const assetLabels = {
  logoLight: ["Logo on light backgrounds", "الشعار على الخلفيات الفاتحة"],
  logoDark: ["Logo on dark backgrounds", "الشعار على الخلفيات الداكنة"],
  icon: ["App icon", "أيقونة التطبيق"],
  favicon: ["Browser tab icon", "أيقونة تبويب المتصفح"],
  socialImage: ["Link sharing image", "صورة مشاركة الروابط"],
} as const;
const hex = /^#[0-9a-fA-F]{6}$/u;

const panel = "grid gap-5 rounded-lg border bg-card p-5 md:p-6";

/** A colour sample beside its value; meaning stays in the visible label and hex code. */
function Swatch({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-6 shrink-0 rounded-md border border-border-strong",
        className,
      )}
      // Tenant-chosen colour: genuinely dynamic, so it is the one inline style here.
      style={{ backgroundColor: hex.test(color) ? color : "transparent" }}
    />
  );
}

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
  const id = useId();
  const m = (en: string, ar: string) => (locale === "ar" ? ar : en);
  const [colors, setColors] = useState<Record<string, string>>(() => ({
    ...config.tokens.color,
  }));
  useEffect(() => {
    if (state.saved) router.refresh();
  }, [state, router]);
  const title = brandObject(content.title ?? {}),
    contact = brandObject(content.contact ?? {}),
    legal = brandObject(content.legal ?? {});
  const dark = config.tokens.colorDark;
  const textField = (
    name: string,
    label: string,
    props: {
      defaultValue: string;
      type?: string;
      dir?: "ltr" | "rtl";
      lang?: string;
      maxLength?: number;
    },
  ) => (
    <Field>
      <Label htmlFor={`${id}-${name}`}>
        {label}
        <RequiredMark />
      </Label>
      <Input
        id={`${id}-${name}`}
        name={name}
        required
        type={props.type ?? "text"}
        defaultValue={props.defaultValue}
        {...(props.dir ? { dir: props.dir } : {})}
        {...(props.lang ? { lang: props.lang } : {})}
        {...(props.maxLength ? { maxLength: props.maxLength } : {})}
      />
    </Field>
  );
  return (
    <form action={action} className="grid gap-6" {...keepUnsavedInput}>
      <input name="locale" type="hidden" value={locale} />
      <input name="brandKey" type="hidden" value={brandKey} />
      <input name="contentHash" type="hidden" value={contentHash ?? ""} />
      <FieldSet disabled={pending} className={panel}>
        <FieldLegend>
          {m("Name and customer-facing text", "الاسم والنصوص الظاهرة للعملاء")}
        </FieldLegend>
        <FieldDescription className="-mt-3">
          {m(
            "The brand name, display names, contact email and legal links shown on the booking site and in customer emails.",
            "اسم العلامة وأسماء العرض وبريد التواصل والروابط القانونية التي تظهر في موقع الحجز وفي رسائل العملاء.",
          )}
        </FieldDescription>
        <FieldGroup columns={2}>
          {textField("name", m("Brand name", "اسم العلامة"), {
            defaultValue: config.name,
            maxLength: 160,
          })}
          {textField("email", m("Contact email", "بريد التواصل"), {
            defaultValue: String(contact.email ?? ""),
            type: "email",
            dir: "ltr",
          })}
          {textField("title-en", m("English display name", "اسم العرض بالإنجليزية"), {
            defaultValue: String(title.en ?? config.name),
            dir: "ltr",
            lang: "en",
            maxLength: 160,
          })}
          {textField("title-ar", m("Arabic display name", "اسم العرض بالعربية"), {
            defaultValue: String(title.ar ?? ""),
            dir: "rtl",
            lang: "ar",
            maxLength: 160,
          })}
          {(["privacyUrl", "termsUrl"] as const).map((key) => (
            <div key={key} className="contents">
              {textField(
                key,
                key === "privacyUrl"
                  ? m("Privacy policy URL", "رابط سياسة الخصوصية")
                  : m("Terms URL", "رابط الشروط والأحكام"),
                { defaultValue: String(legal[key] ?? ""), type: "url", dir: "ltr" },
              )}
            </div>
          ))}
        </FieldGroup>
      </FieldSet>
      <FieldSet disabled={pending} className={panel}>
        <FieldLegend>{m("Colours", "الألوان")}</FieldLegend>
        <FieldDescription className="-mt-3">
          {m(
            "Foreground, surface and focus contrast pairs are validated together before saving.",
            "يُتحقق من تباين النصوص والأسطح والتركيز معًا قبل الحفظ.",
          )}
        </FieldDescription>
        <h3 className="text-sm font-semibold">
          {m("Light palette", "لوحة الألوان الفاتحة")}
        </h3>
        <FieldGroup columns={3}>
          {(Object.keys(config.tokens.color) as (keyof typeof colorLabels)[]).map(
            (key) => (
              <Field key={key}>
                <Label htmlFor={`${id}-color-${key}`}>
                  {colorLabels[key][locale === "ar" ? 1 : 0]}
                  <RequiredMark />
                </Label>
                <div className="flex items-center gap-2">
                  <Swatch color={colors[key] ?? ""} />
                  <Input
                    id={`${id}-color-${key}`}
                    name={`color-${key}`}
                    type="text"
                    dir="ltr"
                    className="font-latin"
                    required
                    pattern="#[0-9a-fA-F]{6}"
                    maxLength={7}
                    defaultValue={config.tokens.color[key]}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setColors((current) => ({ ...current, [key]: value }));
                    }}
                  />
                </div>
              </Field>
            ),
          )}
        </FieldGroup>
        {dark ? (
          <div className="grid gap-3 border-t pt-5">
            <h3 className="text-sm font-semibold">
              {m("Dark palette", "لوحة الألوان الداكنة")}
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {m(
                "Used when a visitor switches to the dark theme. It is kept as configured; this editor does not change it.",
                "تُستخدم عندما ينتقل الزائر إلى المظهر الداكن. تبقى كما هي مهيأة، ولا يغيّرها هذا المحرر.",
              )}
            </p>
            <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {(Object.keys(dark) as (keyof typeof colorLabels)[]).map((key) => (
                <li key={key} className="flex items-center gap-2 text-sm">
                  <Swatch color={dark[key]} />
                  <span className="text-muted-foreground">
                    {colorLabels[key][locale === "ar" ? 1 : 0]}
                  </span>
                  <bdi dir="ltr" className="ms-auto font-latin font-medium">
                    {dark[key]}
                  </bdi>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </FieldSet>
      <FieldSet disabled={pending} className={panel}>
        <FieldLegend>{m("Fonts", "الخطوط")}</FieldLegend>
        <FieldGroup columns={2}>
          {(
            [
              "bodyFamily",
              "displayFamily",
              "arabicBodyFamily",
              "arabicDisplayFamily",
            ] as const
          ).map((key, index) => (
            <Field key={key}>
              <Label htmlFor={`${id}-font-${key}`}>
                {
                  [
                    m("English body", "النص الإنجليزي"),
                    m("English headings", "العناوين الإنجليزية"),
                    m("Arabic body", "النص العربي"),
                    m("Arabic headings", "العناوين العربية"),
                  ][index]
                }
              </Label>
              <ChoiceSelect
                id={`${id}-font-${key}`}
                name={`font-${key}`}
                defaultValue={config.tokens.typography[key]}
                options={[
                  ...new Set([
                    config.tokens.typography[key],
                    'Inter, "Noto Sans Arabic", sans-serif',
                    '"Noto Sans Arabic", sans-serif',
                    '"Noto Naskh Arabic", serif',
                  ]),
                ].map((font) => ({
                  value: font,
                  label: (
                    <bdi dir="ltr" className="font-latin">
                      {font}
                    </bdi>
                  ),
                }))}
              />
            </Field>
          ))}
        </FieldGroup>
      </FieldSet>
      <section className={panel} aria-labelledby={`${id}-assets-title`}>
        <div className="grid gap-1.5">
          <h3 id={`${id}-assets-title`} className="text-base font-semibold">
            {m("Logo and images", "الشعار والصور")}
          </h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {m(
              "Upload is not available in this editor. Validated paths are preserved. Changing deployed files requires the platform materialization workflow.",
              "رفع الصور غير متاح في هذا المحرر، وتُحفظ المسارات الموثّقة كما هي. يتطلب تغيير الملفات المنشورة مسار تجهيز الصور على المنصة.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="grid place-items-center rounded-md border bg-background p-4">
            <Image
              alt={m("Logo on light backgrounds", "الشعار على الخلفيات الفاتحة")}
              height={48}
              src={config.assets.logoLight}
              width={180}
              className="h-12 w-auto"
            />
          </div>
          {config.assets.logoDark ? (
            <div className="grid place-items-center rounded-md border bg-foreground p-4">
              <Image
                alt={m("Logo on dark backgrounds", "الشعار على الخلفيات الداكنة")}
                height={48}
                src={config.assets.logoDark}
                width={180}
                className="h-12 w-auto"
              />
            </div>
          ) : null}
        </div>
        <Facts
          columns={2}
          items={Object.entries(config.assets).map(([key, path]) => ({
            key,
            label:
              assetLabels[key as keyof typeof assetLabels]?.[locale === "ar" ? 1 : 0] ??
              key,
            value: (
              <bdi dir="ltr" className="font-latin">
                {path}
              </bdi>
            ),
          }))}
        />
      </section>
      {state.message ? (
        <Alert tone={state.saved ? "positive" : "danger"}>
          <AlertDescription className="flex flex-wrap items-center gap-3 text-foreground">
            <span>{getDashboardMessage(locale, state.message)}</span>
            {state.message === "requestsResultConflict" ? (
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => router.refresh()}
              >
                <RotateCw aria-hidden="true" />
                {m("Reload and review", "إعادة التحميل والمراجعة")}
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {state.field ? (
        <Alert tone="danger">
          <AlertDescription className="text-foreground">
            {m(
              "Review identity, legal links, colors and fonts.",
              "راجع الهوية والروابط القانونية والألوان والخطوط.",
            )}
          </AlertDescription>
        </Alert>
      ) : null}
      <FormActions sticky>
        <Button
          type="submit"
          loading={pending}
          loadingLabel={m("Saving…", "جارٍ الحفظ…")}
        >
          {m("Save draft", "حفظ المسودة")}
        </Button>
      </FormActions>
    </form>
  );
}
