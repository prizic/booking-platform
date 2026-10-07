/** Platform-configured exact origins; the hook payload never selects a brand. */
export function recoveryRedirect(
  value: unknown,
  allowedOrigins: string,
): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash ||
      url.pathname !== "/auth/callback"
    )
      return null;
    if (
      !allowedOrigins
        .split(",")
        .map((origin) => origin.trim())
        .includes(url.origin)
    )
      return null;
    for (const [key, candidate] of url.searchParams) {
      if (key === "locale" && (candidate === "en" || candidate === "ar")) continue;
      if (key === "sb_flow_id" && /^[A-Za-z0-9_-]{1,128}$/u.test(candidate)) continue;
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}
