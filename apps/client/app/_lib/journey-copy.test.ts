import { assertMessageParity } from "@wlbp/i18n";
import { describe, expect, it } from "vitest";
import { journeyCopy } from "./journey-copy";
describe("Client journey localization", () => {
  it("keeps complete nonempty English and Arabic message parity", () => {
    expect(() => assertMessageParity(journeyCopy)).not.toThrow();
    for (const locale of ["en", "ar"] as const)
      expect(Object.values(journeyCopy[locale]).every((value) => value.trim())).toBe(
        true,
      );
  });
});
