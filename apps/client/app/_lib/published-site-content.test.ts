import { describe, expect, it, vi } from "vitest";
vi.mock("./public-read-context", () => ({
  createPublicReadContext: vi.fn(),
  publicRpcFailure: (error: { code?: string }) => ({
    outcome: "error",
    reason: error.code === "42501" ? "tenant" : "read",
  }),
  reportPublicReadFailure: vi.fn(),
}));
import { readPublishedSiteContent } from "./published-site-content";
import { publicChannelLinks } from "./public-channel-links";

const content = {
  title: { en: "Synthetic Business", ar: "منشأة الاختبار" },
  contact: {
    email: "business@example.invalid",
    phone: "+15555550136",
    whatsapp: "+15555550137",
  },
  about: {
    experience: { en: "Twenty years", ar: "عشرون عامًا" },
    whyChooseUs: { en: "Thoughtful care", ar: "رعاية مدروسة" },
    address: { en: "136 Synthetic Street", ar: "١٣٦ شارع الاختبار" },
    mapUrl: "https://maps.example.invalid/location",
  },
  appStores: {
    appStoreUrl: "https://apps.apple.com/app/synthetic",
    googlePlayUrl: "https://play.google.com/store/apps/details?id=synthetic",
  },
};
function published(value: unknown, revision = 4) {
  const rpc = vi.fn(async () => ({
    data: [
      {
        contract_version: 1,
        revision,
        brand_revision_id: "revision",
        cache_tag: `brand:synthetic:${revision}`,
        content: value,
      },
    ],
    error: null,
  }));
  return { rpc };
}
describe("R2 R3 R4 published tenant site content", () => {
  it("reads only the routed published brand and exposes its exact current revision", async () => {
    const api = published(content);
    const result = await readPublishedSiteContent(api, "client.tenant.example.invalid");
    expect(api.rpc).toHaveBeenCalledWith("get_published_brand_v1", {
      p_hostname: "client.tenant.example.invalid",
      p_application: "client",
    });
    expect(result).toMatchObject({ outcome: "ready", revision: 4, content });
    expect(
      await readPublishedSiteContent(
        published({ ...content, contact: { email: "new@example.invalid" } }, 5),
        "client.tenant.example.invalid",
      ),
    ).toMatchObject({
      revision: 5,
      content: { contact: { email: "new@example.invalid" } },
    });
  });
  it("never inserts another tenant's channels or stores when optional fields are missing", async () => {
    expect(
      await readPublishedSiteContent(published({}), "other.tenant.example.invalid"),
    ).toMatchObject({ outcome: "ready", content: {} });
    expect(publicChannelLinks(undefined)).toEqual({
      email: undefined,
      phone: undefined,
      whatsapp: undefined,
    });
    expect(
      publicChannelLinks({ email: "name?subject=unsafe@example.invalid" }).email,
    ).toBe("mailto:name%3Fsubject%3Dunsafe@example.invalid");
    expect(publicChannelLinks(content.contact)).toEqual({
      email: "mailto:business@example.invalid",
      phone: "tel:+15555550136",
      whatsapp: "https://wa.me/15555550137",
    });
  });
  it.each([
    { contact: { phone: "javascript:alert(1)" } },
    { contact: { whatsapp: "https://attacker.example.invalid" } },
    { about: { mapUrl: "https://user:password@maps.example.invalid" } },
    { about: { experience: { en: "<script>bad</script>", ar: "نص" } } },
    { appStores: { appStoreUrl: "javascript:alert(1)" } },
  ])("refuses unsafe public content instead of rendering it", async (value) => {
    expect(
      await readPublishedSiteContent(published(value), "client.tenant.example.invalid"),
    ).toEqual({ outcome: "error", reason: "parse" });
  });
  it("separates a successful absent revision from a backend read failure", async () => {
    expect(
      await readPublishedSiteContent(
        { rpc: async () => ({ data: [], error: null }) },
        "client.tenant.example.invalid",
      ),
    ).toEqual({ outcome: "empty" });
    expect(
      await readPublishedSiteContent(
        { rpc: async () => ({ data: null, error: { code: "57014" } }) },
        "client.tenant.example.invalid",
      ),
    ).toEqual({ outcome: "error", reason: "read" });
  });
});
