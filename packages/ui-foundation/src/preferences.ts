/**
 * Visitor preferences shared by every app. Server layouts read these cookies
 * to render the right theme and locale on the first byte (no flash); the
 * client switches below write them.
 */
export const THEME_COOKIE = "wlbp-theme";
export const LOCALE_COOKIE = "wlbp-locale";
/** AppShell's desktop rail only; mobile sheet state is never persisted. */
export const SIDEBAR_COOKIE = "wlbp-sidebar";
export const PREFERENCE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export type ThemePreference = "light" | "dark";

/** Only a recognized value overrides the app's initial desktop preference. */
export function resolveSidebarCollapsed(
  cookieValue: string | undefined,
  defaultCollapsed = false,
): boolean {
  if (cookieValue === "collapsed") return true;
  if (cookieValue === "expanded") return false;
  return defaultCollapsed;
}

/** Resolves the theme class for <html>; dark is honoured only when the brand ships it. */
export function resolveTheme(
  cookieValue: string | undefined,
  defaultTheme: ThemePreference,
  darkAvailable: boolean,
): ThemePreference {
  if (!darkAvailable) return "light";
  if (cookieValue === "light" || cookieValue === "dark") return cookieValue;
  return defaultTheme;
}

export function preferenceCookie(name: string, value: string): string {
  return `${name}=${value}; Path=/; Max-Age=${PREFERENCE_MAX_AGE_SECONDS}; SameSite=Lax`;
}
