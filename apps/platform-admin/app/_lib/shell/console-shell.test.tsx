import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/navigation", () => ({ usePathname: () => "/ar/review" }));
import { ConsoleShell } from "./console-shell";
import { getNavigation } from "../navigation";
import { say, shellCopy } from "../copy";
describe("private console navigation composition", () => {
  it("retains current Review semantics and named collapse controls in Arabic", () => {
    const html = renderToStaticMarkup(
      <ConsoleShell
        locale="ar"
        brand={<a href="/ar">أطلس</a>}
        groups={getNavigation("ar")}
        topbar={<a href="/ar/account">حسابك</a>}
        sidebar={{
          initialCollapsed: true,
          cookieName: "wlbp-admin-sidebar",
          collapseLabel: say("ar", shellCopy.collapse),
          expandLabel: say("ar", shellCopy.expand),
        }}
        labels={{
          navigation: say("ar", shellCopy.navigation),
          openMenu: say("ar", shellCopy.menu),
          closeMenu: say("ar", shellCopy.closeMenu),
          skipToContent: say("ar", shellCopy.skip),
        }}
      >
        المحتوى
      </ConsoleShell>,
    );
    expect(html).toContain('href="/ar/review"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("توسيع الشريط الجانبي");
    expect(html).toContain('href="/ar/account"');
  });
});
