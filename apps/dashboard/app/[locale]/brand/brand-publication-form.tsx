"use client";
import { useFormStatus } from "react-dom";
import type { Locale } from "@wlbp/i18n";
import { Button } from "@wlbp/ui-foundation";
function Submit({ locale, label }: { locale: Locale; label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} type="submit">
      {pending ? (locale === "ar" ? "جارٍ تطبيق التغيير…" : "Applying change…") : label}
    </Button>
  );
}
export function BrandPublicationForm({
  locale,
  label,
  action,
  fields,
}: {
  locale: Locale;
  label: string;
  action: (form: FormData) => Promise<never>;
  fields: Readonly<Record<string, string>>;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="locale" value={locale} />
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} name={name} type="hidden" value={value} />
      ))}
      <label className="workspace-checkbox">
        <input name="confirm" value="yes" type="checkbox" required />
        {locale === "ar"
          ? "راجعت هذه النسخة وأوافق على تغيير العرض المنشور."
          : "I reviewed this revision and approve changing the published presentation."}
      </label>
      <Submit locale={locale} label={label} />
    </form>
  );
}
