import { describe, expect, it } from "vitest";

import {
  assertMessageParity,
  createTranslator,
  formatNumber,
  workspaceMessages,
} from "./index.js";

describe("shared workspace presentation messages", () => {
  it("keeps English and Arabic message keys complete", () => {
    expect(() => assertMessageParity(workspaceMessages)).not.toThrow();
    for (const key of Object.keys(workspaceMessages.en)) {
      expect(
        createTranslator("ar", workspaceMessages.ar)(key, {
          page: "١",
          pageCount: "٢",
          start: "١",
          end: "١٠",
          total: "٢٠",
          column: "الاسم",
        }),
      ).toBeTruthy();
    }
  });

  it("names collapse, retry, and sorting actions in Arabic and formats complete pagination messages", () => {
    const ar = createTranslator("ar", workspaceMessages.ar);
    expect(ar("workspace.expandNavigation")).toBe("توسيع قائمة التنقل");
    expect(ar("workspace.retry")).toBe("المحاولة مجددًا");
    expect(
      ar("workspace.page", {
        page: formatNumber(2, "ar"),
        pageCount: formatNumber(4, "ar"),
      }),
    ).toBe("الصفحة ٢ من ٤");
    expect(ar("workspace.sortDescending", { column: "الاسم" })).toBe(
      "ترتيب الاسم تنازليًا",
    );
  });
});
