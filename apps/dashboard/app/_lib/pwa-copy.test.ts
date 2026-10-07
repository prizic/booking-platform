import { describe, expect, it } from "vitest";

import { pwaCopy } from "./pwa-copy";

const slots = (message: string) =>
  [...message.matchAll(/\{(\w+)\}/gu)].map((match) => match[1]).sort();

describe("installable-app copy", () => {
  it("has every message in English and Arabic with the same placeholders", () => {
    expect(Object.keys(pwaCopy.ar).sort()).toEqual(Object.keys(pwaCopy.en).sort());
    for (const [key, english] of Object.entries(pwaCopy.en)) {
      const arabic = pwaCopy.ar[key as keyof typeof pwaCopy.ar];
      expect(english.trim(), key).not.toBe("");
      expect(arabic.trim(), key).not.toBe("");
      expect(slots(arabic), key).toEqual(slots(english));
    }
  });
});
