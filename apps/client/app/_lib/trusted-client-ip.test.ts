import { describe, expect, it } from "vitest";
import { trustedClientIp } from "./trusted-client-ip";

describe("R5 trusted ingress metadata", () => {
  it("does not forward an ordinary caller's spoofed network header", () => {
    expect(
      trustedClientIp(new Headers({ "x-forwarded-for": "192.0.2.1" }), ""),
    ).toBeUndefined();
    expect(
      trustedClientIp(new Headers({ "x-forwarded-for": "192.0.2.1" }), "unrecognized"),
    ).toBeUndefined();
  });
  it("forwards only valid addresses from the explicitly configured proxy header", () => {
    expect(
      trustedClientIp(
        new Headers({ "x-real-ip": "192.0.2.1", "x-forwarded-for": "198.51.100.1" }),
        "x-real-ip",
      ),
    ).toBe("192.0.2.1");
    expect(
      trustedClientIp(
        new Headers({ "x-forwarded-for": "2001:db8::1, 192.0.2.2" }),
        "x-forwarded-for",
      ),
    ).toBe("2001:db8::1");
    for (const value of ["bad", "192.0.2.1:80", "x".repeat(513)])
      expect(
        trustedClientIp(new Headers({ "x-real-ip": value }), "x-real-ip"),
      ).toBeUndefined();
  });
});
