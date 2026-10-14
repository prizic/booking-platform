import type { Locale } from "@wlbp/i18n";
import { StatusBadge as SharedStatusBadge } from "@wlbp/ui-foundation";
import { copyFor, roleCopy, statusCopy, statusTone } from "../copy";
export function StatusBadge({
  locale,
  status,
}: {
  locale: Locale;
  status: string | null | undefined;
}) {
  const key = status ?? "unknown";
  return (
    <SharedStatusBadge
      label={copyFor(statusCopy, key, locale)}
      tone={statusTone(key)}
    />
  );
}
export function RoleBadge({ locale, role }: { locale: Locale; role: string }) {
  return (
    <SharedStatusBadge
      label={copyFor(roleCopy, role, locale)}
      tone={
        role === "break_glass" ? "danger" : role === "admin" ? "warning" : "neutral"
      }
    />
  );
}
