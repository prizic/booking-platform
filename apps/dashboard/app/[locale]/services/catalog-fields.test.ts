import { describe, expect, it } from "vitest";
import { catalogPriceInput } from "./catalog-fields";
describe("exact service money editing", () => {
  it("round-trips the largest safe minor amount without floating division", () => {
    expect(catalogPriceInput(9007199254740991)).toBe("90071992547409.91");
    expect(catalogPriceInput(1)).toBe("0.01");
    expect(catalogPriceInput(0)).toBe("0.00");
  });
  it("rejects values outside the integer contract", () => {
    for (const value of [-1, 0.1, Number.POSITIVE_INFINITY, 9007199254740992])
      expect(() => catalogPriceInput(value)).toThrow();
  });
});
