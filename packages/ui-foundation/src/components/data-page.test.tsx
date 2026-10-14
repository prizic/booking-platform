import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./button.js";
import {
  DataPage,
  DataPagination,
  DataTable,
  ErrorState,
  FilterBar,
  FilterField,
  LoadingState,
  StatusBadge,
  SuccessState,
} from "./data-page.js";
import { Input } from "./form-controls.js";
import { EmptyState } from "./patterns.js";

describe("shared data pattern (R13/R16)", () => {
  it("keeps the header, filters, feedback, body, and pagination in reading order", () => {
    const html = renderToStaticMarkup(
      <DataPage
        title="Records"
        titleId="records-title"
        toolbar={<div>Filter controls</div>}
        feedback={<SuccessState title="Saved" />}
        pagination={<nav aria-label="Pagination">Page controls</nav>}
      >
        <div>Record list</div>
      </DataPage>,
    );
    expect(html.indexOf("Records")).toBeLessThan(html.indexOf("Filter controls"));
    expect(html.indexOf("Filter controls")).toBeLessThan(html.indexOf("Saved"));
    expect(html.indexOf("Saved")).toBeLessThan(html.indexOf("Record list"));
    expect(html.indexOf("Record list")).toBeLessThan(html.indexOf("Page controls"));
    expect(html).toContain('aria-labelledby="records-title"');
    expect(html).toContain('role="status"');
  });

  it("distinguishes a failed read with explicit retry from a successful empty result", () => {
    const retry = vi.fn();
    const failed = renderToStaticMarkup(
      <ErrorState
        title="Could not load"
        description="Try again"
        retry={<Button onClick={retry}>Retry</Button>}
      />,
    );
    const empty = renderToStaticMarkup(
      <EmptyState title="No records" description="Change the filters" />,
    );
    expect(failed).toContain('role="alert"');
    expect(failed).toContain(">Retry</button>");
    expect(empty).toContain('data-slot="empty-state"');
    expect(empty).not.toContain('role="alert"');
    expect(empty).not.toContain("Retry");
    expect(retry).not.toHaveBeenCalled();
    const loading = renderToStaticMarkup(<LoadingState label="Loading records" />);
    expect(loading).toContain('role="status"');
    expect(loading).toContain("Loading records");
    expect(loading).toContain('aria-hidden="true"');
  });

  it("names filter controls and preserves app-owned GET parameters", () => {
    const html = renderToStaticMarkup(
      <FilterBar
        label="Filter bookings"
        action="/ar/bookings"
        actions={<Button type="submit">Apply</Button>}
      >
        <input type="hidden" name="location" value="north" />
        <FilterField label="Search" htmlFor="booking-search">
          <Input id="booking-search" name="q" defaultValue="sample" />
        </FilterField>
      </FilterBar>,
    );
    expect(html).toContain('method="get"');
    expect(html).toContain('aria-label="Filter bookings"');
    expect(html).toContain('for="booking-search"');
    expect(html).toContain('id="booking-search"');
    expect(html).toContain('name="location" value="north"');
    expect(html).toContain('type="submit"');
  });

  it("provides captions, sort state, and mobile labelled cells without unlabelled action columns", () => {
    const html = renderToStaticMarkup(
      <DataTable
        id="records"
        caption="Booking records"
        columns={[
          { key: "reference", label: "Reference", sort: "reference" },
          { key: "status", label: "Status" },
          { key: "actions", label: "Actions", kind: "actions" },
        ]}
        rows={[
          {
            key: "synthetic",
            cells: [
              "B-123",
              <StatusBadge key="status" label="Pending" tone="warning" />,
              <Button key="action">Inspect B-123</Button>,
            ],
          },
        ]}
        sort="reference"
        sortHref={(sort) => `/en/bookings?location=north&sort=${sort}`}
        sortLabel={(column, next) => `Sort ${column.label} ${next}`}
        renderLink={(props) => <a {...props} data-app-link="true" />}
      />,
    );
    expect(html).toContain('aria-labelledby="records-caption"');
    expect(html).toContain("<caption");
    expect(html).toContain('aria-sort="ascending"');
    expect(html).toContain('href="/en/bookings?location=north&amp;sort=-reference"');
    expect(html).toContain('aria-label="Sort Reference descending"');
    expect(html).toContain('data-app-link="true"');
    expect(html).toContain('<dt class="text-muted-foreground">Status</dt>');
    expect(html).toContain('class="sr-only">Actions</span>');
    expect(html).toContain("Pending");
    expect(html).toContain("Inspect B-123");
  });

  it("makes the first/last page boundaries non-navigable and exposes current page counts", () => {
    const props = {
      label: "Pagination",
      summary: "1–10 of 20 results",
      pageLabel: "Page 1 of 2",
      page: 1,
      pageCount: 2,
      previousLabel: "Previous",
      nextLabel: "Next",
      previousHref: "/records?page=0",
      nextHref: "/records?status=pending&page=2",
    };
    const first = renderToStaticMarkup(<DataPagination {...props} />);
    expect(first).not.toContain('href="/records?page=0"');
    expect(first).toContain('disabled=""');
    expect(first).toContain('aria-current="page"');
    expect(first).toContain("Page 1 of 2");
    expect(first).toContain('href="/records?status=pending&amp;page=2"');
    const last = renderToStaticMarkup(
      <DataPagination
        {...props}
        page={2}
        pageLabel="Page 2 of 2"
        previousHref="/records?page=1"
        nextHref="/records?page=3"
      />,
    );
    expect(last).not.toContain('href="/records?page=3"');
    expect(last).toContain('rel="prev"');
  });
});
