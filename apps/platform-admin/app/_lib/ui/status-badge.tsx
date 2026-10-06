import type { Locale } from "@wlbp/i18n";
import { Badge } from "@wlbp/ui-foundation";
import { copyFor, roleCopy, statusCopy, statusTone } from "../copy";

export function StatusBadge({
  locale,
  status,
}: {
  locale: Locale;
  status: string | null | undefined;
}) {
  return (
    <Badge tone={statusTone(status ?? "unknown")}>
      {copyFor(statusCopy, status ?? "unknown", locale)}
    </Badge>
  );
}

export function RoleBadge({ locale, role }: { locale: Locale; role: string }) {
  return (
    <Badge
      tone={
        role === "break_glass" ? "danger" : role === "admin" ? "warning" : "neutral"
      }
    >
      {copyFor(roleCopy, role, locale)}
    </Badge>
  );
}
