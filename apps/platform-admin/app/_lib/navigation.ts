import type { Locale } from "@wlbp/i18n";
import { say, shellCopy } from "./copy";

const groups = [
  ["overview", ["overview"]],
  ["fleet", ["tenants", "instances", "domains", "provisioning", "jobs"]],
  ["commercial", ["plans", "subscriptions"]],
  ["releases", ["releases", "rollouts"]],
  ["operations", ["health", "support"]],
  ["administration", ["operators", "audit", "settings"]],
] as const;

export type NavItemKey = (typeof groups)[number][1][number];

export function navHref(locale: Locale, item: NavItemKey): string {
  return item === "overview" ? `/${locale}` : `/${locale}/${item}`;
}

export function isActive(pathname: string, href: string, locale: Locale): boolean {
  if (href === `/${locale}`) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function getNavigation(locale: Locale) {
  return groups.map(([group, items]) => ({
    group,
    label: say(locale, shellCopy.groups[group]),
    items: items.map((key) => ({
      key,
      href: navHref(locale, key),
      label: say(locale, shellCopy.items[key]),
    })),
  }));
}
