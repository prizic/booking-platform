import { describe, expect, it } from "vitest";
import { NO_LINKED_ACCOUNT, membershipChoice } from "./form-values";

describe("team member account select", () => {
  it("submits the no-account sentinel as the empty value the parser treats as unlinked", () => {
    expect(membershipChoice(NO_LINKED_ACCOUNT)).toBe("");
  });
  it("passes every other submitted value through unchanged for validation", () => {
    const id = "a3000000-0000-0000-0000-000000000010";
    expect(membershipChoice(id)).toBe(id);
    expect(membershipChoice("all")).toBe("all");
    expect(membershipChoice(null)).toBeNull();
  });
});
