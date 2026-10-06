import { describe, expect, it } from "vitest";
import { readPages } from "./read-pages";

describe("complete operator selections", () => {
  it("includes targets beyond the first page", async () => {
    const rows = Array.from({ length: 203 }, (_, i) => i);
    const offsets: number[] = [];
    const result = await readPages(async (offset, limit) => {
      offsets.push(offset);
      return { ok: true, data: rows.slice(offset, offset + limit) };
    });
    expect(result).toEqual({ ok: true, data: rows });
    expect(offsets).toEqual([0, 100, 200]);
  });
  it("does not present an incomplete selection after a failed page", async () => {
    const result = await readPages(async (offset) =>
      offset === 0
        ? { ok: true, data: Array.from({ length: 100 }, (_, i) => i) }
        : { ok: false, code: "unavailable" },
    );
    expect(result).toEqual({ ok: false, code: "unavailable" });
  });
});
