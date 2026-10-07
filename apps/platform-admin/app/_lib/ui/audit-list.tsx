import type { Locale } from "@wlbp/i18n";
import { StatusStamp } from "@wlbp/ui-foundation";
import { auditActionCopy, outcomeCopy, type AuditRow } from "../audit-copy";
import { copyFor, say } from "../copy";
import { TimeValue } from "./time";

/** Allow-listed keys only reach here (the database summarises detail). */
export function DetailSummary({ detail }: { detail: Record<string, unknown> }) {
  const entries = Object.entries(detail ?? {});
  if (!entries.length) return null;
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1 font-latin text-xs text-muted-foreground">
      {entries.map(([key, value]) => (
        <bdi key={key} dir="ltr" className="break-all">
          {key}: {typeof value === "string" ? value : JSON.stringify(value)}
        </bdi>
      ))}
    </span>
  );
}

/** A dated list of operator actions, newest first, as one ruled ledger. */
export function AuditList({
  locale,
  rows,
}: {
  locale: Locale;
  rows: readonly AuditRow[];
}) {
  return (
    <ol className="divide-y rounded-lg border bg-card">
      {rows.map((row) => (
        <li
          key={row.event_id}
          className="grid gap-1.5 px-4 py-3 text-sm md:grid-cols-[13rem_minmax(0,1fr)] md:gap-4"
        >
          <span className="text-muted-foreground">
            <TimeValue locale={locale} value={row.created_at} />
          </span>
          <div className="grid min-w-0 gap-1">
            <p className="flex flex-wrap items-center gap-2">
              <strong className="font-semibold">
                {copyFor(auditActionCopy, row.action, locale)}
              </strong>
              {row.outcome !== "succeeded" ? (
                <StatusStamp state="failed">
                  {say(
                    locale,
                    outcomeCopy[row.outcome as keyof typeof outcomeCopy] ??
                      outcomeCopy.failed,
                  )}
                </StatusStamp>
              ) : null}
            </p>
            <p className="text-muted-foreground">
              <bdi>{row.operator_email ?? row.operator_id}</bdi>
              {row.tenant_name ? (
                <>
                  {" · "}
                  <bdi>{row.tenant_name}</bdi>
                </>
              ) : null}
              {row.reason ? <> · {row.reason}</> : null}
            </p>
            <DetailSummary detail={row.detail} />
          </div>
        </li>
      ))}
    </ol>
  );
}
