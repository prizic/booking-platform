import { describe, expect, it } from "vitest";
import { parseCurrencyMinorUnits } from "./index.js";
describe("exact currency input", () => {
  it("accepts exact minor units and Arabic decimals", () => {
    expect(parseCurrencyMinorUnits("19.95", "USD")).toBe(1995);
    expect(parseCurrencyMinorUnits("١٩٫٩٥", "USD")).toBe(1995);
    expect(parseCurrencyMinorUnits("19", "JPY")).toBe(19);
    expect(parseCurrencyMinorUnits("1.234", "KWD")).toBe(1234);
  });
  it("refuses rounding, grouping, negatives, exponent notation and unsafe magnitudes", () => {
    for (const value of ["19.951", "1,000.00", "-1.00", "1e3", "900719925474099.99"])
      expect(parseCurrencyMinorUnits(value, "USD")).toBeNull();
    expect(parseCurrencyMinorUnits("19.1", "JPY")).toBeNull();
  });
});
