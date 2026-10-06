import { describe, expect, it } from "vitest";
import { errorCopy } from "./copy";
import { operatorErrorCode, operatorErrorCodes } from "./operator-errors";

describe("operatorErrorCode", () => {
  it("passes through a known database message", () => {
    expect(operatorErrorCode({ message: "last_admin_protected", code: "42501" })).toBe(
      "last_admin_protected",
    );
  });
  it("maps an unknown permission error to policy_denied", () => {
    expect(
      operatorErrorCode({ message: "permission denied for function x", code: "42501" }),
    ).toBe("policy_denied");
    expect(operatorErrorCode({ message: "JWT expired", code: "PGRST301" })).toBe(
      "policy_denied",
    );
  });
  it("never leaks an unknown message", () => {
    expect(operatorErrorCode({ message: "connect ECONNREFUSED 127.0.0.1:56521" })).toBe(
      "unavailable",
    );
  });
  it("has copy for every code it can return", () => {
    for (const code of operatorErrorCodes) expect(errorCopy).toHaveProperty(code);
  });
});
