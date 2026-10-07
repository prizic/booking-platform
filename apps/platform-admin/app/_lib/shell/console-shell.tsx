"use client";

import type { Locale } from "@wlbp/i18n";
import { AppShell, type AppShellLabels, type ShellNavGroup } from "@wlbp/ui-foundation";
import {
  Activity,
  Boxes,
  Building2,
  CreditCard,
  Globe,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  Package,
  Rocket,
  ScrollText,
  Settings,
  Users,
  Wrench,
  Layers,
} from "lucide-react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { isActive, type NavItemKey } from "../navigation";

const icons: Record<NavItemKey, ReactNode> = {
  overview: <LayoutDashboard aria-hidden="true" />,
  tenants: <Building2 aria-hidden="true" />,
  instances: <Boxes aria-hidden="true" />,
  domains: <Globe aria-hidden="true" />,
  provisioning: <Wrench aria-hidden="true" />,
  jobs: <ListChecks aria-hidden="true" />,
  plans: <Layers aria-hidden="true" />,
  subscriptions: <CreditCard aria-hidden="true" />,
  releases: <Package aria-hidden="true" />,
  rollouts: <Rocket aria-hidden="true" />,
  health: <Activity aria-hidden="true" />,
  support: <LifeBuoy aria-hidden="true" />,
  operators: <Users aria-hidden="true" />,
  audit: <ScrollText aria-hidden="true" />,
  settings: <Settings aria-hidden="true" />,
};

export type ConsoleNavGroup = {
  group: string;
  label: string;
  items: { key: NavItemKey; href: string; label: string }[];
};

/**
 * The console frame: the foundation AppShell with the current page marked in
 * the grouped navigation (rail on wide screens, sheet menu on narrow ones).
 */
export function ConsoleShell({
  locale,
  brand,
  mobileBrand,
  sheetFooter,
  groups,
  topbar,
  labels,
  children,
}: {
  locale: Locale;
  brand: ReactNode;
  /** Compact light-ground brand for the top bar below the lg breakpoint. */
  mobileBrand?: ReactNode;
  /** Shown only in the narrow-screen menu sheet. */
  sheetFooter?: ReactNode;
  groups: ConsoleNavGroup[];
  topbar: ReactNode;
  labels: AppShellLabels;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const shellGroups: ShellNavGroup[] = groups.map((group) => ({
    // A single-item group (the overview) needs no heading of its own.
    ...(group.items.length > 1 ? { label: group.label } : {}),
    items: group.items.map((item) => ({
      href: item.href,
      label: item.label,
      icon: icons[item.key],
      current: isActive(pathname, item.href, locale),
    })),
  }));
  return (
    <AppShell
      brand={brand}
      {...(mobileBrand ? { mobileBrand } : {})}
      {...(sheetFooter ? { sheetFooter } : {})}
      groups={shellGroups}
      topbar={topbar}
      labels={labels}
    >
      {children}
    </AppShell>
  );
}
