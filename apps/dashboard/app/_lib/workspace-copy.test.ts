import { assertMessageParity } from "@wlbp/i18n";
import { describe, expect, it } from "vitest";

import { countLabel, workspaceCopy, workspacePlurals } from "./workspace-copy";

describe("Workspace frame copy", () => {
  it("keeps English and Arabic keys in parity with no empty values", () => {
    expect(() => assertMessageParity(workspaceCopy)).not.toThrow();
    for (const locale of ["en", "ar"] as const) {
      expect(
        Object.values(workspaceCopy[locale]).every((value) => value.trim() !== ""),
      ).toBe(true);
    }
    expect(Object.keys(workspacePlurals.ar).sort()).toEqual(
      Object.keys(workspacePlurals.en).sort(),
    );
  });

  it("chooses the plural form by count instead of printing '1 items'", () => {
    expect(countLabel("en", "items", 1)).toBe("1 item");
    expect(countLabel("en", "items", 3)).toBe("3 items");
    expect(countLabel("ar", "notes", 1)).toBe("ملاحظة واحدة");
    expect(countLabel("ar", "notes", 2)).toBe("ملاحظتان");
    expect(countLabel("ar", "notes", 3)).toBe("٣ ملاحظات");
    expect(countLabel("ar", "notes", 11)).toBe("١١ ملاحظة");
  });
});
