import {
  allowedOrigins,
  corsHeaders,
  maxPreviewBodyBytes,
  originPermitted,
  parsePreviewRequest,
} from "./request.ts";

const tenantId = "a0000000-0000-4000-8000-000000000001";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

Deno.test("accepts exactly a tenant, a known template key and a locale", () => {
  const parsed = parsePreviewRequest(
    JSON.stringify({ locale: "ar", templateKey: "booking.confirmed", tenantId }),
  );
  assert(parsed.ok, "valid request refused");
  if (parsed.ok) {
    assert(parsed.value.templateKey === "booking.confirmed", "key changed");
    assert(parsed.value.locale === "ar", "locale changed");
    assert(parsed.value.tenantId === tenantId, "tenant changed");
  }
  assert(
    parsePreviewRequest(
      JSON.stringify({ locale: "en", templateKey: "staff.daily_digest", tenantId }),
    ).ok,
    "digest preview refused",
  );
});

Deno.test("refuses every malformed or widened request identically", () => {
  const valid = { locale: "en", templateKey: "booking.confirmed", tenantId };
  const refused = [
    "",
    "not json",
    "[]",
    "null",
    '"booking.confirmed"',
    JSON.stringify({ locale: "en", templateKey: "booking.confirmed" }),
    JSON.stringify({ ...valid, tenantId: "nope" }),
    JSON.stringify({ ...valid, tenantId: 42 }),
    JSON.stringify({ ...valid, locale: "fr" }),
    JSON.stringify({ ...valid, locale: "EN" }),
    JSON.stringify({ ...valid, templateKey: "booking.unknown" }),
    JSON.stringify({ ...valid, templateKey: "__proto__" }),
    JSON.stringify({ ...valid, templateKey: ["booking.confirmed"] }),
    // Extra fields could look like they choose data or a recipient: refused.
    JSON.stringify({ ...valid, to: "someone@example.invalid" }),
    JSON.stringify({ ...valid, variables: { serviceName: "x" } }),
    JSON.stringify({ ...valid, padding: "x".repeat(maxPreviewBodyBytes) }),
  ];
  for (const body of refused) {
    assert(!parsePreviewRequest(body).ok, `accepted: ${body.slice(0, 80)}`);
  }
});

Deno.test(
  "allows only the tenant's verified dashboard origin, never a claimed one",
  () => {
    const allowed = allowedOrigins("https://dashboard.example.invalid", "");
    assert(
      originPermitted("https://dashboard.example.invalid", allowed),
      "verified origin refused",
    );
    assert(originPermitted(null, allowed), "server-side call refused");
    assert(
      !originPermitted("https://evil.example.invalid", allowed),
      "other origin allowed",
    );
    assert(
      !originPermitted("https://dashboard.example.invalid.evil.invalid", allowed),
      "suffix origin allowed",
    );
    assert(!originPermitted("null", allowed), "opaque origin allowed");
    // A plain-http "verified" origin is not trusted.
    assert(
      allowedOrigins("http://dashboard.example.invalid", "").size === 0,
      "http trusted",
    );
    // Development origins are explicit operator configuration only.
    const development = allowedOrigins(undefined, "http://localhost:41731, junk");
    assert(
      originPermitted("http://localhost:41731", development),
      "dev origin refused",
    );
    assert(development.size === 1, "junk development origin accepted");
  },
);

Deno.test("CORS echoes one normalized origin and grants nothing otherwise", () => {
  const headers = corsHeaders("https://dashboard.example.invalid");
  assert(
    headers["access-control-allow-origin"] === "https://dashboard.example.invalid",
    "origin not echoed",
  );
  assert(headers.vary === "Origin", "missing vary");
  assert(
    corsHeaders(null)["access-control-allow-origin"] === undefined,
    "grant on none",
  );
  assert(
    corsHeaders("*")["access-control-allow-origin"] === undefined,
    "wildcard echoed",
  );
});
