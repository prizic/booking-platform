import { parseBrandAssets, type BrandAssets } from "./brand-assets.js";
import { parseBrandTokens, type BrandTokens } from "./brand-tokens.js";

export type BrandTheme = "light" | "dark";

export interface BrandAppearance {
  /** Theme a first-time visitor sees. Dark requires `tokens.colorDark`. */
  readonly defaultTheme: BrandTheme;
}

export interface BrandConfig {
  readonly name: string;
  readonly assets: BrandAssets;
  readonly tokens: BrandTokens;
  readonly appearance: BrandAppearance;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAppearance(value: unknown, tokens: BrandTokens): BrandAppearance {
  if (value === undefined) return Object.freeze({ defaultTheme: "light" });
  if (!isRecord(value))
    throw new Error("Brand configuration appearance must be an object");
  const unexpected = Object.keys(value).filter((key) => key !== "defaultTheme");
  if (unexpected.length > 0) {
    throw new Error(`Brand appearance has unexpected key(s): ${unexpected.join(", ")}`);
  }
  if (value.defaultTheme !== "light" && value.defaultTheme !== "dark") {
    throw new Error('Brand appearance defaultTheme must be "light" or "dark"');
  }
  if (value.defaultTheme === "dark" && tokens.colorDark === undefined) {
    throw new Error("Brand appearance defaultTheme dark requires tokens.colorDark");
  }
  return Object.freeze({ defaultTheme: value.defaultTheme });
}

export function parseBrandConfig(value: unknown): BrandConfig {
  if (!isRecord(value)) throw new Error("Brand configuration must be an object");

  const expectedKeys = new Set(["name", "assets", "tokens", "appearance"]);
  const unexpectedKeys = Object.keys(value).filter((key) => !expectedKeys.has(key));
  if (unexpectedKeys.length > 0) {
    throw new Error(
      `Brand configuration has unexpected key(s): ${unexpectedKeys.join(", ")}`,
    );
  }
  if (typeof value.name !== "string" || value.name.trim().length === 0) {
    throw new Error("Brand configuration name must be a non-empty string");
  }

  const tokens = parseBrandTokens(value.tokens);
  return Object.freeze({
    name: value.name.trim(),
    assets: parseBrandAssets(value.assets),
    tokens,
    appearance: parseAppearance(value.appearance, tokens),
  });
}
