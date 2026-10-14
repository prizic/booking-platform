import { formatNumber } from "@wlbp/i18n";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WorkspacePagination } from "./workspace-pagination";

const render = (props: Parameters<typeof WorkspacePagination>[0]) =>
  renderToStaticMarkup(createElement(WorkspacePagination, props));

describe("workspace pagination labels", () => {
  it("keeps the full known page count label, truthful summary, and boundaries", () => {
    const html = render({
      locale: "en",
      path: "/en/bookings",
      query: { status: "confirmed" },
      page: 2,
      pageCount: 5,
      count: 25,
    });
    expect(html).toContain(`Page ${formatNumber(2, "en")} of ${formatNumber(5, "en")}`);
    expect(html).toContain("25 results in this read");
    expect(html).toContain('rel="prev"');
    expect(html).toContain('rel="next"');
  });

  it("shows the page number without an invented total in unknown-total mode", () => {
    const html = render({
      locale: "en",
      path: "/en/customers",
      query: { q: "sam" },
      page: 1,
      pageCount: 2,
      count: 25,
      unknownTotal: true,
    });
    expect(html).toContain(`Page ${formatNumber(1, "en")}`);
    expect(html).not.toContain(`of ${formatNumber(2, "en")}`);
    expect(html).toContain("25 results in this read");
    // Lookahead boundary: a known next page keeps its link and the filter.
    expect(html).toContain('rel="next"');
    expect(html).toContain("page=2");
    expect(html).toContain("q=sam");
  });

  it("keeps next/previous boundaries on the last page of unknown-total mode", () => {
    const html = render({
      locale: "en",
      path: "/en/customers",
      query: {},
      page: 3,
      pageCount: 3,
      count: 12,
      unknownTotal: true,
    });
    expect(html).toContain(`Page ${formatNumber(3, "en")}`);
    expect(html).not.toContain('rel="next"');
    expect(html).toContain('rel="prev"');
  });

  it("localizes the unknown-total label in Arabic without a total", () => {
    const html = render({
      locale: "ar",
      path: "/ar/customers",
      query: {},
      page: 2,
      pageCount: 3,
      count: 25,
      unknownTotal: true,
    });
    expect(html).toContain(`الصفحة ${formatNumber(2, "ar")}`);
    expect(html).not.toContain(`من ${formatNumber(3, "ar")}`);
  });
});
