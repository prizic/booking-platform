import { describe, expect, it } from "vitest";
import { bucketCount } from "./count-buckets";
describe("persisted grouped counts", () => {
  it("distinguishes a complete empty group from unavailable data", () => {
    expect(bucketCount({ active: 3 }, "closed")).toBe(0);
    expect(bucketCount(undefined, "closed")).toBeUndefined();
    expect(bucketCount(null, "closed")).toBeUndefined();
  });
  it("retains observed counts without turning an invalid value into zero", () => {
    expect(bucketCount({ active: 3 }, "active")).toBe(3);
    expect(bucketCount({ active: NaN }, "active")).toBeUndefined();
  });
});
