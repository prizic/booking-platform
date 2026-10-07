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

/** Public path of the installable-app icons generated from the brand icon. */
export declare const pwaIconDirectory: "/assets/_pwa";

export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

export function decodePngToRgba(bytes: Buffer): RgbaImage;

export function renderSquareIcon(
  image: RgbaImage,
  size: number,
  options?: { artwork?: number; background?: readonly [number, number, number] },
): RgbaImage;

export function encodeRgbaPng(image: RgbaImage): Buffer;

export function loadInstanceBrand(appDirectory: string): LoadedInstanceBrand;

export declare function loadInstanceContent(appDirectory: string): Readonly<{
  path: string;
  serialized: string;
}>;
