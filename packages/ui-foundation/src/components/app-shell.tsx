"use client";

import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";

import { cn } from "../lib/cn.js";
import { preferenceCookie, SIDEBAR_COOKIE } from "../preferences.js";
import { Button } from "./button.js";
import { NavigationLink, type LinkRenderer } from "./navigation-link.js";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./overlays.js";

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

export interface AppShellSidebarOptions {
  /** Server-resolved cookie choice. The same value must reach first hydration. */
  readonly initialCollapsed?: boolean;
  readonly collapseLabel: string;
  readonly expandLabel: string;
  /** Compact, accessible brand/footer. Expanded content is unmounted when collapsed. */
  readonly collapsedBrand?: ReactNode;
  readonly collapsedFooter?: ReactNode;
  /** Optional per-workspace name; read this same cookie on the server. */
  readonly cookieName?: string;
  /** Defaults to true. Cookie writes happen only on explicit user choice. */
  readonly persist?: boolean;
  readonly onCollapsedChange?: (collapsed: boolean) => void;
}

function NavList({
  groups,
  onNavigate,
  collapsed = false,
  renderLink,
}: {
  groups: readonly ShellNavGroup[];
  onNavigate?: () => void;
  collapsed?: boolean;
  renderLink?: LinkRenderer;
}) {
  return (
    <div className="grid gap-6">
      {groups.map((group, index) => (
        <div key={group.label ?? index} className="grid gap-1">
          {group.label ? (
            <p
              className={cn(
                "px-3 pb-1 text-xs font-semibold text-rail-muted",
                collapsed && "sr-only",
              )}
            >
              {group.label}
            </p>
          ) : null}
          <ul className="grid gap-0.5">
            {group.items.map((item) => {
              const link = (
                <NavigationLink
                  {...(renderLink !== undefined ? { renderLink } : {})}
                  href={item.href}
                  aria-current={item.current ? "page" : undefined}
                  onClick={onNavigate}
                  className={cn(
                    "group/nav relative flex min-h-11 items-center gap-3 rounded-md border-s-2 border-transparent px-3 text-sm font-medium text-rail-muted transition-colors outline-none hover:bg-rail-accent hover:text-rail-foreground focus-visible:ring-[3px] focus-visible:ring-ring aria-[current=page]:border-rail-foreground aria-[current=page]:bg-rail-accent aria-[current=page]:font-semibold aria-[current=page]:text-rail-foreground [&_svg]:size-[1.125rem] [&_svg]:shrink-0",
                    collapsed && "justify-center px-2",
                  )}
                >
                  <span aria-hidden="true" className="shrink-0">
                    {item.icon ?? (collapsed ? Array.from(item.label)[0] : null)}
                  </span>
                  <span className={collapsed ? "sr-only" : "min-w-0 flex-1 truncate"}>
                    {item.label}
                  </span>
                  {item.badge !== undefined ? (
                    <span
                      className={
                        collapsed
                          ? "sr-only"
                          : "rounded-full bg-primary px-2 text-xs leading-5 font-bold text-primary-foreground [font-variant-numeric:tabular-nums]"
                      }
                    >
                      {item.badge}
                    </span>
                  ) : null}
                </NavigationLink>
              );
              return (
                <li key={item.href}>
                  {collapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="top">
                        {item.label}
                        {item.badge !== undefined ? <> · {item.badge}</> : null}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    link
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

export interface AppShellProps {
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
  renderLink?: LinkRenderer;
  /** Opt-in keeps the existing expanded shell API compatible. */
  sidebar?: AppShellSidebarOptions;
}

/**
 * Semantic rail on the inline-start edge, a sticky top bar, and an independent
 * mobile sheet. Supply renderLink in an app-owned client wrapper for SPA navigation.
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
  renderLink,
  sidebar,
}: AppShellProps) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(sidebar?.initialCollapsed ?? false);
  const navigationId = useId();
  const desktopCollapsed = sidebar !== undefined && collapsed;
  const toggleSidebar = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (sidebar?.persist !== false) {
      const requestedName = sidebar?.cookieName ?? SIDEBAR_COOKIE;
      const cookieName = /^[a-zA-Z0-9_-]+$/u.test(requestedName)
        ? requestedName
        : SIDEBAR_COOKIE;
      try {
        document.cookie = preferenceCookie(cookieName, next ? "collapsed" : "expanded");
      } catch {
        // A blocked preference cookie must never disable navigation.
      }
    }
    sidebar?.onCollapsedChange?.(next);
  };
  useEffect(() => {
    const media = window.matchMedia("(min-width: 64rem)");
    const close = () => media.matches && setOpen(false);
    media.addEventListener("change", close);
    return () => media.removeEventListener("change", close);
  }, []);

  return (
    <TooltipProvider delayDuration={250}>
      <div
        data-slot="app-shell"
        data-sidebar-collapsed={desktopCollapsed}
        className={cn(
          "min-h-dvh bg-background lg:grid",
          desktopCollapsed
            ? "lg:grid-cols-[4.5rem_minmax(0,1fr)]"
            : "lg:grid-cols-[16.5rem_minmax(0,1fr)]",
        )}
      >
        <a
          href="#main-content"
          className="sr-only z-50 rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:start-3 focus:top-3"
        >
          {labels.skipToContent}
        </a>

        <aside className="sticky top-0 hidden h-dvh min-w-0 flex-col border-e bg-rail text-rail-foreground [--ring:var(--rail-ring)] lg:flex">
          <div
            className={cn(
              "flex min-h-16 shrink-0 items-center border-b border-rail-accent",
              desktopCollapsed ? "mx-2 justify-center" : "mx-5",
            )}
          >
            {desktopCollapsed ? sidebar?.collapsedBrand : brand}
          </div>
          {sidebar ? (
            <div className="shrink-0 px-2 pt-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="rail"
                    className={cn("w-full", desktopCollapsed && "justify-center px-0")}
                    aria-label={
                      desktopCollapsed ? sidebar.expandLabel : sidebar.collapseLabel
                    }
                    aria-expanded={!desktopCollapsed}
                    aria-controls={navigationId}
                    onClick={toggleSidebar}
                  >
                    {desktopCollapsed ? (
                      <PanelLeftOpen aria-hidden="true" className="rtl:-scale-x-100" />
                    ) : (
                      <PanelLeftClose aria-hidden="true" className="rtl:-scale-x-100" />
                    )}
                    <span className={desktopCollapsed ? "sr-only" : "truncate"}>
                      {desktopCollapsed ? sidebar.expandLabel : sidebar.collapseLabel}
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {desktopCollapsed ? sidebar.expandLabel : sidebar.collapseLabel}
                </TooltipContent>
              </Tooltip>
            </div>
          ) : null}
          <nav
            id={navigationId}
            aria-label={labels.navigation}
            className={cn(
              "min-h-0 flex-1 overflow-x-hidden overflow-y-auto py-5 [scrollbar-color:var(--rail-accent)_transparent]",
              desktopCollapsed ? "px-2" : "px-3",
            )}
          >
            <NavList
              groups={groups}
              collapsed={desktopCollapsed}
              {...(renderLink !== undefined ? { renderLink } : {})}
            />
          </nav>
          {(desktopCollapsed ? sidebar?.collapsedFooter : railFooter) ? (
            <div className="shrink-0 border-t border-rail-accent p-3">
              {desktopCollapsed ? sidebar?.collapsedFooter : railFooter}
            </div>
          ) : null}
        </aside>

        <div className="flex min-w-0 flex-col">
          <header className="sticky top-0 z-30 flex min-h-16 flex-wrap items-center gap-3 border-b bg-background/90 px-4 py-2 backdrop-blur-sm supports-[backdrop-filter]:bg-background/75 md:px-6">
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
                  <NavList
                    groups={groups}
                    {...(renderLink !== undefined ? { renderLink } : {})}
                    onNavigate={() => setOpen(false)}
                  />
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
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
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
    </TooltipProvider>
  );
}
