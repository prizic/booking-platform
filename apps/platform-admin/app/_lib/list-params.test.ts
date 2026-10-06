import { describe, expect, it } from "vitest";
import { listHref, parseListParams } from "./list-params";

const spec = {
  sorts: ["name", "-name", "-created"],
  defaultSort: "-created",
  filters: { status: ["active", "suspended"], tenant: "uuid", from: "date" },
  pageSize: 25,
} as const;

describe("parseListParams", () => {
  it("keeps valid values and computes the offset", () => {
    const p = parseListParams(
      { q: "  north ", page: "3", sort: "name", status: "active" },
      spec,
    );
    expect(p).toMatchObject({
      q: "north",
      page: 3,
      sort: "name",
      offset: 50,
      filters: { status: "active" },
    });
  });
  it("drops anything not allow-listed", () => {
    const p = parseListParams(
      {
        page: "-4",
        sort: "drop table",
        status: "deleted",
        tenant: "not-a-uuid",
        from: "2026-13-40",
        extra: "x",
      },
      spec,
    );
    expect(p).toMatchObject({ page: 1, sort: "-created", filters: {} });
  });
  it("accepts a uuid and a civil date", () => {
    const p = parseListParams(
      { tenant: "A0000000-0000-0000-0000-000000000001", from: "2026-10-06" },
      spec,
    );
    expect(p.filters).toEqual({
      tenant: "a0000000-0000-0000-0000-000000000001",
      from: "2026-10-06",
    });
  });
  it("caps search length and uses the first repeated value", () => {
    expect(parseListParams({ q: ["a".repeat(300), "b"] }, spec).q).toHaveLength(100);
  });
});

describe("listHref", () => {
  it("omits defaults and resets the page when filters change", () => {
    const p = parseListParams({ q: "x", page: "4", status: "active" }, spec);
    expect(listHref("/en/tenants", p, { filters: { status: "suspended" } })).toBe(
      "/en/tenants?q=x&status=suspended",
    );
    expect(listHref("/en/tenants", p, { page: 5 })).toBe(
      "/en/tenants?q=x&status=active&page=5",
    );
    expect(listHref("/en/tenants", parseListParams({}, spec))).toBe("/en/tenants");
  });
});
