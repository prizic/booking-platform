import type { Locale } from "@wlbp/i18n";
import { Badge } from "@wlbp/ui-foundation";
import { auditActionCopy, outcomeCopy, type AuditRow } from "../audit-copy";
import { copyFor, say } from "../copy";
import { TimeValue } from "./time";

/** Allow-listed keys only reach here (the database summarises detail). */
export function DetailSummary({ detail }: { detail: Record<string, unknown> }) {
  const entries = Object.entries(detail ?? {});
  if (!entries.length) return null;
  return (
    <span className="secondary">
      {entries.map(([key, value]) => (
        <bdi key={key}>
          {key}: {typeof value === "string" ? value : JSON.stringify(value)}{" "}
        </bdi>
      ))}
    </span>
  );
}

export function AuditList({
  locale,
  rows,
}: {
  locale: Locale;
  rows: readonly AuditRow[];
}) {
  return (
    <ol className="timeline">
      {rows.map((row) => (
        <li key={row.event_id}>
          <TimeValue locale={locale} value={row.created_at} />
          <div>
            <strong>{copyFor(auditActionCopy, row.action, locale)}</strong>{" "}
            {row.outcome !== "succeeded" ? (
              <Badge tone="danger">
                {say(
                  locale,
                  outcomeCopy[row.outcome as keyof typeof outcomeCopy] ??
                    outcomeCopy.failed,
                )}
              </Badge>
            ) : null}
            <span className="secondary">
              <bdi>{row.operator_email ?? row.operator_id}</bdi>
              {row.tenant_name ? (
                <>
                  {" "}
                  · <bdi>{row.tenant_name}</bdi>
                </>
              ) : null}
              {row.reason ? <> · {row.reason}</> : null}
            </span>
            <DetailSummary detail={row.detail} />
          </div>
        </li>
      ))}
    </ol>
  );
}
