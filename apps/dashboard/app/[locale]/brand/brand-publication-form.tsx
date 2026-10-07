"use client";
import { useFormStatus } from "react-dom";
import type { Locale } from "@wlbp/i18n";
import type { ButtonVariant } from "@wlbp/ui-foundation";
import { ConfirmSubmit } from "../services/confirm-submit";

function Submit({
  locale,
  label,
  title,
  variant,
}: {
  locale: Locale;
  label: string;
  title: string;
  variant: ButtonVariant;
}) {
  const { pending } = useFormStatus();
  const m = (en: string, ar: string) => (locale === "ar" ? ar : en);
  return (
    <ConfirmSubmit
      label={label}
      variant={variant}
      pending={pending}
      pendingLabel={m("Applying change…", "جارٍ تطبيق التغيير…")}
      title={title}
      description={m(
        "I reviewed this revision and approve changing the published presentation.",
        "راجعتُ هذه النسخة وأوافق على تغيير العرض المنشور.",
      )}
      confirmLabel={label}
      cancelLabel={m("Cancel", "إلغاء")}
    />
  );
}
export function BrandPublicationForm({
  locale,
  label,
  title,
  variant = "default",
  action,
  fields,
}: {
  locale: Locale;
  label: string;
  /** The question the confirmation dialog asks. */
  title: string;
  variant?: ButtonVariant;
  action: (form: FormData) => Promise<never>;
  fields: Readonly<Record<string, string>>;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="locale" value={locale} />
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} name={name} type="hidden" value={value} />
      ))}
      <Submit locale={locale} label={label} title={title} variant={variant} />
    </form>
  );
}
