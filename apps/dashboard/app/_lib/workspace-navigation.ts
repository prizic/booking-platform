import type { Locale } from "@wlbp/i18n";
import { getDashboardMessage, type DashboardMessageKey } from "./copy";

export type WorkspaceSection =
  | "today"
  | "calendar"
  | "bookings"
  | "customers"
  | "requests"
  | "services"
  | "categories"
  | "locations"
  | "team-resources"
  | "availability"
  | "payments"
  | "communications"
  | "reports"
  | "brand"
  | "integrations"
  | "settings"
  | "audit"
  | "roles";
export type WorkspaceGroup = "operations" | "catalog" | "administration";
export interface WorkspaceNavigationItem {
  readonly section: WorkspaceSection;
  readonly group: WorkspaceGroup;
  readonly href: string;
  readonly label: string;
  readonly active: boolean;
}
export interface WorkspaceNavigationInput {
  readonly locale: Locale;
  readonly current: WorkspaceSection;
  readonly enabledSections: readonly WorkspaceSection[];
}
const registry: readonly [WorkspaceSection, WorkspaceGroup, DashboardMessageKey][] = [
  ["today", "operations", "navToday"],
  ["calendar", "operations", "navCalendar"],
  ["bookings", "operations", "navBookings"],
  ["requests", "operations", "navRequests"],
  ["customers", "operations", "navCustomers"],
  ["payments", "operations", "navPayments"],
  ["communications", "operations", "navCommunications"],
  ["reports", "operations", "navReports"],
  ["services", "catalog", "navServices"],
  ["categories", "catalog", "navCategories"],
  ["locations", "catalog", "navLocations"],
  ["team-resources", "catalog", "navTeamResources"],
  ["availability", "catalog", "navAvailability"],
  ["brand", "administration", "navBrand"],
  ["integrations", "administration", "navIntegrations"],
  ["settings", "administration", "navSettings"],
  ["audit", "administration", "navAudit"],
  ["roles", "administration", "navRoles"],
];
// Add destinations only when their page and authorized read exist.
export const implementedWorkspaceSections: readonly WorkspaceSection[] = [
  "today",
  "calendar",
  "bookings",
  "requests",
  "customers",
  "services",
  "categories",
  "locations",
  "payments",
  "reports",
  "team-resources",
  "availability",
  "brand",
  "settings",
  "communications",
  "integrations",
  "audit",
  "roles",
];
export function getWorkspaceNavigation(
  input: WorkspaceNavigationInput,
): readonly WorkspaceNavigationItem[] {
  return registry
    .filter(([section]) => input.enabledSections.includes(section))
    .map(([section, group, key]) => ({
      section,
      group,
      href: `/${input.locale}/${section}`,
      label: getDashboardMessage(input.locale, key),
      active: section === input.current,
    }));
}
