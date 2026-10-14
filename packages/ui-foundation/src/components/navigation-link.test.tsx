import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { NavigationLink, type NavigationLinkProps } from "./navigation-link.js";

describe("framework-neutral navigation link contract (R6/R14)", () => {
  it("preserves anchor refs, events, accessible names and current state for an app adapter", () => {
    const ref = createRef<HTMLAnchorElement>();
    const onClick = vi.fn();
    const onKeyDown = vi.fn();
    const onMouseEnter = vi.fn();
    const onTouchStart = vi.fn();
    const props: NavigationLinkProps = {
      href: "/ar/bookings?status=requested",
      children: "الحجوزات",
      ref,
      onClick,
      onKeyDown,
      onMouseEnter,
      onTouchStart,
      className: "workspace-link",
      "aria-label": "الحجوزات المطلوبة",
      "aria-current": "page",
      target: "_blank",
      rel: "noopener",
    };
    const renderLink = vi.fn((received: NavigationLinkProps) => <a {...received} />);

    NavigationLink({ ...props, renderLink });

    expect(renderLink).toHaveBeenCalledExactlyOnceWith(props);
    expect(onClick).not.toHaveBeenCalled();
    expect(onKeyDown).not.toHaveBeenCalled();
    expect(onMouseEnter).not.toHaveBeenCalled();
    expect(onTouchStart).not.toHaveBeenCalled();
  });

  it("keeps the native anchor and its behavior when no renderer is supplied", () => {
    const ref = createRef<HTMLAnchorElement>();
    const onClick = vi.fn();
    const link = NavigationLink({
      href: "/en/bookings",
      children: "Bookings",
      ref,
      onClick,
      "aria-current": "page",
    });

    expect(link.type).toBe("a");
    expect(link.props).toMatchObject({
      href: "/en/bookings",
      children: "Bookings",
      ref,
      onClick,
      "aria-current": "page",
    });
    expect(onClick).not.toHaveBeenCalled();
  });
});
