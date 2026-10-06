import { describe, expect, it } from "vitest";
import { isSameOriginPost, publicRequestOrigin } from "./request-origin";

describe("same-origin sign-out", () => {
  const url = "http://0.0.0.0:41742/en/sign-out";
  it("accepts the browser authority while Next uses an internal bind address", () => {
    const headers = new Headers({
      host: "localhost:41742",
      origin: "http://localhost:41742",
    });
    expect(isSameOriginPost(url, headers)).toBe(true);
    expect(publicRequestOrigin(url, headers)).toBe("http://localhost:41742");
  });
  it("rejects cross-origin, opaque and cross-site posts", () => {
    for (const origin of [
      "https://attacker.invalid",
      "null",
      "http://localhost:3002",
    ]) {
      expect(
        isSameOriginPost(url, new Headers({ host: "localhost:41742", origin })),
      ).toBe(false);
    }
    expect(
      isSameOriginPost(
        url,
        new Headers({ host: "localhost:41742", "sec-fetch-site": "cross-site" }),
      ),
    ).toBe(false);
  });
  it("does not trust forwarded authority or malformed host values", () => {
    expect(
      isSameOriginPost(
        url,
        new Headers({
          host: "localhost:41742",
          origin: "https://attacker.invalid",
          "x-forwarded-host": "attacker.invalid",
        }),
      ),
    ).toBe(false);
    for (const host of [
      "localhost:41742@attacker.invalid",
      "localhost:41742/path",
      "localhost:41742\\path",
    ]) {
      expect(publicRequestOrigin(url, new Headers({ host }))).toBe(
        "http://0.0.0.0:41742",
      );
    }
  });
});
