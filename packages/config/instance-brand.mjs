import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const safeAssetPath = /^\/assets\/[A-Za-z0-9][A-Za-z0-9._/-]*$/u;
const assetKeys = ["logoLight", "logoDark", "icon", "favicon", "socialImage"];

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
  for (const key of assetKeys) {
    const assetPath = value.assets[key];
    if (key === "logoDark" && assetPath === undefined) continue;
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
    const source = path.join(instanceDirectory, ...segments);
    if (!existsSync(source)) {
      throw new Error(`Brand asset ${key} does not exist at ${source}`);
    }
    const destination = path.join(appDirectory, "public", ...segments);
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(source, destination);
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
