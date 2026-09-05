import { assertMessageParity } from "@wlbp/i18n";
import { describe, expect, it } from "vitest";

import { clientCopy } from "./copy";

describe("Client message catalog", () => {
  it("keeps English and Arabic keys and interpolation slots in parity", () => {
    expect(() => assertMessageParity(clientCopy)).not.toThrow();

    for (const key of Object.keys(clientCopy.en)) {
      const placeholders = (message: string) =>
        [...message.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/gu)]
          .map((match) => match[1])
          .sort();
      expect(placeholders(clientCopy.ar[key as keyof typeof clientCopy.ar])).toEqual(
        placeholders(clientCopy.en[key as keyof typeof clientCopy.en]),
      );
    }
  });

  it("contains no empty localized values", () => {
    expect(Object.values(clientCopy.en).every((value) => value.trim().length > 0)).toBe(
      true,
    );
    expect(Object.values(clientCopy.ar).every((value) => value.trim().length > 0)).toBe(
      true,
    );
  });
});
