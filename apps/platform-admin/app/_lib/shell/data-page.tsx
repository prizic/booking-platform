import type { Locale } from "@wlbp/i18n";
import { DataPage as SharedDataPage } from "@wlbp/ui-foundation";
import { Clock } from "lucide-react";
import type { ReactNode } from "react";
import { ActionFeedbackNotice } from "../ui/action-feedback";
import { say, stateCopy } from "../copy";
/** Private UTC copy, composed into the same shared list-page structure used by other workspaces. */
export function DataPage({
  locale,
  title,
  description,
  actions,
  meta,
  timesInUtc,
  toolbar,
  pagination,
  feedback,
  children,
}: {
  locale: Locale;
  title: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
  timesInUtc?: boolean;
  toolbar?: ReactNode;
  pagination?: ReactNode;
  feedback?: ReactNode;
  children: ReactNode;
}) {
  return (
    <SharedDataPage
      titleId="admin-data-page-title"
      title={<bdi>{title}</bdi>}
      {...(description ? { description } : {})}
      actions={actions}
      toolbar={toolbar}
      feedback={
        <>
          <ActionFeedbackNotice />
          {feedback}
        </>
      }
      pagination={pagination}
      meta={
        <>
          {meta}
          {timesInUtc ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock aria-hidden="true" className="size-3.5" />
              {say(locale, stateCopy.timesInUtc)}
            </span>
          ) : null}
        </>
      }
    >
      {children}
    </SharedDataPage>
  );
}
