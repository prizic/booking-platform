import path from "node:path";

import {
  discoverWorkspaceMembers,
  failCheck,
  pathExists,
  readJson,
  repositoryRoot,
  walkFiles,
} from "./workspace.mjs";
import { readFile } from "node:fs/promises";

const errors = [];
const rootManifest = await readJson(path.join(repositoryRoot, "package.json"));
const lockfilePath = path.join(repositoryRoot, "pnpm-lock.yaml");
const workspacePath = path.join(repositoryRoot, "pnpm-workspace.yaml");
const missingFiles = [];
for (const filePath of [lockfilePath, workspacePath]) {
  if (!(await pathExists(filePath))) {
    missingFiles.push(`${path.basename(filePath)} is required`);
  }
}
if (missingFiles.length > 0) {
  failCheck("single frozen pnpm lockfile", missingFiles);
  process.exit(1);
}
const [lockfile, workspace] = await Promise.all([
  readFile(lockfilePath, "utf8"),
  readFile(workspacePath, "utf8"),
]);

if (!/^pnpm@\d+\.\d+\.\d+$/u.test(rootManifest.packageManager ?? "")) {
  errors.push(
    "package.json packageManager must pin pnpm to an exact major.minor.patch version",
  );
}

if (!/^lockfileVersion: ["']9\.0["']$/mu.test(lockfile)) {
  errors.push("pnpm-lock.yaml must use lockfileVersion 9.0");
}

for (const [label, source] of [
  ["pnpm-lock.yaml", lockfile],
  ["pnpm-workspace.yaml", workspace],
]) {
  if (/^(?:<{7}|={7}|>{7})/mu.test(source)) {
    errors.push(`${label} contains an unresolved merge marker`);
  }
}

const importersStart = lockfile.search(/^importers:\s*$/mu);
if (importersStart === -1) {
  errors.push("pnpm-lock.yaml is missing its importers section");
} else {
  const remainder = lockfile.slice(importersStart + "importers:".length);
  const nextTopLevel = remainder.search(/^\S[^\n]*:\s*$/mu);
  const importerSection =
    nextTopLevel === -1 ? remainder : remainder.slice(0, nextTopLevel);
  const actualImporters = new Set(
    [
      ...importerSection.matchAll(
        /^ {2}(\.|(?:apps|packages)\/[^:\n]+):(?:\s*\{\})?\s*$/gmu,
      ),
    ].map((match) => match[1]),
  );
  const members = await discoverWorkspaceMembers();
  const expectedImporters = new Set([".", ...members.map((member) => member.path)]);

  for (const importer of expectedImporters) {
    if (!actualImporters.has(importer)) {
      errors.push(`pnpm-lock.yaml is missing workspace importer ${importer}`);
    }
  }
  for (const importer of actualImporters) {
    if (!expectedImporters.has(importer)) {
      errors.push(`pnpm-lock.yaml contains unexpected workspace importer ${importer}`);
    }
  }
}

const competingLockfiles = new Set([
  "bun.lock",
  "bun.lockb",
  "npm-shrinkwrap.json",
  "package-lock.json",
  "yarn.lock",
]);
const lockfiles = await walkFiles(repositoryRoot, {
  include: (filePath) =>
    competingLockfiles.has(path.basename(filePath)) ||
    (path.basename(filePath) === "pnpm-lock.yaml" && filePath !== lockfilePath),
});
for (const filePath of lockfiles) {
  errors.push(
    `competing or nested lockfile is not allowed: ${path
      .relative(repositoryRoot, filePath)
      .split(path.sep)
      .join("/")}`,
  );
}

failCheck("single frozen pnpm lockfile", errors.sort());
