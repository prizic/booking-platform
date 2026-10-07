import { describe, expect, it, vi } from "vitest";

// The request-scoped client is server-only; this reader is tested on its own.
vi.mock("./tenant-request", () => ({ createPublicApiContext: async () => null }));

import {
  loadWhatsAppAvailability,
  readWhatsAppAvailability,
} from "./whatsapp-availability";

function api(result: { data: unknown; error: unknown } | Error) {
  const calls: [string, Readonly<Record<string, unknown>>][] = [];
  return {
    calls,
    rpc: async (name: string, args: Readonly<Record<string, unknown>>) => {
      calls.push([name, args]);
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

describe("WhatsApp availability", () => {
  it("asks for the trusted host and reads the one boolean", async () => {
    const source = api({ data: { version: 1, whatsapp_available: true }, error: null });
    await expect(readWhatsAppAvailability(source, "book.tenant.example")).resolves.toBe(
      true,
    );
    expect(source.calls).toEqual([
      [
        "get_public_whatsapp_availability_v1",
        { p_application: "client", p_hostname: "book.tenant.example" },
      ],
    ]);
  });

  it.each([
    ["unavailable", { data: { version: 1, whatsapp_available: false }, error: null }],
    ["refused", { data: null, error: { code: "42501" } }],
    ["unreadable", { data: { whatsapp_available: "yes" }, error: null }],
    ["unreachable", new Error("network")],
  ])("offers nothing when the answer is %s", async (_case, result) => {
    await expect(
      readWhatsAppAvailability(api(result), "book.tenant.example"),
    ).resolves.toBe(false);
  });

  it("offers nothing when the platform is not configured", async () => {
    await expect(loadWhatsAppAvailability()).resolves.toBe(false);
  });
});
