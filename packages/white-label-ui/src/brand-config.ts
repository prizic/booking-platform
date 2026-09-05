import { parseBrandAssets, type BrandAssets } from "./brand-assets.js";
import { parseBrandTokens, type BrandTokens } from "./brand-tokens.js";

export interface BrandConfig {
  readonly name: string;
  readonly assets: BrandAssets;
  readonly tokens: BrandTokens;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseBrandConfig(value: unknown): BrandConfig {
  if (!isRecord(value)) throw new Error("Brand configuration must be an object");

  const expectedKeys = new Set(["name", "assets", "tokens"]);
  const unexpectedKeys = Object.keys(value).filter((key) => !expectedKeys.has(key));
  if (unexpectedKeys.length > 0) {
    throw new Error(
      `Brand configuration has unexpected key(s): ${unexpectedKeys.join(", ")}`,
    );
  }
  if (typeof value.name !== "string" || value.name.trim().length === 0) {
    throw new Error("Brand configuration name must be a non-empty string");
  }

  return Object.freeze({
    name: value.name.trim(),
    assets: parseBrandAssets(value.assets),
    tokens: parseBrandTokens(value.tokens),
  });
}
