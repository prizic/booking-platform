import { describe, expect, it } from "vitest";
import { recoveryFormSchema, recoveryRequestSchema } from "./recovery-schema";
import { journeyMessage } from "../../_lib/journey-copy";

describe("R5 recovery form", () => {
  it("needs only email and normalizes it identically in the browser and server", () => {
    const input = { email: "  Guest@Example.Invalid  " };
    expect(recoveryFormSchema.parse(input)).toEqual({ email: "guest@example.invalid" });
    expect(
      recoveryRequestSchema.parse({
        ...input,
        requestId: "10000000-0000-4000-8000-000000000001",
      }).email,
    ).toBe("guest@example.invalid");
  });
  it("rejects account and reference input, unsafe addresses and oversized input", () => {
    for (const input of [
      { email: "guest@example.invalid", reference: "ABC123" },
      { email: "guest@example.invalid", password: "password" },
      { email: "x".repeat(321) + "@example.invalid" },
      { email: "x\n@example.invalid" },
      { email: "<x>@example.invalid" },
    ]) {
      expect(recoveryFormSchema.safeParse(input).success).toBe(false);
    }
  });
  it("uses the exact generic acceptance promise in both languages", () => {
    expect(journeyMessage("en", "recoveryAccepted")).toBe(
      "If a booking exists, we've sent a link.",
    );
    expect(journeyMessage("ar", "recoveryAccepted")).toBe(
      "إذا كان هناك حجز، فقد أرسلنا رابطًا.",
    );
  });
});
