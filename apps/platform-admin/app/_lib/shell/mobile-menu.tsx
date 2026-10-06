"use client";

import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/** Below 52rem the sidebar collapses behind an explicit disclosure button. */
export function MobileMenu(props: { label: string; children: ReactNode }) {
  return <Menu key={usePathname()} {...props} />;
}

function Menu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        ref={button}
        type="button"
        className="wlbp-button wlbp-button--secondary menu-toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
      </button>
      <div id={id} className={`console-menu${open ? " is-open" : ""}`}>
        {children}
      </div>
    </>
  );
}
