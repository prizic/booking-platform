"use client";

import { Menu } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { cn } from "../lib/cn.js";
import { Button } from "./button.js";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "./overlays.js";

export interface ShellNavItem {
  readonly href: string;
  readonly label: string;
  readonly icon?: ReactNode;
  readonly current?: boolean;
  /** Short count or status shown at the item's end, e.g. pending requests. */
  readonly badge?: ReactNode;
}

export interface ShellNavGroup {
  readonly label?: string;
  readonly items: readonly ShellNavItem[];
}

export interface AppShellLabels {
  readonly navigation: string;
  readonly openMenu: string;
  readonly closeMenu: string;
  readonly skipToContent: string;
}

function NavList({
  groups,
  onNavigate,
}: {
  groups: readonly ShellNavGroup[];
  onNavigate?: () => void;
}) {
  return (
    <div className="grid gap-6">
      {groups.map((group, index) => (
        <div key={group.label ?? index} className="grid gap-1">
          {group.label ? (
            <p className="px-3 pb-1 text-xs font-semibold text-rail-muted">
              {group.label}
            </p>
          ) : null}
          <ul className="grid gap-0.5">
            {group.items.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  aria-current={item.current ? "page" : undefined}
                  onClick={onNavigate}
                  className="group/nav relative flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-rail-muted transition-colors outline-none hover:bg-rail-accent hover:text-rail-foreground focus-visible:ring-[3px] focus-visible:ring-ring/60 aria-[current=page]:bg-rail-accent aria-[current=page]:font-semibold aria-[current=page]:text-rail-foreground [&_svg]:size-[1.125rem] [&_svg]:shrink-0"
                >
                  {item.icon}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.badge !== undefined ? (
                    <span className="rounded-full bg-primary px-2 text-xs leading-5 font-bold text-primary-foreground [font-variant-numeric:tabular-nums]">
                      {item.badge}
                    </span>
                  ) : null}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * Workspace frame shared by Dashboard and Platform Admin: a charcoal rail on
 * the inline-start edge (right in Arabic), a sticky top bar, and a sheet menu
 * on narrow screens. The active destination is marked by its fill alone.
 */
export function AppShell({
  brand,
  groups,
  railFooter,
  sheetFooter,
  topbar,
  mobileBrand,
  labels,
  children,
  contentClassName,
}: {
  brand: ReactNode;
  /** Compact brand for the top bar below the lg breakpoint (light ground). */
  mobileBrand?: ReactNode;
  groups: readonly ShellNavGroup[];
  railFooter?: ReactNode;
  /** Footer shown only in the narrow-screen menu sheet (e.g. account links the top bar shows at lg+). */
  sheetFooter?: ReactNode;
  topbar?: ReactNode;
  labels: AppShellLabels;
  children: ReactNode;
  contentClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 64rem)");
    const close = () => media.matches && setOpen(false);
    media.addEventListener("change", close);
    return () => media.removeEventListener("change", close);
  }, []);

  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:start-3 focus:top-3"
      >
        {labels.skipToContent}
      </a>

      <aside className="sticky top-0 hidden h-dvh flex-col bg-rail text-rail-foreground [--ring:var(--rail-ring)] lg:flex">
        <div className="mx-5 flex h-16 shrink-0 items-center border-b border-rail-accent">
          {brand}
        </div>
        <nav
          aria-label={labels.navigation}
          className="min-h-0 flex-1 overflow-y-auto px-3 py-5 [scrollbar-color:var(--rail-accent)_transparent]"
        >
          <NavList groups={groups} />
        </nav>
        {railFooter ? (
          <div className="shrink-0 border-t border-rail-accent p-3">{railFooter}</div>
        ) : null}
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur-sm supports-[backdrop-filter]:bg-background/75 md:px-6">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label={labels.openMenu}
              >
                <Menu aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent closeLabel={labels.closeMenu} aria-describedby={undefined}>
              <SheetTitle className="sr-only">{labels.navigation}</SheetTitle>
              <div className="flex h-12 items-center border-b border-rail-accent pe-10">
                {brand}
              </div>
              <nav
                aria-label={labels.navigation}
                className="-mx-1 min-h-0 flex-1 overflow-y-auto p-1"
              >
                <NavList groups={groups} onNavigate={() => setOpen(false)} />
              </nav>
              {railFooter || sheetFooter ? (
                <div className="grid gap-1 border-t border-rail-accent pt-3">
                  {railFooter}
                  {sheetFooter}
                </div>
              ) : null}
            </SheetContent>
          </Sheet>
          {mobileBrand ? (
            <div className="min-w-0 shrink lg:hidden">{mobileBrand}</div>
          ) : null}
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            {topbar}
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className={cn(
            "mx-auto grid w-full max-w-[92rem] min-w-0 content-start gap-8 px-4 py-6 outline-none md:px-8 md:py-8",
            contentClassName,
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
