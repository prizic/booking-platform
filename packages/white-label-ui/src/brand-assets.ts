export interface BrandAssets {
  readonly logoLight: string;
  readonly logoDark?: string;
  readonly icon: string;
  readonly favicon: string;
  readonly socialImage: string;
}

export interface ResolvedBrandAssets {
  readonly logo: string;
  readonly icon: string;
  readonly favicon: string;
  readonly socialImage: string;
}

export type BrandColorScheme = "light" | "dark";

const requiredAssetKeys = ["logoLight", "icon", "favicon", "socialImage"] as const;
const allowedAssetKeys = new Set([...requiredAssetKeys, "logoDark"]);
const publicAssetPathPattern = /^\/assets\/[A-Za-z0-9][A-Za-z0-9._/-]*$/u;
const rasterExtensionsByAsset = {
  logoLight: new Set(["png"]),
  logoDark: new Set(["png"]),
  icon: new Set(["png"]),
  favicon: new Set(["png"]),
  socialImage: new Set(["png"]),
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafePublicAssetPath(
  value: unknown,
  key: keyof typeof rasterExtensionsByAsset,
): value is string {
  if (typeof value !== "string" || !publicAssetPathPattern.test(value)) return false;
  const segments = value.split("/").slice(2);
  if (
    !segments.every(
      (segment) => segment.length > 0 && segment !== "." && segment !== "..",
    )
  ) {
    return false;
  }
  const extension = value.slice(value.lastIndexOf(".") + 1).toLowerCase();
  return rasterExtensionsByAsset[key].has(extension);
}

export function parseBrandAssets(value: unknown): BrandAssets {
  if (!isRecord(value)) throw new Error("Brand assets must be an object");

  const unexpected = Object.keys(value).filter((key) => !allowedAssetKeys.has(key));
  if (unexpected.length > 0) {
    throw new Error(`Brand assets have unexpected key(s): ${unexpected.join(", ")}`);
  }
  for (const key of requiredAssetKeys) {
    if (!isSafePublicAssetPath(value[key], key)) {
      throw new Error(
        `Brand assets ${key} must be a safe root-relative supported raster /assets/ path`,
      );
    }
  }
  if (
    value.logoDark !== undefined &&
    !isSafePublicAssetPath(value.logoDark, "logoDark")
  ) {
    throw new Error(
      "Brand assets logoDark must be a safe root-relative supported raster /assets/ path",
    );
  }

  return Object.freeze({
    logoLight: value.logoLight as string,
    ...(value.logoDark === undefined ? {} : { logoDark: value.logoDark as string }),
    icon: value.icon as string,
    favicon: value.favicon as string,
    socialImage: value.socialImage as string,
  });
}

export function resolveBrandAssets(
  value: unknown,
  colorScheme: BrandColorScheme,
): ResolvedBrandAssets {
  const assets = parseBrandAssets(value);
  return Object.freeze({
    logo:
      colorScheme === "dark" ? (assets.logoDark ?? assets.logoLight) : assets.logoLight,
    icon: assets.icon,
    favicon: assets.favicon,
    socialImage: assets.socialImage,
  });
}
