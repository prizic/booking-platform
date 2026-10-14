import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AppShell } from "./app-shell.js";
import type { LinkRenderer } from "./navigation-link.js";

const labels = {
  navigation: "Workspace navigation",
  openMenu: "Open menu",
  closeMenu: "Close menu",
  skipToContent: "Skip to content",
};
const groups = [
  {
    label: "Operations",
    items: [{ href: "/en/bookings", label: "Bookings", current: true, badge: 3 }],
  },
];

describe("AppShell navigation composition (R6/R14)", () => {
  it("forwards link behavior and accessible props to the app's renderer", () => {
    const renderLink: LinkRenderer = (props) => (
      <a {...props} data-app-link="client-navigation" />
    );
    const html = renderToStaticMarkup(
      <AppShell
        brand="Business"
        labels={labels}
        groups={groups}
        renderLink={renderLink}
      >
        Records
      </AppShell>,
    );
    expect(html).toContain('data-app-link="client-navigation"');
    expect(html).toContain('href="/en/bookings"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('id="main-content"');
  });

  it("retains default anchors and an expanded desktop rail for existing consumers", () => {
    const html = renderToStaticMarkup(
      <AppShell brand="Business" labels={labels} groups={groups}>
        Records
      </AppShell>,
    );
    expect(html).toContain('<a href="/en/bookings"');
    expect(html).toContain('data-sidebar-collapsed="false"');
    expect(html).not.toContain('aria-label="Collapse navigation"');
  });
});

describe("AppShell server-resolved collapse (R11)", () => {
  it("renders a compact accessible rail on the first byte without hidden brand/footer links", () => {
    const html = renderToStaticMarkup(
      <AppShell
        brand={<a href="/en">Expanded brand</a>}
        railFooter={<a href="/en/account">Expanded footer</a>}
        labels={labels}
        groups={groups}
        sidebar={{
          initialCollapsed: true,
          collapseLabel: "Collapse navigation",
          expandLabel: "Expand navigation",
          collapsedBrand: <span>Compact brand</span>,
        }}
      >
        Records
      </AppShell>,
    );
    expect(html).toContain('data-sidebar-collapsed="true"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Expand navigation"');
    const controls = html.match(/aria-controls="([^"]+)"/u)?.[1];
    expect(controls).toBeTruthy();
    expect(html).toContain(`id="${controls}"`);
    expect(html).toContain('aria-current="page"');
    expect(html).toMatch(/class="sr-only">Bookings<\/span>/u);
    expect(html).toContain("Compact brand");
    expect(html).not.toContain("Expanded footer");
    expect(html).not.toContain("Expanded brand");
  });

  it("uses caller-provided Arabic names with the same layout and current-item semantics", () => {
    const html = renderToStaticMarkup(
      <AppShell
        brand="المنشأة"
        labels={{
          navigation: "التنقل",
          openMenu: "فتح القائمة",
          closeMenu: "إغلاق القائمة",
          skipToContent: "الانتقال إلى المحتوى",
        }}
        groups={[
          { items: [{ href: "/ar/bookings", label: "الحجوزات", current: true }] },
        ]}
        sidebar={{
          collapseLabel: "طي قائمة التنقل",
          expandLabel: "توسيع قائمة التنقل",
        }}
      >
        السجلات
      </AppShell>,
    );
    expect(html).toContain('aria-label="طي قائمة التنقل"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('aria-label="فتح القائمة"');
    expect(html).toContain("border-e");
  });
});
