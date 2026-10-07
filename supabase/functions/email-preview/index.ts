// Dashboard email preview: renders one platform template, in one language,
// with fixed synthetic sample data inside the tenant's real published brand.
// It never sends, enqueues or stores anything.
//
// Authorization is the database's, under the caller's own JWT and never the
// service role: `get_notification_settings_v1` answers only a member of the
// tenant, and `get_notification_brand_v2` is read under the same identity. A
// browser caller must additionally come from the tenant's verified Dashboard
// origin (or an operator-configured development origin); a server-side caller
// sends no Origin at all.
import { brandNameFor, parseNotificationBrandRow } from "../_shared/email/brand.ts";
import { notificationPreviewSample } from "../_shared/email/samples.ts";
import { renderNotificationEmail } from "../_shared/email/templates.ts";
import {
  allowedOrigins,
  corsHeaders,
  maxPreviewBodyBytes,
  normalizeOrigin,
  originPermitted,
  parsePreviewRequest,
} from "./request.ts";

const developmentOrigins = Deno.env.get("EMAIL_PREVIEW_DEV_ORIGINS") ?? "";

function respond(
  body: unknown,
  status: number,
  cors: Record<string, string> = { vary: "Origin" },
): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      ...cors,
      "cache-control": "no-store",
      "content-type": "application/json",
      "x-content-type-options": "nosniff",
    },
    status,
  });
}

async function callAsCaller(
  name: string,
  parameters: Readonly<Record<string, unknown>>,
  authorization: string,
): Promise<unknown> {
  const response = await fetch(
    `${Deno.env.get("SUPABASE_URL") ?? ""}/rest/v1/rpc/${name}`,
    {
      body: JSON.stringify(parameters),
      headers: {
        "accept-profile": "api_v1",
        apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        authorization,
        "content-profile": "api_v1",
        "content-type": "application/json",
      },
      method: "POST",
    },
  );
  if (!response.ok) return null;
  return (await response.json()) as unknown;
}

Deno.serve(async (request: Request): Promise<Response> => {
  const origin = request.headers.get("origin");

  // A preflight carries no credentials and no body, so it cannot name a
  // tenant. It is answered for any well-formed origin; the POST below is the
  // authoritative check, and its response carries no CORS grant for an origin
  // that is not the tenant's own.
  if (request.method === "OPTIONS") {
    return normalizeOrigin(origin) === null
      ? new Response(null, { status: 403 })
      : new Response(null, { headers: corsHeaders(origin), status: 204 });
  }
  if (request.method !== "POST") return respond({ error: "method_not_allowed" }, 405);
  if (
    (Deno.env.get("SUPABASE_URL") ?? "") === "" ||
    (Deno.env.get("SUPABASE_ANON_KEY") ?? "") === ""
  ) {
    return respond({ error: "unconfigured" }, 503);
  }

  const authorization = request.headers.get("authorization") ?? "";
  if (!/^Bearer [A-Za-z0-9._~+/=-]{20,4096}$/u.test(authorization)) {
    return respond({ error: "not_authorized" }, 401);
  }
  if (!(request.headers.get("content-type") ?? "").startsWith("application/json")) {
    return respond({ error: "invalid_request" }, 415);
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxPreviewBodyBytes) return respond({ error: "invalid_request" }, 413);
  const parsed = parsePreviewRequest(await request.text());
  if (!parsed.ok) return respond({ error: "invalid_request" }, 400);
  const { locale, templateKey, tenantId } = parsed.value;

  try {
    // Membership (and anything else the settings read demands) is decided by
    // the database for this caller. Refusal and absence look the same.
    const settings = await callAsCaller(
      "get_notification_settings_v1",
      { p_tenant_id: tenantId },
      authorization,
    );
    if (settings === null) return respond({ error: "not_authorized" }, 403);

    const brandRows = await callAsCaller(
      "get_notification_brand_v2",
      { p_tenant_id: tenantId },
      authorization,
    );
    const brand = parseNotificationBrandRow(
      Array.isArray(brandRows) ? brandRows[0] : brandRows,
    );
    if (brand === null) return respond({ error: "not_authorized" }, 403);

    if (
      !originPermitted(
        origin,
        allowedOrigins(brand.dashboardOrigin, developmentOrigins),
      )
    ) {
      return respond({ error: "origin_not_allowed" }, 403);
    }
    const cors = origin === null ? { vary: "Origin" } : corsHeaders(origin);

    const brandName = brandNameFor(brand, locale);
    if (brandName === null) return respond({ error: "brand_unavailable" }, 409, cors);

    const sample = notificationPreviewSample(templateKey, locale);
    const rendered = renderNotificationEmail(templateKey, {
      brand,
      brandName,
      ...(sample.digest === undefined ? {} : { digest: sample.digest }),
      locale,
      variables: sample.variables,
    });
    return respond(
      { html: rendered.html, subject: rendered.subject, text: rendered.text },
      200,
      cors,
    );
  } catch {
    return respond({ error: "preview_unavailable" }, 503);
  }
});
