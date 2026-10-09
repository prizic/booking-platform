import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  decodePngToRgba,
  encodeRgbaPng,
  loadInstanceBrand,
  renderSquareIcon,
} from "./instance-brand.mjs";

const pngBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const temporaryDirectories = [];

function createRepository(assetPath = "/assets/logo.png") {
  const repositoryRoot = mkdtempSync(path.join(tmpdir(), "wlbp-brand-"));
  temporaryDirectories.push(repositoryRoot);
  const appDirectory = path.join(repositoryRoot, "apps", "client");
  const instanceDirectory = path.join(repositoryRoot, "instance");
  mkdirSync(appDirectory, { recursive: true });
  mkdirSync(path.join(instanceDirectory, "assets"), { recursive: true });
  writeFileSync(
    path.join(instanceDirectory, "brand.json"),
    JSON.stringify({
      name: "Test brand",
      assets: {
        logoLight: assetPath,
        icon: assetPath,
        favicon: assetPath,
        socialImage: assetPath,
      },
      tokens: {},
    }),
  );
  return { appDirectory, instanceDirectory, repositoryRoot };
}

afterEach(() => {
  delete process.env.WLBP_BRAND_CONFIG_PATH;
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("loadInstanceBrand asset materialization", () => {
  it("copies a regular raster asset whose bytes match its declared type", () => {
    const { appDirectory, instanceDirectory } = createRepository();
    writeFileSync(path.join(instanceDirectory, "assets", "logo.png"), pngBytes);

    loadInstanceBrand(appDirectory);

    expect(
      readFileSync(path.join(appDirectory, "public", "assets", "logo.png")),
    ).toEqual(pngBytes);
  });

  it("removes stale generated assets before publishing the validated set", () => {
    const { appDirectory, instanceDirectory } = createRepository();
    writeFileSync(path.join(instanceDirectory, "assets", "logo.png"), pngBytes);
    const staleAsset = path.join(appDirectory, "public", "assets", "stale.svg");
    mkdirSync(path.dirname(staleAsset), { recursive: true });
    writeFileSync(
      staleAsset,
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    const disguisedAsset = path.join(appDirectory, "public", "assets", "stale.png");
    writeFileSync(
      disguisedAsset,
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );

    loadInstanceBrand(appDirectory);

    expect(existsSync(staleAsset)).toBe(false);
    expect(existsSync(disguisedAsset)).toBe(false);
  });

  it("rejects a symlinked asset even when its target is a valid image", () => {
    const { appDirectory, instanceDirectory, repositoryRoot } = createRepository();
    const outsideAsset = path.join(repositoryRoot, "outside.png");
    writeFileSync(outsideAsset, pngBytes);
    symlinkSync(outsideAsset, path.join(instanceDirectory, "assets", "logo.png"));

    expect(() => loadInstanceBrand(appDirectory)).toThrow(/logoLight.*symbolic link/u);
  });

  it("rejects an asset reached through a symlinked directory", () => {
    const { appDirectory, instanceDirectory, repositoryRoot } = createRepository(
      "/assets/escape/logo.png",
    );
    const outsideDirectory = path.join(repositoryRoot, "outside");
    mkdirSync(outsideDirectory);
    writeFileSync(path.join(outsideDirectory, "logo.png"), pngBytes);
    symlinkSync(outsideDirectory, path.join(instanceDirectory, "assets", "escape"));

    expect(() => loadInstanceBrand(appDirectory)).toThrow(/logoLight.*symbolic link/u);
  });

  it("rejects a directory in place of a declared asset", () => {
    const { appDirectory, instanceDirectory } = createRepository();
    mkdirSync(path.join(instanceDirectory, "assets", "logo.png"));

    expect(() => loadInstanceBrand(appDirectory)).toThrow(/logoLight.*regular file/u);
  });

  it("rejects active SVG content disguised with a raster extension", () => {
    const { appDirectory, instanceDirectory } = createRepository();
    writeFileSync(
      path.join(instanceDirectory, "assets", "logo.png"),
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );

    expect(() => loadInstanceBrand(appDirectory)).toThrow(
      /logoLight.*valid PNG bytes/u,
    );
  });

  it("rejects a truncated file that contains only the PNG signature", () => {
    const { appDirectory, instanceDirectory } = createRepository();
    writeFileSync(
      path.join(instanceDirectory, "assets", "logo.png"),
      pngBytes.subarray(0, 8),
    );

    expect(() => loadInstanceBrand(appDirectory)).toThrow(/logoLight.*incomplete PNG/u);
  });

  it("rejects a PNG whose chunk checksum does not match its bytes", () => {
    const { appDirectory, instanceDirectory } = createRepository();
    const corrupted = Buffer.from(pngBytes);
    corrupted[corrupted.length - 1] ^= 0xff;
    writeFileSync(path.join(instanceDirectory, "assets", "logo.png"), corrupted);

    expect(() => loadInstanceBrand(appDirectory)).toThrow(
      /logoLight.*invalid PNG checksum/u,
    );
  });

  it("rejects PNG metadata chunks that could disclose private information", () => {
    const { appDirectory, instanceDirectory } = createRepository();
    const metadata = Buffer.from("PRIVATE-GPS-COORDINATES");
    const exifChunk = Buffer.alloc(12 + metadata.length);
    exifChunk.writeUInt32BE(metadata.length, 0);
    exifChunk.write("eXIf", 4, "ascii");
    metadata.copy(exifChunk, 8);
    const headerEnd = 8 + 12 + pngBytes.readUInt32BE(8);
    const withExif = Buffer.concat([
      pngBytes.subarray(0, headerEnd),
      exifChunk,
      pngBytes.subarray(headerEnd),
    ]);
    writeFileSync(path.join(instanceDirectory, "assets", "logo.png"), withExif);

    expect(() => loadInstanceBrand(appDirectory)).toThrow(
      /logoLight.*unsupported PNG chunk eXIf/u,
    );
  });

  it("rejects oversized PNG input before decompression", () => {
    const { appDirectory, instanceDirectory } = createRepository();
    const oversized = Buffer.alloc(2_000_001);
    pngBytes.copy(oversized);
    writeFileSync(path.join(instanceDirectory, "assets", "logo.png"), oversized);

    expect(() => loadInstanceBrand(appDirectory)).toThrow(
      /logoLight.*2000000-byte PNG limit/u,
    );
  });

  it("rejects tenant-authored SVG asset paths before copying", () => {
    const { appDirectory, instanceDirectory } = createRepository("/assets/logo.svg");
    writeFileSync(
      path.join(instanceDirectory, "assets", "logo.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );

    expect(() => loadInstanceBrand(appDirectory)).toThrow(/logoLight.*must use PNG/u);
  });

  it("rejects every non-PNG raster extension", () => {
    for (const extension of ["jpg", "jpeg", "webp", "ico"]) {
      const { appDirectory, instanceDirectory } = createRepository(
        `/assets/logo.${extension}`,
      );
      writeFileSync(
        path.join(instanceDirectory, "assets", `logo.${extension}`),
        pngBytes,
      );

      expect(() => loadInstanceBrand(appDirectory)).toThrow(/logoLight.*must use PNG/u);
    }
  });
});

describe("installable-app icons", () => {
  function pngSize(bytes) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }

  it("derives square any, maskable and apple-touch icons from the brand icon", () => {
    const { appDirectory, instanceDirectory } = createRepository();
    writeFileSync(path.join(instanceDirectory, "assets", "logo.png"), pngBytes);

    loadInstanceBrand(appDirectory);

    const directory = path.join(appDirectory, "public", "assets", "_pwa");
    for (const [file, size] of [
      ["icon-192.png", 192],
      ["icon-512.png", 512],
      ["maskable-192.png", 192],
      ["maskable-512.png", 512],
      ["apple-touch-icon.png", 180],
    ]) {
      const bytes = readFileSync(path.join(directory, file));
      expect(pngSize(bytes), file).toEqual({ width: size, height: size });
      // Re-validates through the same strict decoder used for tenant input.
      expect(decodePngToRgba(bytes).rgba).toHaveLength(size * size * 4);
    }
    // Opaque variants fill the canvas: the corner is the (default white) background.
    const maskable = decodePngToRgba(
      readFileSync(path.join(directory, "maskable-192.png")),
    );
    expect([...maskable.rgba.subarray(0, 4)]).toEqual([255, 255, 255, 255]);
  });

  it("round-trips RGBA and keeps artwork inside the maskable safe zone", () => {
    const source = {
      width: 4,
      height: 2,
      rgba: new Uint8Array(Array.from({ length: 8 }, () => [200, 20, 30, 255]).flat()),
    };
    const decoded = decodePngToRgba(encodeRgbaPng(source));
    expect(decoded).toMatchObject({ width: 4, height: 2 });
    expect([...decoded.rgba]).toEqual([...source.rgba]);

    const any = renderSquareIcon(decoded, 20);
    // A wide source is letterboxed on a transparent canvas.
    expect(any.rgba[3]).toBe(0);
    expect([...any.rgba.subarray((10 * 20 + 10) * 4, (10 * 20 + 10) * 4 + 4)]).toEqual([
      200, 20, 30, 255,
    ]);

    const maskable = renderSquareIcon(decoded, 20, {
      artwork: 0.56,
      background: [1, 2, 3],
    });
    expect([...maskable.rgba.subarray(0, 4)]).toEqual([1, 2, 3, 255]);
    expect([
      ...maskable.rgba.subarray((10 * 20 + 10) * 4, (10 * 20 + 10) * 4 + 3),
    ]).toEqual([200, 20, 30]);
  });

  it("decodes the shipped template icon", () => {
    const packageDirectory = path.dirname(fileURLToPath(import.meta.url));
    const repositoryRoot = path.resolve(packageDirectory, "..", "..");
    const brandPath = [
      path.join(repositoryRoot, "instance", "brand.json"),
      path.join(repositoryRoot, "instance-template", "instance", "brand.json"),
    ].find((candidate) => existsSync(candidate));
    expect(
      brandPath,
      "shipped brand.json must exist in the supported instance layout",
    ).toBeDefined();
    const brand = JSON.parse(readFileSync(brandPath, "utf8"));
    expect(typeof brand.assets?.icon).toBe("string");
    expect(brand.assets.icon.startsWith("/assets/")).toBe(true);
    const icon = readFileSync(
      path.join(path.dirname(brandPath), brand.assets.icon.slice(1)),
    );
    const decoded = decodePngToRgba(icon);
    expect(decoded.rgba).toHaveLength(decoded.width * decoded.height * 4);
    const rendered = renderSquareIcon(decoded, 512);
    expect(decodePngToRgba(encodeRgbaPng(rendered))).toMatchObject({
      width: 512,
      height: 512,
    });
  });
});
