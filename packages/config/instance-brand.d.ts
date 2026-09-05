export interface LoadedInstanceBrand {
  readonly path: string;
  readonly serialized: string;
}

export type BrandAssetKey =
  "logoLight" | "logoDark" | "icon" | "favicon" | "socialImage";

export function validateBrandAssetSource(
  instanceDirectory: string,
  assetKey: BrandAssetKey,
  assetPath: string,
): string;

export function loadInstanceBrand(appDirectory: string): LoadedInstanceBrand;
