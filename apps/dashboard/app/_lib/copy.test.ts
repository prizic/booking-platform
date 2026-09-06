import { assertMessageParity } from "@wlbp/i18n";
import { describe, expect, it } from "vitest";

import { dashboardCopy } from "./copy";
import { brandPreviewCopy } from "./brand-preview-copy";
import { teamResourcesCopy } from "./team-resources-copy";

describe("Dashboard message catalog", () => {
  it("keeps English and Arabic keys in parity", () => {
    expect(() => assertMessageParity(dashboardCopy)).not.toThrow();
    expect(() => assertMessageParity(brandPreviewCopy)).not.toThrow();
    expect(() => assertMessageParity(teamResourcesCopy)).not.toThrow();
  });

  it("contains no empty localized values", () => {
    expect(
      Object.values(dashboardCopy.en).every((value) => value.trim().length > 0),
    ).toBe(true);
    expect(
      Object.values(dashboardCopy.ar).every((value) => value.trim().length > 0),
    ).toBe(true);
    expect(
      Object.values(teamResourcesCopy.en).every((value) => value.trim().length > 0),
    ).toBe(true);
    expect(
      Object.values(teamResourcesCopy.ar).every((value) => value.trim().length > 0),
    ).toBe(true);
  });

  it("provides distinct English and Arabic recovery messages for every no-slot reason", () => {
    const keys = [
      "availabilityNoSlots",
      "availabilityNoSlotsCapacity",
      "availabilityNoSlotsPolicy",
      "availabilityNoSlotsWindow",
    ] as const;

    for (const locale of ["en", "ar"] as const) {
      const messages = keys.map((key) => dashboardCopy[locale][key]);
      expect(new Set(messages).size).toBe(keys.length);
      expect(messages.every((message) => message.trim().length > 0)).toBe(true);
    }
  });
});
