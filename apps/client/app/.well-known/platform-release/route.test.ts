import { afterEach, describe, expect, it, vi } from "vitest";
import platformContract from "../../../../../platform-contract.json";
import { GET } from "./route";

afterEach(() => vi.unstubAllEnvs());

describe("GET /.well-known/platform-release", () => {
  it("returns only safe Client build and contract identity", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "0123456789abcdef0123456789abcdef01234567");

    const response = GET();

    await expect(response.json()).resolves.toEqual({
      schemaVersion: 1,
      application: "client",
      releaseId: `tenant-runtime-v${platformContract.whiteLabelVersion}`,
      buildCommit: "0123456789abcdef0123456789abcdef01234567",
      ...platformContract,
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("does not reflect an unsafe commit-shaped environment value", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "unsafe-value");
    vi.stubEnv("GITHUB_SHA", "");

    await expect(GET().json()).resolves.toMatchObject({ buildCommit: "local" });
  });

  it("falls back to a valid workflow commit when deployment identity is malformed", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "unsafe-value");
    vi.stubEnv("GITHUB_SHA", "89abcdef0123456789abcdef0123456789abcdef");

    await expect(GET().json()).resolves.toMatchObject({
      buildCommit: "89abcdef0123456789abcdef0123456789abcdef",
    });
  });
});
