// Input validation and CORS for the email preview. Pure functions, so every
// refusal is unit tested without a network, a database or a JWT.
import {
  isNotificationTemplateKey,
  type NotificationTemplateKey,
} from "../_shared/email/templates.ts";

export interface PreviewRequest {
  readonly locale: "ar" | "en";
  readonly templateKey: NotificationTemplateKey;
  readonly tenantId: string;
}

export type PreviewParse =
  { readonly ok: true; readonly value: PreviewRequest } | { readonly ok: false };

/** Three short fields; anything larger is not a preview request. */
export const maxPreviewBodyBytes = 1024;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const allowedKeys = new Set(["locale", "templateKey", "tenantId"]);

/**
 * Exactly `{tenantId, templateKey, locale}`: a known template key, a supported
 * locale, a UUID tenant. Unknown fields are refused rather than ignored, so no
 * caller can believe it influenced the sample data or the recipient.
 */
export function parsePreviewRequest(rawBody: string): PreviewParse {
  if (new TextEncoder().encode(rawBody).length > maxPreviewBodyBytes) {
    return { ok: false };
  }
  let value: unknown;
  try {
    value = JSON.parse(rawBody);
  } catch {
    return { ok: false };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false };
  }
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !allowedKeys.has(key))) return { ok: false };
  const { locale, templateKey, tenantId } = body;
  if (typeof tenantId !== "string" || !uuidPattern.test(tenantId)) return { ok: false };
  if (locale !== "ar" && locale !== "en") return { ok: false };
  if (!isNotificationTemplateKey(templateKey)) return { ok: false };
  return { ok: true, value: { locale, templateKey, tenantId: tenantId.toLowerCase() } };
}

/** `scheme://host[:port]` of an http(s) origin, or null. */
export function normalizeOrigin(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim() === "") return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username !== "" || url.password !== "") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * The origins allowed to read a preview for this tenant: its verified
 * Dashboard origin (https only), plus operator-configured development
 * origins. Never a wildcard, and never an origin the request itself claimed.
 */
export function allowedOrigins(
  dashboardOrigin: string | undefined,
  developmentOrigins: string,
): ReadonlySet<string> {
  const origins = new Set<string>();
  const verified = normalizeOrigin(dashboardOrigin);
  if (verified !== null && verified.startsWith("https://")) origins.add(verified);
  for (const entry of developmentOrigins.split(",")) {
    const origin = normalizeOrigin(entry);
    if (origin !== null) origins.add(origin);
  }
  return origins;
}

/**
 * A request is allowed when it carries no Origin (a server-side call from the
 * Dashboard) or an Origin in the tenant's allowed set.
 */
export function originPermitted(
  requestOrigin: string | null,
  allowed: ReadonlySet<string>,
): boolean {
  if (requestOrigin === null) return true;
  const origin = normalizeOrigin(requestOrigin);
  return origin !== null && allowed.has(origin);
}

export function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = { vary: "Origin" };
  const normalized = normalizeOrigin(origin);
  if (normalized === null) return headers;
  return {
    ...headers,
    "access-control-allow-headers":
      "authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-origin": normalized,
    "access-control-max-age": "600",
  };
}
