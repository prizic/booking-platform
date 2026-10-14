import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import Link from "next/link";
import type { LinkRenderer, NavigationLinkProps } from "@wlbp/ui-foundation";
import { WorkspaceShellClient } from "./workspace-shell-client";
import { WorkspacePagination } from "./ui/workspace-pagination";
describe("Dashboard shell framework adapter", () => {
  it("forwards every anchor prop including mobile close handler and tooltip ref", () => {
    const shell = WorkspaceShellClient({
      brand: "Brand",
      groups: [],
      labels: {
        navigation: "Navigation",
        openMenu: "Open",
        closeMenu: "Close",
        skipToContent: "Skip",
      },
      sidebar: {
        cookieName: "wlbp-dashboard-sidebar",
        initialCollapsed: true,
        collapseLabel: "Collapse navigation",
        expandLabel: "Expand navigation",
      },
      children: "Body",
    }) as ReactElement<{
      renderLink: LinkRenderer;
      sidebar: { cookieName: string; initialCollapsed: boolean };
    }>;
    const click = vi.fn();
    const mouseEnter = vi.fn();
    const touchStart = vi.fn();
    const keyDown = vi.fn();
    const ref = vi.fn();
    const props = {
      href: "/ar/bookings",
      children: "Bookings",
      ref,
      onClick: click,
      onMouseEnter: mouseEnter,
      onTouchStart: touchStart,
      onKeyDown: keyDown,
      className: "nav-link",
      "aria-current": "page" as const,
      "aria-label": "Bookings",
      title: "Bookings",
      target: "_self",
      download: "report",
      "data-probe": "retained",
    } satisfies NavigationLinkProps & { "data-probe": string };
    const link = shell.props.renderLink(props);
    expect(link.type).toBe(Link);
    expect(link.props).toMatchObject(props);
    expect(shell.props.sidebar).toMatchObject({
      cookieName: "wlbp-dashboard-sidebar",
      initialCollapsed: true,
    });
  });
  it.each(["shell", "pagination"] as const)(
    "%s omits undefined Next handlers while preserving supplied anchor props",
    (adapter) => {
      const element = (
        adapter === "shell"
          ? WorkspaceShellClient({
              brand: "Brand",
              groups: [],
              labels: {
                navigation: "Navigation",
                openMenu: "Open",
                closeMenu: "Close",
                skipToContent: "Skip",
              },
              children: "Body",
            })
          : WorkspacePagination({
              locale: "en",
              path: "/en/bookings",
              query: { status: "confirmed" },
              page: 2,
              pageCount: 3,
              count: 60,
            })
      ) as ReactElement<{ renderLink: LinkRenderer }>;
      const ref = vi.fn();
      const keyDown = vi.fn();
      const props = {
        href: "/en/bookings?page=3&status=confirmed",
        children: "Next page",
        ref,
        onClick: undefined,
        onMouseEnter: undefined,
        onTouchStart: undefined,
        onKeyDown: keyDown,
        "aria-current": "page" as const,
        "aria-label": "Next page",
        className: "page-link",
      } satisfies NavigationLinkProps;
      const link = element.props.renderLink(props);
      expect(link.type).toBe(Link);
      expect(link.props).toMatchObject({
        href: props.href,
        children: props.children,
        ref,
        onKeyDown: keyDown,
        "aria-current": "page",
        "aria-label": "Next page",
        className: "page-link",
      });
      for (const handler of ["onClick", "onMouseEnter", "onTouchStart"])
        expect(link.props).not.toHaveProperty(handler);
      const handlers = {
        onClick: vi.fn(),
        onMouseEnter: vi.fn(),
        onTouchStart: vi.fn(),
      };
      expect(element.props.renderLink({ ...props, ...handlers }).props).toMatchObject(
        handlers,
      );
    },
  );
});
