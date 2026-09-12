import { describe, expect, it } from "vitest";

import { columnsOf, escapeCsvCell, renderCsv } from "./csv";

describe("escapeCsvCell", () => {
  it("leaves an ordinary value alone", () => {
    expect(escapeCsvCell("Downtown")).toBe("Downtown");
    expect(escapeCsvCell(42)).toBe("42");
  });

  it("renders null and undefined as empty rather than as words", () => {
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
  });

  it("quotes a value containing a comma, a quote, or a newline", () => {
    expect(escapeCsvCell("Riyadh, SA")).toBe('"Riyadh, SA"');
    expect(escapeCsvCell('He said "no"')).toBe('"He said ""no"""');
    expect(escapeCsvCell("line one\nline two")).toBe('"line one\nline two"');
  });

  it("neutralizes a spreadsheet formula", () => {
    // A customer typing this into a booking note must not get code execution on
    // the machine of whoever opens the export.
    expect(escapeCsvCell('=HYPERLINK("http://evil.invalid")')).toBe(
      '"\'=HYPERLINK(""http://evil.invalid"")"',
    );
    expect(escapeCsvCell("+1")).toBe("'+1");
    expect(escapeCsvCell("-1")).toBe("'-1");
    expect(escapeCsvCell("@SUM(A1)")).toBe("'@SUM(A1)");
  });

  it("puts the guard inside the quotes, where a spreadsheet sees it", () => {
    const cell = escapeCsvCell("=1,2");
    expect(cell.startsWith("\"'")).toBe(true);
  });

  it("does not mistake a negative number for a formula it should mangle twice", () => {
    expect(escapeCsvCell(-5)).toBe("'-5");
  });
});

describe("renderCsv", () => {
  const rows = [
    { bookings: 12, location: "Downtown", rate: "50%" },
    { bookings: 3, location: "Riyadh, SA", rate: "10%" },
  ];

  it("writes the header from the column list, not from the first row", () => {
    // A row missing a key must still produce a cell, or the columns shift.
    const csv = renderCsv(["location", "bookings", "missing"], rows);
    expect(csv.split("\r\n")[0]).toBe("location,bookings,missing");
    expect(csv.split("\r\n")[1]).toBe("Downtown,12,");
  });

  it("quotes inside the body", () => {
    const csv = renderCsv(["location", "bookings"], rows);
    expect(csv).toContain('"Riyadh, SA",3');
  });

  it("ends with a newline, because a file without one loses its last record", () => {
    expect(renderCsv(["location"], rows).endsWith("\r\n")).toBe(true);
  });

  it("renders an empty result as a header and nothing else", () => {
    expect(renderCsv(["location"], [])).toBe("location\r\n");
  });
});

describe("columnsOf", () => {
  it("is stable regardless of key order", () => {
    expect(columnsOf([{ b: 1, a: 2 }, { c: 3 }])).toEqual(["a", "b", "c"]);
  });

  it("is empty for no rows", () => {
    expect(columnsOf([])).toEqual([]);
  });
});
