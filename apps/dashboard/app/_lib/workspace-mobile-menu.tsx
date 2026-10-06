"use client";
import { useRef, useState, type ReactNode } from "react";

export function WorkspaceMobileMenu({
  children,
  label,
  currentLabel,
}: {
  readonly children: ReactNode;
  readonly label: string;
  readonly currentLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  return (
    <div
      className="workspace-navigation"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          button.current?.focus();
        }
      }}
    >
      <button
        ref={button}
        type="button"
        className="workspace-menu-button wlbp-button wlbp-button--quiet"
        aria-expanded={open}
        aria-controls="workspace-menu"
        onClick={() => setOpen(!open)}
      >
        {label}: {currentLabel}
      </button>
      <div
        id="workspace-menu"
        className={open ? "workspace-menu is-open" : "workspace-menu"}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("a")) setOpen(false);
        }}
      >
        {children}
      </div>
    </div>
  );
}
