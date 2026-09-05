import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";

const safeAssetPath = /^\/assets\/[A-Za-z0-9][A-Za-z0-9._/-]*$/u;
const assetKeys = ["logoLight", "logoDark", "icon", "favicon", "socialImage"];
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const assetLimits = Object.freeze({
  logoLight: { maxBytes: 2_000_000, maxDimension: 4096, maxPixels: 8_000_000 },
  logoDark: { maxBytes: 2_000_000, maxDimension: 4096, maxPixels: 8_000_000 },
  icon: { maxBytes: 1_000_000, maxDimension: 1024, maxPixels: 1_000_000 },
  favicon: { maxBytes: 1_000_000, maxDimension: 1024, maxPixels: 1_000_000 },
  socialImage: {
    maxBytes: 8_000_000,
    maxDimension: 4096,
    maxPixels: 16_000_000,
  },
});
const allowedPngChunks = new Set([
  "IHDR",
  "PLTE",
  "IDAT",
  "IEND",
  "cHRM",
  "gAMA",
  "pHYs",
  "sRGB",
  "tRNS",
]);
const pngColorTypes = new Map([
  [0, { channels: 1, bitDepths: new Set([1, 2, 4, 8, 16]) }],
  [2, { channels: 3, bitDepths: new Set([8, 16]) }],
  [3, { channels: 1, bitDepths: new Set([1, 2, 4, 8]) }],
  [4, { channels: 2, bitDepths: new Set([8, 16]) }],
  [6, { channels: 4, bitDepths: new Set([8, 16]) }],
]);
const crcTable = new Uint32Array(256);
for (let index = 0; index < crcTable.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  crcTable[index] = value >>> 0;
}

function assertContainedPath(canonicalRoot, canonicalSource, key) {
  const relative = path.relative(canonicalRoot, canonicalSource);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`)) {
    throw new Error(`Brand asset ${key} must stay inside the canonical assets root`);
  }
  if (path.isAbsolute(relative)) {
    throw new Error(`Brand asset ${key} must stay inside the canonical assets root`);
  }
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function validatePngBytes(bytes, key) {
  const limits = assetLimits[key] ?? assetLimits.socialImage;
  if (bytes.length > limits.maxBytes) {
    throw new Error(`Brand asset ${key} exceeds the ${limits.maxBytes}-byte PNG limit`);
  }
  if (
    bytes.length < pngSignature.length ||
    !bytes.subarray(0, 8).equals(pngSignature)
  ) {
    throw new Error(`Brand asset ${key} must contain valid PNG bytes`);
  }

  let offset = pngSignature.length;
  let header;
  let paletteSeen = false;
  let imageDataSeen = false;
  let imageDataEnded = false;
  let endSeen = false;
  const imageData = [];

  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) {
      throw new Error(`Brand asset ${key} contains a truncated PNG chunk`);
    }
    const length = bytes.readUInt32BE(offset);
    const typeOffset = offset + 4;
    const dataOffset = typeOffset + 4;
    const dataEnd = dataOffset + length;
    const chunkEnd = dataEnd + 4;
    if (dataEnd < dataOffset || chunkEnd > bytes.length) {
      throw new Error(`Brand asset ${key} contains a truncated PNG chunk`);
    }
    const type = bytes.toString("ascii", typeOffset, dataOffset);
    if (!/^[A-Za-z]{4}$/u.test(type) || !allowedPngChunks.has(type)) {
      throw new Error(`Brand asset ${key} contains unsupported PNG chunk ${type}`);
    }
    if (bytes.readUInt32BE(dataEnd) !== crc32(bytes.subarray(typeOffset, dataEnd))) {
      throw new Error(`Brand asset ${key} contains an invalid PNG checksum`);
    }
    const data = bytes.subarray(dataOffset, dataEnd);

    if (type === "IHDR") {
      if (header !== undefined || offset !== pngSignature.length || length !== 13) {
        throw new Error(`Brand asset ${key} contains an invalid PNG header`);
      }
      const width = data.readUInt32BE(0);
      const height = data.readUInt32BE(4);
      const bitDepth = data[8];
      const colorType = data[9];
      const color = pngColorTypes.get(colorType);
      if (
        width < 1 ||
        height < 1 ||
        width > limits.maxDimension ||
        height > limits.maxDimension ||
        width * height > limits.maxPixels
      ) {
        throw new Error(`Brand asset ${key} PNG dimensions exceed safe limits`);
      }
      if (
        !color?.bitDepths.has(bitDepth) ||
        data[10] !== 0 ||
        data[11] !== 0 ||
        data[12] !== 0
      ) {
        throw new Error(
          `Brand asset ${key} must use a supported non-interlaced PNG encoding`,
        );
      }
      header = { bitDepth, channels: color.channels, colorType, height, width };
    } else if (header === undefined) {
      throw new Error(`Brand asset ${key} PNG must begin with IHDR`);
    } else if (type === "PLTE") {
      if (
        imageDataSeen ||
        paletteSeen ||
        length < 3 ||
        length > 768 ||
        length % 3 !== 0
      ) {
        throw new Error(`Brand asset ${key} contains an invalid PNG palette`);
      }
      paletteSeen = true;
    } else if (type === "IDAT") {
      if (imageDataEnded || length === 0) {
        throw new Error(`Brand asset ${key} contains invalid PNG image data`);
      }
      imageDataSeen = true;
      imageData.push(data);
    } else if (type === "IEND") {
      if (!imageDataSeen || endSeen || length !== 0 || chunkEnd !== bytes.length) {
        throw new Error(`Brand asset ${key} contains an invalid PNG end marker`);
      }
      endSeen = true;
    } else if (imageDataSeen) {
      imageDataEnded = true;
    }

    offset = chunkEnd;
  }

  if (header === undefined || !imageDataSeen || !endSeen) {
    throw new Error(`Brand asset ${key} is an incomplete PNG`);
  }
  if (header.colorType === 3 && !paletteSeen) {
    throw new Error(`Brand asset ${key} indexed PNG is missing its palette`);
  }

  const rowBytes = Math.ceil((header.width * header.channels * header.bitDepth) / 8);
  const expectedLength = (rowBytes + 1) * header.height;
  let decoded;
  try {
    decoded = inflateSync(Buffer.concat(imageData), {
      maxOutputLength: expectedLength,
    });
  } catch {
    throw new Error(`Brand asset ${key} contains invalid compressed PNG data`);
  }
  if (decoded.length !== expectedLength) {
    throw new Error(`Brand asset ${key} contains incomplete PNG pixel data`);
  }
  for (let row = 0; row < header.height; row += 1) {
    if (decoded[row * (rowBytes + 1)] > 4) {
      throw new Error(`Brand asset ${key} contains an invalid PNG row filter`);
    }
  }
}

function removeUnsafeGeneratedAssets(directory) {
  if (!existsSync(directory)) return;
  const metadata = lstatSync(directory);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    rmSync(directory, { force: true, recursive: true });
    return;
  }
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      removeUnsafeGeneratedAssets(entryPath);
      continue;
    }
    if (entry.isSymbolicLink() || !entry.isFile()) {
      rmSync(entryPath, { force: true, recursive: true });
      continue;
    }
    const extension = path.extname(entry.name).toLowerCase();
    try {
      if (extension !== ".png") throw new Error("unsupported generated asset");
      validatePngBytes(readFileSync(entryPath), "socialImage");
    } catch {
      rmSync(entryPath, { force: true });
    }
  }
}

function readValidatedBrandAssetSource(instanceDirectory, key, assetPath) {
  if (!assetKeys.includes(key)) {
    throw new Error(`Brand asset ${key} is not a supported asset role`);
  }
  if (typeof assetPath !== "string" || !safeAssetPath.test(assetPath)) {
    throw new Error(`Brand asset ${key} must be a safe /assets/ path`);
  }
  const segments = assetPath.slice(1).split("/");
  if (
    segments.some(
      (segment) => segment.length === 0 || segment === "." || segment === "..",
    )
  ) {
    throw new Error(`Brand asset ${key} contains an unsafe path segment`);
  }

  const extension = path.extname(assetPath).toLowerCase();
  if (extension !== ".png") {
    throw new Error(`Brand asset ${key} must use PNG`);
  }

  const assetsRoot = path.join(instanceDirectory, "assets");
  let rootMetadata;
  try {
    rootMetadata = lstatSync(assetsRoot);
  } catch {
    throw new Error(`Brand asset ${key} assets root does not exist at ${assetsRoot}`);
  }
  if (rootMetadata.isSymbolicLink()) {
    throw new Error(`Brand asset ${key} assets root must not be a symbolic link`);
  }
  if (!rootMetadata.isDirectory()) {
    throw new Error(`Brand asset ${key} assets root must be a directory`);
  }
  const canonicalRoot = realpathSync(assetsRoot);

  let current = instanceDirectory;
  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment);
    let metadata;
    try {
      metadata = lstatSync(current);
    } catch {
      throw new Error(`Brand asset ${key} does not exist at ${current}`);
    }
    if (metadata.isSymbolicLink()) {
      throw new Error(`Brand asset ${key} must not contain a symbolic link`);
    }
    if (index < segments.length - 1 && !metadata.isDirectory()) {
      throw new Error(
        `Brand asset ${key} path parent must be a directory at ${current}`,
      );
    }
    if (index === segments.length - 1 && !metadata.isFile()) {
      throw new Error(`Brand asset ${key} must be a regular file at ${current}`);
    }
  }

  const canonicalSource = realpathSync(current);
  assertContainedPath(canonicalRoot, canonicalSource, key);
  const bytes = readFileSync(canonicalSource);
  validatePngBytes(bytes, key);
  return { bytes, source: canonicalSource };
}

export function validateBrandAssetSource(instanceDirectory, key, assetPath) {
  return readValidatedBrandAssetSource(instanceDirectory, key, assetPath).source;
}

function resolveBrandPath(repositoryRoot) {
  const configuredPath = process.env.WLBP_BRAND_CONFIG_PATH;
  const resolvedConfiguredPath = configuredPath
    ? path.resolve(repositoryRoot, configuredPath)
    : undefined;
  if (resolvedConfiguredPath) {
    const relative = path.relative(repositoryRoot, resolvedConfiguredPath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("WLBP_BRAND_CONFIG_PATH must stay inside the repository");
    }
  }
  const candidates = configuredPath
    ? [resolvedConfiguredPath]
    : [
        path.join(repositoryRoot, "instance", "brand.json"),
        path.join(repositoryRoot, "instance-template", "instance", "brand.json"),
      ];
  const brandPath = candidates.find((candidate) => existsSync(candidate));
  if (!brandPath) {
    throw new Error(`No brand configuration found. Checked: ${candidates.join(", ")}`);
  }
  return brandPath;
}

function copyConfiguredAssets(appDirectory, brandPath, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Brand configuration must be an object");
  }
  if (
    !value.assets ||
    typeof value.assets !== "object" ||
    Array.isArray(value.assets)
  ) {
    throw new Error("Brand configuration assets must be an object");
  }

  const instanceDirectory = path.dirname(brandPath);
  const assetsToCopy = [];
  for (const key of assetKeys) {
    const assetPath = value.assets[key];
    if (key === "logoDark" && assetPath === undefined) continue;
    const { bytes } = readValidatedBrandAssetSource(instanceDirectory, key, assetPath);
    const segments = assetPath.slice(1).split("/");
    assetsToCopy.push({ bytes, segments });
  }

  removeUnsafeGeneratedAssets(path.join(appDirectory, "public", "assets"));
  for (const { bytes, segments } of assetsToCopy) {
    const destination = path.join(appDirectory, "public", ...segments);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, bytes, { flag: "w" });
  }
}

export function loadInstanceBrand(appDirectory) {
  const repositoryRoot = path.resolve(appDirectory, "../..");
  const brandPath = resolveBrandPath(repositoryRoot);
  const serialized = readFileSync(brandPath, "utf8");
  const value = JSON.parse(serialized);
  copyConfiguredAssets(appDirectory, brandPath, value);
  return Object.freeze({ path: brandPath, serialized: JSON.stringify(value) });
}
