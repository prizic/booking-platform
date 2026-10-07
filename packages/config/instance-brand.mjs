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
import { deflateSync, inflateSync } from "node:zlib";

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

/*
 * Installable-app icons. Browsers want square 192 px and 512 px icons (plus
 * "maskable" variants whose artwork sits inside the safe zone), and iOS wants
 * an opaque 180 px apple-touch-icon. Tenants supply one square-ish brand icon
 * of any validated size, so the build derives these sizes from it here, with
 * no image dependency: the source PNG is already fully validated above, so it
 * is decoded, resampled with premultiplied alpha, and re-encoded as RGBA PNG.
 * The output lives under /assets/_pwa/, a path a tenant asset can never use
 * (tenant asset paths must start with a letter or digit).
 */
export const pwaIconDirectory = "/assets/_pwa";
const pwaIcons = Object.freeze([
  { file: "icon-192.png", size: 192, opaque: false, artwork: 1 },
  { file: "icon-512.png", size: 512, opaque: false, artwork: 1 },
  // A maskable icon may be cropped to a circle of 80 % diameter; the
  // inscribed square of that circle is ~56 % of the canvas.
  { file: "maskable-192.png", size: 192, opaque: true, artwork: 0.56 },
  { file: "maskable-512.png", size: 512, opaque: true, artwork: 0.56 },
  { file: "apple-touch-icon.png", size: 180, opaque: true, artwork: 0.72 },
]);

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpLeft = Math.abs(estimate - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) return left;
  return toUp <= toUpLeft ? up : upLeft;
}

/** Decodes an already-validated PNG into straight-alpha RGBA, 8 bits per channel. */
export function decodePngToRgba(bytes) {
  let offset = pngSignature.length;
  let header;
  let palette;
  let transparency;
  const imageData = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
      };
    } else if (type === "PLTE") palette = data;
    else if (type === "tRNS") transparency = data;
    else if (type === "IDAT") imageData.push(data);
    offset += length + 12;
  }
  const { width, height, bitDepth, colorType } = header;
  const channels = pngColorTypes.get(colorType).channels;
  const bytesPerPixel = Math.max(1, (channels * bitDepth) >> 3);
  const rowBytes = Math.ceil((width * channels * bitDepth) / 8);
  const raw = inflateSync(Buffer.concat(imageData));
  const pixels = Buffer.alloc(rowBytes * height);
  for (let row = 0; row < height; row += 1) {
    const filter = raw[row * (rowBytes + 1)];
    const line = raw.subarray(row * (rowBytes + 1) + 1, (row + 1) * (rowBytes + 1));
    const current = pixels.subarray(row * rowBytes, (row + 1) * rowBytes);
    const previous =
      row === 0 ? undefined : pixels.subarray((row - 1) * rowBytes, row * rowBytes);
    for (let index = 0; index < rowBytes; index += 1) {
      const left = index >= bytesPerPixel ? current[index - bytesPerPixel] : 0;
      const up = previous === undefined ? 0 : previous[index];
      const upLeft =
        previous === undefined || index < bytesPerPixel
          ? 0
          : previous[index - bytesPerPixel];
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) predictor = paeth(left, up, upLeft);
      current[index] = (line[index] + predictor) & 0xff;
    }
  }

  const maximum = (1 << bitDepth) - 1;
  const sample = (row, index) => {
    if (bitDepth === 16) return row.readUInt16BE(index * 2);
    if (bitDepth === 8) return row[index];
    const bit = index * bitDepth;
    return (row[bit >> 3] >> (8 - bitDepth - (bit & 7))) & maximum;
  };
  const scale = (value) =>
    bitDepth === 16 ? value >> 8 : Math.round((value * 255) / maximum);
  let transparentKey;
  if (colorType === 0 && transparency?.length >= 2) {
    transparentKey = [transparency.readUInt16BE(0)];
  } else if (colorType === 2 && transparency?.length >= 6) {
    transparentKey = [0, 2, 4].map((at) => transparency.readUInt16BE(at));
  }

  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const row = pixels.subarray(y * rowBytes, (y + 1) * rowBytes);
    for (let x = 0; x < width; x += 1) {
      const target = (y * width + x) * 4;
      let values;
      let alpha = 255;
      if (colorType === 3) {
        const entry = sample(row, x);
        values = [0, 1, 2].map((channel) => palette[entry * 3 + channel] ?? 0);
        alpha = transparency?.[entry] ?? 255;
      } else {
        const rawValues = Array.from({ length: channels }, (_, channel) =>
          sample(row, x * channels + channel),
        );
        const colour = colorType === 0 || colorType === 4 ? 1 : 3;
        if (
          transparentKey !== undefined &&
          transparentKey.every((value, channel) => value === rawValues[channel])
        ) {
          alpha = 0;
        }
        if (colorType === 4 || colorType === 6) alpha = scale(rawValues[colour]);
        const colourValues = rawValues.slice(0, colour).map(scale);
        values =
          colour === 1
            ? [colourValues[0], colourValues[0], colourValues[0]]
            : colourValues;
      }
      rgba[target] = values[0];
      rgba[target + 1] = values[1];
      rgba[target + 2] = values[2];
      rgba[target + 3] = alpha;
    }
  }
  return { width, height, rgba };
}

/** Tent-filter weights whose support widens when shrinking, so downscales average. */
function resampleWeights(sourceSize, targetSize) {
  const ratio = sourceSize / targetSize;
  const support = Math.max(1, ratio);
  return Array.from({ length: targetSize }, (_, target) => {
    const centre = (target + 0.5) * ratio - 0.5;
    const taps = [];
    let total = 0;
    for (
      let source = Math.ceil(centre - support);
      source <= Math.floor(centre + support);
      source += 1
    ) {
      const weight = Math.max(0, 1 - Math.abs(source - centre) / support);
      if (weight === 0) continue;
      taps.push([Math.min(sourceSize - 1, Math.max(0, source)), weight]);
      total += weight;
    }
    if (taps.length === 0) {
      taps.push([Math.min(sourceSize - 1, Math.max(0, Math.round(centre))), 1]);
      total = 1;
    }
    return taps.map(([source, weight]) => [source, weight / total]);
  });
}

/** Resizes straight-alpha RGBA to premultiplied float RGBA of the target size. */
function resizePremultiplied(image, targetWidth, targetHeight) {
  const { width, height, rgba } = image;
  const premultiplied = new Float64Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const alpha = rgba[index * 4 + 3] / 255;
    premultiplied[index * 4] = rgba[index * 4] * alpha;
    premultiplied[index * 4 + 1] = rgba[index * 4 + 1] * alpha;
    premultiplied[index * 4 + 2] = rgba[index * 4 + 2] * alpha;
    premultiplied[index * 4 + 3] = alpha;
  }
  const horizontal = resampleWeights(width, targetWidth);
  const vertical = resampleWeights(height, targetHeight);
  const intermediate = new Float64Array(targetWidth * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      for (const [source, weight] of horizontal[x]) {
        for (let channel = 0; channel < 4; channel += 1) {
          intermediate[(y * targetWidth + x) * 4 + channel] +=
            premultiplied[(y * width + source) * 4 + channel] * weight;
        }
      }
    }
  }
  const output = new Float64Array(targetWidth * targetHeight * 4);
  for (let y = 0; y < targetHeight; y += 1) {
    for (const [source, weight] of vertical[y]) {
      for (let x = 0; x < targetWidth; x += 1) {
        for (let channel = 0; channel < 4; channel += 1) {
          output[(y * targetWidth + x) * 4 + channel] +=
            intermediate[(source * targetWidth + x) * 4 + channel] * weight;
        }
      }
    }
  }
  return output;
}

function parseHexColour(value) {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/iu.exec(
    typeof value === "string" ? value : "",
  );
  return match === null
    ? [255, 255, 255]
    : match.slice(1).map((pair) => Number.parseInt(pair, 16));
}

/**
 * Draws the icon centred on a square canvas: transparent for "any" icons, or
 * over the brand background for opaque maskable and apple-touch icons.
 */
export function renderSquareIcon(image, size, { artwork = 1, background } = {}) {
  const fit = Math.max(1, Math.round(size * artwork));
  const scale = fit / Math.max(image.width, image.height);
  const drawWidth = Math.max(1, Math.round(image.width * scale));
  const drawHeight = Math.max(1, Math.round(image.height * scale));
  const drawn = resizePremultiplied(image, drawWidth, drawHeight);
  const left = Math.floor((size - drawWidth) / 2);
  const top = Math.floor((size - drawHeight) / 2);
  const canvas = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const target = (y * size + x) * 4;
      const inside =
        x >= left && x < left + drawWidth && y >= top && y < top + drawHeight;
      const source = inside ? ((y - top) * drawWidth + (x - left)) * 4 : -1;
      const alpha = source < 0 ? 0 : Math.min(1, Math.max(0, drawn[source + 3]));
      const colour = [0, 1, 2].map((channel) =>
        source < 0 ? 0 : drawn[source + channel],
      );
      if (background === undefined) {
        // Un-premultiply back to straight alpha.
        for (let channel = 0; channel < 3; channel += 1) {
          canvas[target + channel] =
            alpha === 0 ? 0 : Math.round(Math.min(255, colour[channel] / alpha));
        }
        canvas[target + 3] = Math.round(alpha * 255);
      } else {
        // Source-over onto the opaque brand background.
        for (let channel = 0; channel < 3; channel += 1) {
          canvas[target + channel] = Math.round(
            Math.min(255, colour[channel] + background[channel] * (1 - alpha)),
          );
        }
        canvas[target + 3] = 255;
      }
    }
  }
  return { width: size, height: size, rgba: canvas };
}

function pngChunk(type, data) {
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const chunk = Buffer.alloc(typeAndData.length + 8);
  chunk.writeUInt32BE(data.length, 0);
  typeAndData.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(typeAndData), typeAndData.length + 4);
  return chunk;
}

/** Encodes straight-alpha RGBA as a non-interlaced 8-bit RGBA PNG. */
export function encodeRgbaPng({ width, height, rgba }) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    rows[y * (width * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(
      rows,
      y * (width * 4 + 1) + 1,
    );
  }
  return Buffer.concat([
    pngSignature,
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(rows, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function writePwaIcons(appDirectory, iconBytes, backgroundColour) {
  const image = decodePngToRgba(iconBytes);
  const background = parseHexColour(backgroundColour);
  const directory = path.join(
    appDirectory,
    "public",
    ...pwaIconDirectory.slice(1).split("/"),
  );
  mkdirSync(directory, { recursive: true });
  for (const icon of pwaIcons) {
    const rendered = renderSquareIcon(image, icon.size, {
      artwork: icon.artwork,
      background: icon.opaque ? background : undefined,
    });
    writeFileSync(path.join(directory, icon.file), encodeRgbaPng(rendered), {
      flag: "w",
    });
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
    assetsToCopy.push({ bytes, key, segments });
  }

  removeUnsafeGeneratedAssets(path.join(appDirectory, "public", "assets"));
  for (const { bytes, segments } of assetsToCopy) {
    const destination = path.join(appDirectory, "public", ...segments);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, bytes, { flag: "w" });
  }
  const icon = assetsToCopy.find((asset) => asset.key === "icon");
  writePwaIcons(appDirectory, icon.bytes, value.tokens?.color?.background);
}

export function loadInstanceBrand(appDirectory) {
  const repositoryRoot = path.resolve(appDirectory, "../..");
  const brandPath = resolveBrandPath(repositoryRoot);
  const serialized = readFileSync(brandPath, "utf8");
  const value = JSON.parse(serialized);
  copyConfiguredAssets(appDirectory, brandPath, value);
  return Object.freeze({ path: brandPath, serialized: JSON.stringify(value) });
}

/**
 * Loads the instance's localized text (content/en.json and content/ar.json)
 * from the same instance directory as brand.json. A fixture brand that ships
 * no content falls back to the canonical instance content.
 */
export function loadInstanceContent(appDirectory) {
  const repositoryRoot = path.resolve(appDirectory, "../..");
  const brandDirectory = path.dirname(resolveBrandPath(repositoryRoot));
  const candidates = [
    path.join(brandDirectory, "content"),
    path.join(repositoryRoot, "instance", "content"),
    path.join(repositoryRoot, "instance-template", "instance", "content"),
  ];
  const directory = candidates.find((candidate) =>
    existsSync(path.join(candidate, "en.json")),
  );
  if (!directory) {
    throw new Error(`No instance content found. Checked: ${candidates.join(", ")}`);
  }
  const content = {
    en: JSON.parse(readFileSync(path.join(directory, "en.json"), "utf8")),
    ar: JSON.parse(readFileSync(path.join(directory, "ar.json"), "utf8")),
  };
  return Object.freeze({ path: directory, serialized: JSON.stringify(content) });
}
