import { createHash } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";

const manifestName = "distribution-manifest.json";
const safeTextPath = /\.(?:json|jsonc|[cm]?[jt]sx?|css|md|txt|ya?ml|html|svg)$/u;
const forbiddenPath =
  /(?:^|\/)(?:control-plane|supabase|platform-admin|supabase-admin|email|integrations)(?:\/|$)/u;
const forbiddenText = [
  /@wlbp\/(?:supabase-admin|platform-admin|email|integrations)/u,
  /control_plane\./u,
  /SUPABASE_(?:SERVICE_ROLE|SECRET)_KEY/u,
  /(?:sk_live_|rk_live_|whsec_|ghp_|ghs_|github_pat_|-----BEGIN [A-Z ]*PRIVATE KEY)/u,
];

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function isSafeRelativePath(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !value.startsWith("/") &&
    value
      .split("/")
      .every(
        (segment) =>
          segment !== "" &&
          segment !== "." &&
          segment !== ".." &&
          /^[A-Za-z0-9._[\]-]+$/u.test(segment),
      )
  );
}

async function walkFiles(root, relative = "") {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink())
      throw new Error("distribution artifact contains a symbolic link");
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(root, child)));
    } else if (entry.isFile()) {
      files.push(child);
    } else {
      throw new Error("distribution artifact contains a non-regular file");
    }
  }
  return files.sort();
}

function validateManifest(manifest) {
  if (
    !manifest ||
    manifest.schemaVersion !== 1 ||
    typeof manifest.whiteLabelVersion !== "string" ||
    !/^\d+\.\d+\.\d+$/u.test(manifest.whiteLabelVersion) ||
    !Number.isSafeInteger(manifest.configSchemaVersion) ||
    manifest.configSchemaVersion <= 0 ||
    !manifest.backendContract ||
    !Number.isSafeInteger(manifest.backendContract.min) ||
    !Number.isSafeInteger(manifest.backendContract.max) ||
    manifest.backendContract.min <= 0 ||
    manifest.backendContract.max < manifest.backendContract.min ||
    !/^[a-f0-9]{64}$/u.test(manifest.treeSha256 ?? "") ||
    !Array.isArray(manifest.files) ||
    manifest.fileCount !== manifest.files.length
  ) {
    throw new Error("distribution artifact manifest is invalid");
  }
}

export async function readDistributionArtifact(root) {
  const metadata = await lstat(root);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("distribution artifact root must be a directory");
  }
  const manifestBytes = await readFile(path.join(root, manifestName));
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    throw new Error("distribution artifact manifest is invalid");
  }
  validateManifest(manifest);

  const expected = new Map();
  for (const entry of manifest.files) {
    if (
      !entry ||
      typeof entry.path !== "string" ||
      !isSafeRelativePath(entry.path) ||
      entry.path === manifestName ||
      forbiddenPath.test(entry.path) ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 0 ||
      typeof entry.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/u.test(entry.sha256) ||
      expected.has(entry.path)
    ) {
      throw new Error("distribution artifact manifest is invalid");
    }
    expected.set(entry.path, entry);
  }

  const actual = await walkFiles(root);
  const allowed = new Set([...expected.keys(), manifestName]);
  if (actual.length !== allowed.size || actual.some((file) => !allowed.has(file))) {
    throw new Error("distribution artifact has unexpected files");
  }

  const files = [];
  const treeDigest = createHash("sha256");
  for (const [relative, entry] of [...expected.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const contents = await readFile(path.join(root, relative));
    if (contents.length !== entry.bytes || sha256(contents) !== entry.sha256) {
      throw new Error("distribution artifact checksum mismatch");
    }
    if (safeTextPath.test(relative)) {
      const text = contents.toString("utf8");
      if (forbiddenText.some((pattern) => pattern.test(text))) {
        throw new Error("distribution artifact contains forbidden private content");
      }
    }
    treeDigest.update(`${relative}:${entry.sha256}\n`);
    files.push({ content: contents, path: relative });
  }
  if (treeDigest.digest("hex") !== manifest.treeSha256) {
    throw new Error("distribution artifact tree checksum mismatch");
  }

  files.push({ content: manifestBytes, path: manifestName });
  return {
    backendContract: { ...manifest.backendContract },
    configSchemaVersion: manifest.configSchemaVersion,
    files,
    treeSha256: manifest.treeSha256,
    whiteLabelVersion: manifest.whiteLabelVersion,
  };
}
