import { describe, expect, it } from "vitest";
import { pageHref, paginateRows } from "./data-page-query";
describe("workspace page query", () => {
  it("clamps malformed, negative and out-of-range pages against the current filtered read", () => {
    const rows = Array.from({ length: 51 }, (_, index) => index);
    expect(paginateRows(rows, { page: "999" })).toMatchObject({
      page: 3,
      pageCount: 3,
      rows: [50],
    });
    for (const page of ["-1", "NaN", "0", "9000000"])
      expect(paginateRows(rows, { page }).page).toBe(1);
    expect(paginateRows([], { page: "2" })).toMatchObject({
      page: 1,
      pageCount: 1,
      count: 0,
      rows: [],
    });
  });
  it("preserves URL filters and sort while removing an old mutation result", () => {
    const url = new URL(
      pageHref(
        "/ar/services",
        { status: "draft", sort: "name", result: "saved", page: "9" },
        2,
      ),
      "https://example.invalid",
    );
    expect(url.pathname).toBe("/ar/services");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      status: "draft",
      sort: "name",
      page: "2",
    });
  });
});
