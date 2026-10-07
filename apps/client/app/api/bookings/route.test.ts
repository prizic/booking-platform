import { readFileSync } from "node:fs";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "book.tenant.example" }),
}));

vi.mock("@wlbp/tenant-resolution", () => ({
  extractRequestHostname: () => "book.tenant.example",
}));

vi.mock("@wlbp/supabase-client/server", () => ({
  createRequestScopedSupabaseClient: () => ({
    schema: () => ({ rpc }),
  }),
}));

function instanceContent(locale: "en" | "ar"): Record<string, string> {
  return JSON.parse(
    readFileSync(
      new URL(
        `../../../../../instance-template/instance/content/${locale}.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  ) as Record<string, string>;
}

const content = { ar: instanceContent("ar"), en: instanceContent("en") };

const committedRow = {
  approval_status: "not_required",
  booking_id: "0a3f2b64-0000-4000-8000-000000000002",
  booking_revision: 1,
  calendar_status: "pending",
  consent_version: "2",
  currency: "SAR",
  customer_time_zone: "Asia/Riyadh",
  ends_at: "2035-09-24T13:45:00+00:00",
  locale: "ar",
  location_name: "Downtown",
  location_time_zone: "Asia/Riyadh",
  notification_status: "queued",
  payment_status: "not_required",
  price_minor: 18_000,
  public_reference: "K3M9P2T7XY",
  replayed: false,
  service_name: "Initial consultation",
  starts_at: "2035-09-24T13:00:00+00:00",
  status: "confirmed",
  tax_rate_bps: 1500,
};

function body(whatsappOptIn?: unknown) {
  return {
    consent: true,
    consentVersion: "2",
    contact: {
      email: "guest@example.invalid",
      fullName: "Test Guest",
      phone: null,
      ...(whatsappOptIn === undefined ? {} : { whatsappOptIn }),
    },
    customerTimeZone: "Asia/Riyadh",
    holdId: "0a3f2b64-0000-4000-8000-000000000001",
    idempotencyKey: "confirm-0a3f2b64-0000-4000-8000-000000000001",
    intake: {},
    locale: "ar",
    sessionToken: "session-token-0000000000000000",
  };
}

async function post(payload: unknown) {
  const { POST } = await import("./route");
  return POST(
    new Request("https://book.tenant.example/api/bookings", {
      body: JSON.stringify(payload),
      method: "POST",
    }),
  );
}

function stubEnvironment() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-test-key");
  vi.stubEnv("WLBP_RUNTIME_ENV", "test");
  vi.stubEnv("WLBP_INSTANCE_CONTENT_JSON", JSON.stringify(content));
}

// The first import of the route pulls in the whole server stack.
beforeAll(async () => {
  stubEnvironment();
  await import("./route");
}, 60_000);

beforeEach(() => {
  stubEnvironment();
  rpc.mockResolvedValue({ data: [committedRow], error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
  rpc.mockReset();
});

describe("Client bookings route: WhatsApp opt-in", () => {
  it("confirms without an opt-in exactly as before", async () => {
    const response = await post(body());
    expect(response.status).toBe(200);
    expect(rpc.mock.calls[0]?.[1].p_contact).toEqual({
      email: "guest@example.invalid",
      fullName: "Test Guest",
    });
  });

  it("stores the consent the customer saw, in the booking's language", async () => {
    const optIn = {
      consentText: content.ar["whatsapp.optIn.consent"],
      consentVersion: content.ar["whatsapp.optIn.consentVersion"],
      phoneE164: "+966512345678",
    };
    const response = await post(body(optIn));
    expect(response.status).toBe(200);
    expect(rpc.mock.calls[0]?.[0]).toBe("confirm_booking_v1");
    expect(rpc.mock.calls[0]?.[1].p_contact).toEqual({
      email: "guest@example.invalid",
      fullName: "Test Guest",
      whatsappOptIn: optIn,
    });
  });

  it.each([
    ["other wording", { consentText: "I agree to anything." }],
    ["another language's text", { consentText: "__en__" }],
    ["another version", { consentVersion: "99" }],
  ])("refuses consent with %s, without a database call", async (_case, change) => {
    const optIn = {
      consentText: content.ar["whatsapp.optIn.consent"],
      consentVersion: content.ar["whatsapp.optIn.consentVersion"],
      phoneE164: "+966512345678",
      ...change,
    };
    if (optIn.consentText === "__en__")
      optIn.consentText = content.en["whatsapp.optIn.consent"]!;
    const response = await post(body(optIn));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_request" } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a number that is not E.164, without a database call", async () => {
    const response = await post(
      body({
        consentText: content.ar["whatsapp.optIn.consent"],
        consentVersion: content.ar["whatsapp.optIn.consentVersion"],
        phoneE164: "0512345678",
      }),
    );
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
