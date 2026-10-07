import { existsSync, readFileSync } from "node:fs";
import { assertMessageParity } from "@wlbp/i18n";
import { describe, expect, it } from "vitest";

import { clientCopy } from "./copy";

/** Tenant-facing text the Client reads from instance/content/{en,ar}.json. */
const clientInstanceKeys = [
  "brand.name",
  "brand.tagline",
  "site.title",
  "site.description",
  "navigation.services",
  "navigation.contact",
  "home.hero.title",
  "home.hero.summary",
  "home.hero.primaryAction",
  "home.hero.secondaryAction",
  "home.services.title",
  "home.services.intro",
  "home.services.bookAction",
  "home.availability.title",
  "home.availability.intro",
  "home.manage.title",
  "home.manage.body",
  "footer.contact.title",
  "footer.contact.body",
  "footer.rights",
] as const;

function readInstanceContent(locale: "en" | "ar"): Record<string, string> {
  for (const relativePath of [
    "../../../../instance/content/",
    "../../../../instance-template/instance/content/",
  ]) {
    const file = new URL(`${relativePath}${locale}.json`, import.meta.url);
    if (existsSync(file))
      return JSON.parse(readFileSync(file, "utf8")) as Record<string, string>;
  }
  throw new Error("Instance content is missing");
}

function placeholders(message: string): string[] {
  return [...message.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/gu)]
    .map((match) => match[1]!)
    .sort();
}

describe("Client message catalog", () => {
  it("keeps English and Arabic keys and interpolation slots in parity", () => {
    expect(() => assertMessageParity(clientCopy)).not.toThrow();

    for (const key of Object.keys(clientCopy.en)) {
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

  it("leaves tenant marketing text to the instance content files", () => {
    for (const moved of [
      "eyebrow",
      "title",
      "summary",
      "primaryAction",
      "secondaryAction",
    ]) {
      expect(Object.hasOwn(clientCopy.en, moved)).toBe(false);
      expect(Object.hasOwn(clientCopy.ar, moved)).toBe(false);
    }
  });

  it("never hand-writes digits into Arabic step labels", () => {
    for (const key of [
      "bookingStepSlot",
      "bookingStepDetails",
      "bookingStepConfirmed",
    ] as const) {
      expect(clientCopy.ar[key]).not.toMatch(/[0-9٠-٩]/u);
      expect(clientCopy.en[key]).not.toMatch(/[0-9]/u);
    }
  });
});

describe("Client instance content", () => {
  const en = readInstanceContent("en");
  const ar = readInstanceContent("ar");

  it("provides every key the Client reads, in both languages", () => {
    for (const key of clientInstanceKeys) {
      expect(en[key]?.trim(), `en ${key}`).toBeTruthy();
      expect(ar[key]?.trim(), `ar ${key}`).toBeTruthy();
    }
  });

  it("keeps interpolation slots identical across languages", () => {
    for (const key of clientInstanceKeys) {
      expect(placeholders(ar[key]!), key).toEqual(placeholders(en[key]!));
    }
  });
});
