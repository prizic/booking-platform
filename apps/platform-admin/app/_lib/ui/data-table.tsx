import type { Locale } from "@wlbp/i18n";
import { createTranslator, workspaceMessages } from "@wlbp/i18n";
import {
  DataTable as SharedDataTable,
  type DataColumn,
  type DataRow,
} from "@wlbp/ui-foundation";
import { renderOperatorLink } from "./navigation-link";

export type Column = {
  label: string;
  sort?: string;
  numeric?: boolean;
  kind?: "data" | "actions";
};

/** Private column formatting and URL ownership; presentation belongs to the foundation. */
export function DataTable({
  locale,
  columns,
  ...props
}: {
  id: string;
  locale: Locale;
  caption: string;
  columns: readonly Column[];
  rows: readonly DataRow[];
  sort?: string;
  sortHref?: (sort: string) => string;
}) {
  const t = createTranslator(locale, workspaceMessages[locale]);
  const mapped: DataColumn[] = columns.map((column, index) => ({
    key: String(index),
    label: column.label || t("workspace.actions"),
    kind: column.kind ?? (column.label ? "data" : "actions"),
    ...(column.sort ? { sort: column.sort } : {}),
    ...(column.numeric ? { className: "text-end whitespace-nowrap" } : {}),
  }));
  return (
    <SharedDataTable
      {...props}
      columns={mapped}
      renderLink={renderOperatorLink}
      sortLabel={(column, next) =>
        t(
          next === "ascending" ? "workspace.sortAscending" : "workspace.sortDescending",
          { column: column.label },
        )
      }
    />
  );
}
