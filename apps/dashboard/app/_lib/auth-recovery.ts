/** Only freshly provider-verified email recovery/OTP claims permit this flow. */
export function hasRecentRecoveryAuthentication(claims: unknown, now: number): boolean {
  if (
    typeof claims !== "object" ||
    claims === null ||
    !("sub" in claims) ||
    typeof claims.sub !== "string" ||
    !("amr" in claims) ||
    !Array.isArray(claims.amr)
  )
    return false;
  return claims.amr.some(
    (entry: unknown) =>
      typeof entry === "object" &&
      entry !== null &&
      "method" in entry &&
      (entry.method === "recovery" || entry.method === "otp") &&
      "timestamp" in entry &&
      typeof entry.timestamp === "number" &&
      Number.isSafeInteger(entry.timestamp) &&
      entry.timestamp <= now &&
      now - entry.timestamp <= 900,
  );
}
