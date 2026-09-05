import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createRequestScopedSupabaseClient } from "./server.js";

describe("request-scoped Supabase client", () => {
  it("creates an isolated client for every request factory call", () => {
    const configuration = {
      publishableKey: "sb_publishable_test",
      url: "https://project.supabase.co",
    };
    const cookies = { getAll: () => [] };

    expect(createRequestScopedSupabaseClient(configuration, cookies)).not.toBe(
      createRequestScopedSupabaseClient(configuration, cookies),
    );
  });

  it("rejects missing publishable configuration", () => {
    expect(() =>
      createRequestScopedSupabaseClient(
        { publishableKey: "", url: "https://project.supabase.co" },
        { getAll: () => [] },
      ),
    ).toThrow("publishable key");
  });

  it("rejects modern secret keys and legacy service-role JWTs", () => {
    const jwt = (role: string) =>
      [
        btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
        btoa(JSON.stringify({ role })),
        "test-signature",
      ].join(".");

    expect(() =>
      createRequestScopedSupabaseClient(
        {
          publishableKey: ["sb", "secret", "test"].join("_"),
          url: "https://project.supabase.co",
        },
        { getAll: () => [] },
      ),
    ).toThrow("publishable key");
    expect(() =>
      createRequestScopedSupabaseClient(
        { publishableKey: jwt("service_role"), url: "https://project.supabase.co" },
        { getAll: () => [] },
      ),
    ).toThrow("publishable key");
    expect(() =>
      createRequestScopedSupabaseClient(
        { publishableKey: jwt("anon"), url: "https://project.supabase.co" },
        { getAll: () => [] },
      ),
    ).not.toThrow();
  });
});
