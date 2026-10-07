"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useWatch, type Control } from "react-hook-form";
import type { Locale } from "@wlbp/i18n";
import type { BrandConfig } from "@wlbp/white-label-ui";
import {
  Button,
  Facts,
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSet,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  applyActionErrors,
  cn,
  useActionMutation,
  useZodForm,
} from "@wlbp/ui-foundation";
import { getDashboardMessage } from "../../_lib/copy";
import { saveStructuredBrandAction } from "./actions";
import { brandObject } from "./brand-document";
import {
  brandColorKeys,
  brandEditorSchema,
  brandFontKeys,
  type BrandColorKey,
  type BrandEditorInput,
} from "./brand-schema";
import { brandFormMessages } from "./results";
import { FormActions } from "../services/form-kit";
import { SelectField, TextField } from "../services/form-fields";
import { useAuthoritativeDefaults } from "../services/form-hooks";
import { MutationFeedback } from "../services/mutation-feedback";

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

/** One light-palette colour: hex text with a live swatch. */
function ColorField({
  control,
  name,
  label,
}: {
  control: Control<BrandEditorInput>;
  name: BrandColorKey;
  label: string;
}) {
  const value = useWatch({ control, name: `colors.${name}` });
  return (
    <FormField
      control={control}
      name={`colors.${name}`}
      render={({ field }) => (
        <FormItem>
          <FormLabel required>{label}</FormLabel>
          <div className="flex items-center gap-2">
            <Swatch color={value ?? ""} />
            <FormControl>
              <Input
                ref={field.ref}
                name={`color-${name}`}
                type="text"
                dir="ltr"
                className="font-latin"
                required
                maxLength={7}
                value={field.value ?? ""}
                onChange={(event) => field.onChange(event.target.value)}
                onBlur={field.onBlur}
              />
            </FormControl>
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** The editor's values for the stored brand, as the controls hold them. */
export function brandEditorDefaults(
  locale: Locale,
  brandKey: string,
  contentHash: string | null,
  config: BrandConfig,
  content: Readonly<Record<string, unknown>>,
): BrandEditorInput {
  const title = brandObject(content.title ?? {}),
    contact = brandObject(content.contact ?? {}),
    legal = brandObject(content.legal ?? {});
  return {
    locale,
    brandKey,
    contentHash: contentHash ?? "",
    name: config.name,
    email: String(contact.email ?? ""),
    titleEn: String(title.en ?? config.name),
    titleAr: String(title.ar ?? ""),
    privacyUrl: String(legal.privacyUrl ?? ""),
    termsUrl: String(legal.termsUrl ?? ""),
    colors: Object.fromEntries(
      brandColorKeys.map((key) => [key, config.tokens.color[key]]),
    ) as BrandEditorInput["colors"],
    fonts: Object.fromEntries(
      brandFontKeys.map((key) => [key, config.tokens.typography[key]]),
    ) as BrandEditorInput["fonts"],
  };
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
  const router = useRouter();
  const m = (en: string, ar: string) => (locale === "ar" ? ar : en);
  const messages = brandFormMessages(locale);
  const defaults = brandEditorDefaults(locale, brandKey, contentHash, config, content);
  const form = useZodForm(brandEditorSchema, { defaultValues: defaults });
  useAuthoritativeDefaults(form, defaults);
  const control = form.control as unknown as Control<BrandEditorInput>;
  const mutation = useActionMutation(saveStructuredBrandAction, {
    onFailure: (result) => applyActionErrors(form, result),
  });
  const pending = mutation.isPending;
  const dark = config.tokens.colorDark;
  return (
    <Form form={form} locale={locale} messages={messages}>
      <form
        noValidate
        className="grid gap-6"
        data-brand-form="editor"
        onSubmit={form.handleSubmit(() => mutation.mutate(form.getValues()))}
      >
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
            <TextField
              control={control}
              name="name"
              label={m("Brand name", "اسم العلامة")}
              required
              maxLength={160}
            />
            <TextField
              control={control}
              name="email"
              label={m("Contact email", "بريد التواصل")}
              required
              type="email"
              dir="ltr"
            />
            <TextField
              control={control}
              name="titleEn"
              htmlName="title-en"
              label={m("English display name", "اسم العرض بالإنجليزية")}
              required
              dir="ltr"
              lang="en"
              maxLength={160}
            />
            <TextField
              control={control}
              name="titleAr"
              htmlName="title-ar"
              label={m("Arabic display name", "اسم العرض بالعربية")}
              required
              dir="rtl"
              lang="ar"
              maxLength={160}
            />
            <TextField
              control={control}
              name="privacyUrl"
              label={m("Privacy policy URL", "رابط سياسة الخصوصية")}
              required
              type="url"
              dir="ltr"
            />
            <TextField
              control={control}
              name="termsUrl"
              label={m("Terms URL", "رابط الشروط والأحكام")}
              required
              type="url"
              dir="ltr"
            />
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
            {brandColorKeys.map((key) => (
              <ColorField
                key={key}
                control={control}
                name={key}
                label={colorLabels[key][locale === "ar" ? 1 : 0]}
              />
            ))}
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
            {brandFontKeys.map((key, index) => (
              <SelectField
                key={key}
                control={control}
                name={`fonts.${key}`}
                htmlName={`font-${key}`}
                label={
                  [
                    m("English body", "النص الإنجليزي"),
                    m("English headings", "العناوين الإنجليزية"),
                    m("Arabic body", "النص العربي"),
                    m("Arabic headings", "العناوين العربية"),
                  ][index]
                }
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
            ))}
          </FieldGroup>
        </FieldSet>
        <section className={panel} aria-labelledby="brand-assets-title">
          <div className="grid gap-1.5">
            <h3 id="brand-assets-title" className="text-base font-semibold">
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
                assetLabels[key as keyof typeof assetLabels]?.[
                  locale === "ar" ? 1 : 0
                ] ?? key,
              value: (
                <bdi dir="ltr" className="font-latin">
                  {path}
                </bdi>
              ),
            }))}
          />
        </section>
        <MutationFeedback
          locale={locale}
          messages={messages}
          result={mutation.data}
          transportFailed={mutation.isError}
          success={getDashboardMessage(locale, "brandResultDrafted")}
          reload={{
            codes: ["revision-conflict"],
            label: m("Reload and review", "إعادة التحميل والمراجعة"),
            onReload: () => router.refresh(),
          }}
        />
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
    </Form>
  );
}
