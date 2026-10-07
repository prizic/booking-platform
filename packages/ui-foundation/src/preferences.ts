/**
 * Visitor preferences shared by every app. Server layouts read these cookies
 * to render the right theme and locale on the first byte (no flash); the
 * client switches below write them.
 */
export const THEME_COOKIE = "wlbp-theme";
export const LOCALE_COOKIE = "wlbp-locale";
export const PREFERENCE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export type ThemePreference = "light" | "dark";

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
