import { assertMessageParity } from "@wlbp/i18n";
import { describe, expect, it } from "vitest";

import { dashboardCopy } from "./copy";
import { brandPreviewCopy } from "./brand-preview-copy";

describe("Dashboard message catalog", () => {
  it("keeps English and Arabic keys in parity", () => {
    expect(() => assertMessageParity(dashboardCopy)).not.toThrow();
    expect(() => assertMessageParity(brandPreviewCopy)).not.toThrow();
  });

  it("contains no empty localized values", () => {
    expect(
      Object.values(dashboardCopy.en).every((value) => value.trim().length > 0),
    ).toBe(true);
    expect(
      Object.values(dashboardCopy.ar).every((value) => value.trim().length > 0),
    ).toBe(true);
  });
});
