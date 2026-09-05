import { afterEach, describe, expect, it, vi } from "vitest";
import platformContract from "../../../../../platform-contract.json";
import { GET } from "./route";

afterEach(() => vi.unstubAllEnvs());

describe("GET /.well-known/platform-release", () => {
  it("returns only safe Platform Admin build and contract identity", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abcdef0123456789abcdef0123456789abcdef01");

    const response = GET();

    await expect(response.json()).resolves.toEqual({
      schemaVersion: 1,
      application: "platform-admin",
      releaseId: `tenant-runtime-v${platformContract.whiteLabelVersion}`,
      buildCommit: "abcdef0123456789abcdef0123456789abcdef01",
      ...platformContract,
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("uses an explicit local identity when no commit is available", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
    vi.stubEnv("GITHUB_SHA", "");

    await expect(GET().json()).resolves.toMatchObject({ buildCommit: "local" });
  });
});
