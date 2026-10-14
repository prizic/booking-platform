import { describe, expect, it, vi } from "vitest";

vi.mock("./public-read-context", () => ({
  createPublicReadContext: vi.fn(),
  publicRpcFailure: (error: { code?: string }) => ({
    outcome: "error",
    reason: error.code === "42501" ? "tenant" : "read",
  }),
  reportPublicReadFailure: vi.fn(),
}));
import { loadPublishedCatalog, readPublishedCatalog } from "./catalog-data-source";
import { createPublicReadContext } from "./public-read-context";

const tenantId = "10000000-0000-4000-8000-000000000001";
const row = {
  tenant_id: tenantId,
  publication_id: "10000000-0000-4000-8000-000000000002",
  publication_revision: 3,
  locale: "en",
  service_id: "10000000-0000-4000-8000-000000000003",
  service_key: "consultation",
  category_key: null,
  service_name: "Published consultation",
  service_description: "Meet our team",
  canonical_path: "/en/book",
  duration_minutes: 30,
  buffer_before_minutes: 0,
  buffer_after_minutes: 5,
  currency: "USD",
  price_minor: 2500,
  tax_rate_bps: 0,
  capacity_mode: "exclusive",
  booking_mode: "appointment",
  approval_required: false,
  payment_mode: "none",
  location_id: "10000000-0000-4000-8000-000000000004",
  location_key: "main",
  location_name: "Main location",
  location_description: "",
  location_address: "Synthetic Street",
  location_time_zone: "America/New_York",
  location_canonical_path: "/en/book",
  cache_tag: "catalog:tenant:3:en",
};
function source(data: unknown, route: unknown = [{ tenant_id: tenantId }]) {
  const rpc = vi.fn(async (name: string) => ({
    data: name === "resolve_public_tenant_v1" ? route : data,
    error: null,
  }));
  return { rpc };
}

describe("R1 published catalog states", () => {
  it("returns published service data and scopes both reads to the trusted host", async () => {
    const api = source([row]);
    const result = await readPublishedCatalog(
      api,
      "client.tenant.example.invalid",
      "en",
    );
    expect(result).toMatchObject({
      outcome: "ready",
      items: [
        {
          serviceName: "Published consultation",
          publicationRevision: 3,
          price: { minorUnits: 2500 },
        },
      ],
    });
    expect(api.rpc.mock.calls).toEqual([
      [
        "resolve_public_tenant_v1",
        { p_hostname: "client.tenant.example.invalid", p_application: "client" },
      ],
      [
        "get_public_catalog_v1",
        { p_hostname: "client.tenant.example.invalid", p_locale: "en" },
      ],
    ]);
  });
  it("reports a genuine zero-row catalog only after resolving its tenant", async () => {
    await expect(
      readPublishedCatalog(source([]), "client.tenant.example.invalid", "en"),
    ).resolves.toEqual({ outcome: "empty", items: [] });
    const unknown = source([], []);
    await expect(
      readPublishedCatalog(unknown, "unknown.example.invalid", "en"),
    ).resolves.toEqual({ outcome: "error", reason: "tenant" });
    expect(unknown.rpc).toHaveBeenCalledTimes(1);
  });
  it("retains configuration failure instead of claiming no services", async () => {
    vi.mocked(createPublicReadContext).mockResolvedValue({
      outcome: "error",
      reason: "configuration",
    });
    await expect(loadPublishedCatalog("ar")).resolves.toEqual({
      outcome: "error",
      reason: "configuration",
    });
  });
  it("separates read refusal from malformed content and never exposes raw error details", async () => {
    const secret = "raw customer or provider detail";
    await expect(
      readPublishedCatalog(
        {
          rpc: async () => ({ data: null, error: { code: "42501", message: secret } }),
        },
        "client.tenant.example.invalid",
        "en",
      ),
    ).resolves.toEqual({ outcome: "error", reason: "tenant" });
    await expect(
      readPublishedCatalog(
        {
          rpc: async () => {
            throw new Error(secret);
          },
        },
        "client.tenant.example.invalid",
        "en",
      ),
    ).resolves.toEqual({ outcome: "error", reason: "read" });
    for (const data of [null, [null], [{ ...row, duration_minutes: -1 }]]) {
      await expect(
        readPublishedCatalog(source(data), "client.tenant.example.invalid", "en"),
      ).resolves.toEqual({ outcome: "error", reason: "parse" });
    }
  });
  it("refuses another tenant or locale in a response even when every row parses", async () => {
    for (const change of [
      { tenant_id: "20000000-0000-4000-8000-000000000001" },
      { locale: "ar" },
    ]) {
      await expect(
        readPublishedCatalog(
          source([{ ...row, ...change }]),
          "client.tenant.example.invalid",
          "en",
        ),
      ).resolves.toEqual({ outcome: "error", reason: "parse" });
    }
  });
});
