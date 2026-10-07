/**
 * A server action that ends in `redirect()` rejects its client promise with
 * Next's navigation signal while the router performs the navigation. That is a
 * success, not a transport failure, so it must never read as "network".
 */
export function isNavigationSignal(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("digest" in error)) return false;
  const digest = (error as { digest: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_");
}
