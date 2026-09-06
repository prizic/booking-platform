import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export const dependencyFields = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

const workspaceClassifications = [
  ["apps/client", "@wlbp/client", "distributed"],
  ["apps/dashboard", "@wlbp/dashboard", "distributed"],
  ["apps/platform-admin", "@wlbp/platform-admin", "platform-only"],
  ["packages/booking-domain", "@wlbp/booking-domain", "distributed"],
  ["packages/api-contracts", "@wlbp/api-contracts", "distributed"],
  ["packages/supabase-client", "@wlbp/supabase-client", "distributed"],
  ["packages/supabase-admin", "@wlbp/supabase-admin", "platform-only"],
  ["packages/auth", "@wlbp/auth", "distributed"],
  ["packages/tenant-resolution", "@wlbp/tenant-resolution", "distributed"],
  ["packages/ui-foundation", "@wlbp/ui-foundation", "distributed"],
  ["packages/white-label-ui", "@wlbp/white-label-ui", "distributed"],
  ["packages/i18n", "@wlbp/i18n", "distributed"],
  ["packages/email", "@wlbp/email", "platform-only"],
  ["packages/integrations", "@wlbp/integrations", "platform-only"],
  ["packages/observability", "@wlbp/observability", "distributed"],
  ["packages/testing", "@wlbp/testing", "distributed"],
  ["packages/config", "@wlbp/config", "distributed"],
];

export const expectedDistribution = new Map(
  workspaceClassifications.map(([memberPath, , distribution]) => [
    memberPath,
    distribution,
  ]),
);

export const expectedPackageDistribution = new Map(
  workspaceClassifications.map(([, packageName, distribution]) => [
    packageName,
    distribution,
  ]),
);

export async function readJson(filePath) {
  const source = await readFile(filePath, "utf8");
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(
      `${relativePath(filePath)} is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export function relativePath(filePath) {
  return path.relative(repositoryRoot, filePath).split(path.sep).join("/");
}

export async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function discoverWorkspaceMembers() {
  const members = [];

  for (const parent of ["apps", "packages"]) {
    const parentPath = path.join(repositoryRoot, parent);
    if (!(await pathExists(parentPath))) continue;

    const entries = await readdir(parentPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const memberPath = `${parent}/${entry.name}`;
      const manifestPath = path.join(repositoryRoot, memberPath, "package.json");
      if (!(await pathExists(manifestPath))) {
        throw new Error(`${memberPath} is missing package.json`);
      }

      const manifest = await readJson(manifestPath);
      if (typeof manifest.name !== "string" || manifest.name.length === 0) {
        throw new Error(`${memberPath}/package.json must declare a package name`);
      }

      members.push({
        distribution: manifest.wlbp?.distribution,
        manifest,
        manifestPath,
        name: manifest.name,
        path: memberPath,
      });
    }
  }

  members.sort((left, right) => left.path.localeCompare(right.path));

  const names = new Set();
  for (const member of members) {
    if (names.has(member.name)) {
      throw new Error(`duplicate workspace package name: ${member.name}`);
    }
    names.add(member.name);
  }

  return members;
}

export function workspaceEdges(members) {
  const byName = new Map(members.map((member) => [member.name, member]));
  const edges = [];

  for (const member of members) {
    for (const field of dependencyFields) {
      const dependencies = member.manifest[field] ?? {};
      for (const dependencyName of Object.keys(dependencies)) {
        const target = byName.get(dependencyName);
        if (target) {
          edges.push({ field, from: member, to: target });
        }
      }
    }
  }

  return edges.sort((left, right) =>
    `${left.from.path}:${left.field}:${left.to.path}`.localeCompare(
      `${right.from.path}:${right.field}:${right.to.path}`,
    ),
  );
}

export function allDeclaredDependencies(member) {
  return dependencyFields.flatMap((field) =>
    Object.keys(member.manifest[field] ?? {}).map((name) => ({ field, name })),
  );
}

const ignoredDirectoryNames = new Set([
  ".git",
  ".next",
  ".next-warm",
  ".next-warm-client",
  ".next-warm-dashboard",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
]);

export async function walkFiles(startPath, options = {}) {
  const { include = () => true } = options;
  const files = [];

  async function visit(currentPath) {
    const entries = await readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && ignoredDirectoryNames.has(entry.name)) continue;

      const absolutePath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (entry.isFile() && include(absolutePath)) {
        files.push(absolutePath);
      }
    }
  }

  if (await pathExists(startPath)) await visit(startPath);
  return files.sort();
}

export function extractImportSpecifiers(source) {
  const specifiers = new Set();
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?(?:[^;"']*?\s+from\s+)?["']([^"']+)["']/gu,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/gu,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]) specifiers.add(match[1]);
    }
  }

  return [...specifiers].sort();
}

export function failCheck(label, errors) {
  if (errors.length === 0) {
    process.stdout.write(`✓ ${label}\n`);
    return;
  }

  process.stderr.write(`✗ ${label}\n`);
  for (const error of errors) process.stderr.write(`  - ${error}\n`);
  process.exitCode = 1;
}
