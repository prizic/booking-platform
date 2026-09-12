/**
 * Issue #24. Rendering report rows to CSV.
 *
 * Two separate problems, both of which have bitten real products:
 *
 * 1. **Quoting.** A value containing a comma, a quote, or a newline has to be
 *    quoted and its quotes doubled, or the file silently shifts columns.
 * 2. **Formula injection.** A spreadsheet treats a cell starting with `=`, `+`,
 *    `-`, `@`, tab or carriage return as a formula. A customer who types
 *    `=HYPERLINK(...)` into a booking note should not get code execution on the
 *    machine of whoever opens the export. The cell is prefixed with a single
 *    quote, which spreadsheets strip on display and which keeps the value
 *    readable to a parser.
 *
 * The header row is the machine-readable contract, so it is written from the
 * column list rather than from whatever keys the first row happens to have.
 */

const dangerousLeadingCharacters = new Set(["=", "+", "-", "@", "\t", "\r"]);

export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = typeof value === "string" ? value : String(value);
  // Neutralize the formula before quoting, so the prefix ends up inside the
  // quotes where a spreadsheet will actually see it.
  const guarded =
    raw.length > 0 && dangerousLeadingCharacters.has(raw[0] ?? "") ? `'${raw}` : raw;
  if (!/[",\n\r]/u.test(guarded)) return guarded;
  return `"${guarded.replaceAll('"', '""')}"`;
}

export function renderCsv(
  columns: readonly string[],
  rows: readonly Readonly<Record<string, unknown>>[],
): string {
  const header = columns.map(escapeCsvCell).join(",");
  const body = rows.map((row) =>
    columns.map((column) => escapeCsvCell(row[column])).join(","),
  );
  // A trailing newline, because a file without one is a file some tools read as
  // missing its last record.
  return [header, ...body].join("\r\n") + "\r\n";
}

/**
 * The columns of an export, in a stable order. Taken from the first row's keys
 * so a report gaining a column does not need a second place to be told, but
 * sorted so the order never depends on jsonb key ordering.
 */
export function columnsOf(
  rows: readonly Readonly<Record<string, unknown>>[],
): readonly string[] {
  const seen = new Set<string>();
  for (const row of rows) for (const key of Object.keys(row)) seen.add(key);
  return [...seen].sort();
}
