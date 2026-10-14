import { isValidElement, type ComponentProps } from "react";
import Link from "next/link";
import { describe, expect, it, vi } from "vitest";
import { renderOperatorLink } from "./navigation-link";

describe("private Next navigation adapter", () => {
  it("omits undefined Next event props and keeps all other anchor attributes", () => {
    const element = renderOperatorLink({
      href: "/ar/review/job/record",
      children: "المراجعة",
      className: "text-start",
      "aria-current": "page",
      "aria-label": "فتح المراجعة",
      target: "_self",
      dir: "rtl",
      onClick: undefined,
      onMouseEnter: undefined,
      onTouchStart: undefined,
    });
    expect(element.type).toBe(Link);
    expect(element.props).toMatchObject({
      href: "/ar/review/job/record",
      children: "المراجعة",
      className: "text-start",
      "aria-current": "page",
      "aria-label": "فتح المراجعة",
      target: "_self",
      dir: "rtl",
    });
    for (const name of ["onClick", "onMouseEnter", "onTouchStart"])
      expect(element.props).not.toHaveProperty(name);
  });

  it("forwards refs and the exact supplied click, hover, touch and focus handlers", () => {
    const ref = vi.fn();
    const onClick = vi.fn();
    const onMouseEnter = vi.fn();
    const onTouchStart = vi.fn();
    const onFocus = vi.fn();
    const element = renderOperatorLink({
      href: "/en/tenants?page=2",
      children: "Tenants",
      ref,
      onClick,
      onMouseEnter,
      onTouchStart,
      onFocus,
    });
    if (!isValidElement<ComponentProps<typeof Link>>(element))
      throw new Error("The navigation adapter must return a Next Link element");
    expect(element.props.ref).toBe(ref);
    expect(element.props.onClick).toBe(onClick);
    expect(element.props.onMouseEnter).toBe(onMouseEnter);
    expect(element.props.onTouchStart).toBe(onTouchStart);
    expect(element.props.onFocus).toBe(onFocus);
  });
});
