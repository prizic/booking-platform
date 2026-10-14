import { isIP } from "node:net";

/** Opt-in only after the deployment's reverse proxy strips/overwrites this
 * exact header. Ordinary browser-supplied forwarding headers are never trusted.
 * Unconfigured ingress retains the backend's restrictive missing-IP bucket. */
export function trustedClientIp(
  headers: Headers,
  configuredHeader = process.env.WLBP_TRUSTED_CLIENT_IP_HEADER,
): string | undefined {
  if (
    configuredHeader !== "x-forwarded-for" &&
    configuredHeader !== "x-real-ip" &&
    configuredHeader !== "x-vercel-forwarded-for"
  )
    return undefined;
  const value = headers.get(configuredHeader);
  if (!value || value.length > 512) return undefined;
  const candidate = value.split(",")[0]?.trim();
  return candidate && isIP(candidate) ? candidate : undefined;
}
