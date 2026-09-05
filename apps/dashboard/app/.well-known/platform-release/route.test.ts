import { afterEach, describe, expect, it, vi } from "vitest";
import platformContract from "../../../../../platform-contract.json";
import { GET } from "./route";

afterEach(() => vi.unstubAllEnvs());

describe("GET /.well-known/platform-release", () => {
  it("returns only safe Dashboard build and contract identity", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
    vi.stubEnv("GITHUB_SHA", "89abcdef0123456789abcdef0123456789abcdef");

    const response = GET();

    await expect(response.json()).resolves.toEqual({
      schemaVersion: 1,
      application: "dashboard",
      releaseId: `tenant-runtime-v${platformContract.whiteLabelVersion}`,
      buildCommit: "89abcdef0123456789abcdef0123456789abcdef",
      ...platformContract,
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("prefers the deployment commit over a workflow commit", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "0123456789abcdef0123456789abcdef01234567");
    vi.stubEnv("GITHUB_SHA", "89abcdef0123456789abcdef0123456789abcdef");

    await expect(GET().json()).resolves.toMatchObject({
      buildCommit: "0123456789abcdef0123456789abcdef01234567",
    });
  });
});
