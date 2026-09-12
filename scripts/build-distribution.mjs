#!/usr/bin/env node
// Issue #29. Materialize the sanitized white-label distribution tree.
//
// Allowlist, never denylist. The export set is computed from the ADR-0011
// classification plus the dependency closure of what it names — so a package
// that becomes reachable from the Client tomorrow either joins the allowlist
// deliberately or fails the build. A denylist would silently ship it.
//
// The scan afterwards is not the safety net; the allowlist is. The scan exists
// because a file inside an allowlisted member can still say something it should
// not, and because "we checked" is a claim worth being able to make about the
// bytes that actually shipped rather than about the source they came from.
//
// This script writes a tree and a manifest. It does not push anything: the
// separate-history repository, its remote, and the signing key are the
// provisioning pipeline's business (issues #30 and #31), and a build step that
// can push is a build step that can push by accident.
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  discoverWorkspaceMembers,
  expectedDistribution,
  pathExists,
  readJson,
  relativePath,
  repositoryRoot,
  walkFiles,
  workspaceEdges,
} from "./workspace.mjs";

/**
 * Root files a distributed instance genuinely needs to build. Everything else
 * at the root stays behind, including every checked-in script in this
 * directory: an instance has no business running the source monorepo's gates.
 */
const rootFiles = [
  ".npmrc",
  ".nvmrc",
  ".prettierrc.json",
  ".prettierignore",
  "eslint.config.mjs",
  "package.json",
  "platform-contract.json",
  "pnpm-workspace.yaml",
];

/** Directories copied wholesale, with their own exclusions applied below. */
const rootDirectories = [
  "instance-template",
  // The instance template links into these, so omitting them would seed every
  // instance with broken links. Only the config-migration guides ship: the rest
  // of `docs/` is internal.
  "docs/config-migrations",
];

/**
 * Never copied, wherever they appear. `supabase/` is the important one: a
 * distributed instance must have no mechanism to run a shared production
 * migration, and the simplest way to guarantee that is for the migrations not
 * to be there.
 */
const excludedSegments = [
  "/node_modules/",
  "/.next/",
  "/.turbo/",
  "/dist/",
  "/coverage/",
  "/test-results/",
  "/playwright-report/",
  "/.git/",
];

const excludedTopLevel = new Set([
  "supabase",
  "control-plane",
  "scripts",
  "tests",
  "docs",
  ".github",
]);

/** Refused anywhere in the exported bytes. */
const forbiddenContent = [
  [
    "platform-only workspace package",
    /@wlbp\/(?:supabase-admin|platform-admin|email|integrations)/u,
  ],
  ["Platform Admin source", /apps[\\/]platform-admin/u],
  ["control-plane path", /control-plane[\\/]/u],
  ["control-plane schema", /control_plane\./u],
  ["privileged Supabase key", /SUPABASE_(?:SERVICE_ROLE|SECRET)_KEY/u],
  ["Stripe server credential", /STRIPE_(?:SECRET|RESTRICTED)_KEY/u],
  ["email provider credential", /RESEND_API_KEY/u],
  ["GitHub credential", /GITHUB_(?:APP_PRIVATE_KEY|TOKEN)/u],
  ["Vercel credential", /VERCEL_API_TOKEN/u],
  [
    "literal secret",
    /(?:sk_live_|rk_live_|whsec_|ghp_|github_pat_|-----BEGIN [A-Z ]*PRIVATE KEY)/u,
  ],
];

/**
 * Files exempt from the content scan, each for a stated reason. This list is
 * deliberately tiny and each entry is a file whose PURPOSE is to name the
 * things the scan looks for.
 */
const contentScanExemptions = new Map([
  [
    "instance-template/.platform/customization-policy.json",
    "its whole job is to enumerate the paths an instance may never touch, so it has to name them",
  ],
]);

/** Text files are scanned; binaries are checksummed only. */
const scannableExtensions =
  /\.(?:json|jsonc|[cm]?[jt]sx?|css|md|txt|ya?ml|sql|html|svg)$/u;

function isExcluded(relative, { allowTopLevel = false } = {}) {
  const normalized = `/${relative}`;
  if (excludedSegments.some((segment) => normalized.includes(segment))) return true;
  // A directory named in `rootDirectories` is being copied deliberately, so the
  // blanket top-level exclusion must not veto it.
  if (allowTopLevel) return false;
  const [top] = relative.split("/");
  return excludedTopLevel.has(top);
}

/**
 * The workspace lockfile names every member, including the platform-only ones.
 * Shipping it verbatim would leak the private package list, so the importer
 * blocks for non-distributed members are removed.
 *
 * Only `importers:` is touched. Entries left behind in `packages:` are resolved
 * dependencies pnpm tolerates having spare; removing them would mean
 * re-resolving the graph, which is a different job with a different failure
 * mode.
 */
export function pruneLockfile(source, distributedMembers) {
  const keep = new Set([".", ...distributedMembers]);
  const lines = source.split("\n");
  const output = [];
  let inImporters = false;
  let skipping = false;
  for (const line of lines) {
    if (/^importers:\s*$/u.test(line)) {
      inImporters = true;
      output.push(line);
      continue;
    }
    if (inImporters && /^\S/u.test(line)) {
      inImporters = false;
      skipping = false;
    }
    if (inImporters) {
      const importer = /^ {2}(\S.*?):\s*$/u.exec(line);
      if (importer) {
        skipping = !keep.has(importer[1]);
      }
      if (skipping) continue;
    }
    output.push(line);
  }
  return output.join("\n");
}

/**
 * The export set: every member classified `distributed`, plus a proof that its
 * dependency closure is entirely inside that set. A distributed member that
 * reaches a platform-only one is a release that must not happen.
 */
export async function resolveExportSet() {
  const members = await discoverWorkspaceMembers();
  const byPath = new Map(members.map((member) => [member.path, member]));
  const outgoing = new Map(members.map((member) => [member.path, []]));
  for (const edge of workspaceEdges(members)) {
    outgoing.get(edge.from.path)?.push(edge.to);
  }

  const exported = [...expectedDistribution.entries()]
    .filter(([, distribution]) => distribution === "distributed")
    .map(([memberPath]) => memberPath)
    .sort();

  const violations = [];
  for (const memberPath of exported) {
    if (!byPath.has(memberPath)) {
      violations.push(
        `allowlisted member is missing from the workspace: ${memberPath}`,
      );
      continue;
    }
    for (const target of outgoing.get(memberPath) ?? []) {
      if (!exported.includes(target.path)) {
        violations.push(
          `dependency closure leak: ${memberPath} depends on ${target.path}, which is not distributed`,
        );
      }
    }
  }
  return { exported, violations };
}

/** Scan one exported file. Returns the findings, which should be none. */
export function scanSource(relative, source) {
  const findings = [];
  for (const [label, pattern] of forbiddenContent) {
    if (pattern.test(source)) {
      findings.push(`${label} appears in exported file ${relative}`);
    }
  }
  return findings;
}

async function collectFiles(absoluteRoot, prefix, options = {}) {
  const files = await walkFiles(absoluteRoot);
  return files
    .map((filePath) => ({
      absolute: filePath,
      relative: `${prefix}${path.relative(absoluteRoot, filePath).split(path.sep).join("/")}`,
    }))
    .filter((entry) => !isExcluded(entry.relative, options));
}

async function main() {
  const outputDirectory = path.resolve(
    repositoryRoot,
    process.argv[2] ?? "dist-distribution",
  );
  const { exported, violations } = await resolveExportSet();
  const errors = [...violations];

  const entries = [];
  for (const memberPath of exported) {
    entries.push(
      ...(await collectFiles(path.join(repositoryRoot, memberPath), `${memberPath}/`)),
    );
  }
  for (const directory of rootDirectories) {
    const absolute = path.join(repositoryRoot, directory);
    if (await pathExists(absolute)) {
      entries.push(
        ...(await collectFiles(absolute, `${directory}/`, { allowTopLevel: true })),
      );
    }
  }
  for (const file of rootFiles) {
    const absolute = path.join(repositoryRoot, file);
    if (!(await pathExists(absolute))) {
      errors.push(`required root file is missing: ${file}`);
      continue;
    }
    entries.push({ absolute, relative: file });
  }

  // Scan and checksum every exported byte. The checksum is what makes the
  // manifest a claim about this tree rather than about the source it came from.
  const files = [];
  for (const entry of entries.sort((a, b) => a.relative.localeCompare(b.relative))) {
    const contents = await readFile(entry.absolute);
    if (
      scannableExtensions.test(entry.relative) &&
      !contentScanExemptions.has(entry.relative)
    ) {
      errors.push(...scanSource(entry.relative, contents.toString("utf8")));
    }
    files.push({
      path: entry.relative,
      sha256: createHash("sha256").update(contents).digest("hex"),
      bytes: contents.byteLength,
    });
  }

  if (errors.length > 0) {
    process.exitCode = 1;
    process.stderr.write(`distribution export refused:\n- ${errors.join("\n- ")}\n`);
    return;
  }

  await rm(outputDirectory, { force: true, recursive: true });
  for (const entry of entries) {
    const destination = path.join(outputDirectory, entry.relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(entry.absolute, destination);
  }

  // The pruned lockfile is written rather than copied, and its checksum is the
  // checksum of what actually ships.
  const lockfileSource = await readFile(
    path.join(repositoryRoot, "pnpm-lock.yaml"),
    "utf8",
  );
  const prunedLockfile = pruneLockfile(lockfileSource, exported);
  const lockfileFindings = scanSource("pnpm-lock.yaml", prunedLockfile);
  if (lockfileFindings.length > 0) {
    process.exitCode = 1;
    process.stderr.write(
      `distribution export refused:\n- ${lockfileFindings.join("\n- ")}\n`,
    );
    return;
  }
  await writeFile(path.join(outputDirectory, "pnpm-lock.yaml"), prunedLockfile, "utf8");
  files.push({
    path: "pnpm-lock.yaml",
    sha256: createHash("sha256").update(prunedLockfile).digest("hex"),
    bytes: Buffer.byteLength(prunedLockfile),
  });
  files.sort((a, b) => a.path.localeCompare(b.path));

  const platformContract = await readJson(
    path.join(repositoryRoot, "platform-contract.json"),
  );
  const treeDigest = createHash("sha256");
  for (const file of files) treeDigest.update(`${file.path}:${file.sha256}\n`);

  const manifest = {
    schemaVersion: 1,
    whiteLabelVersion: platformContract.whiteLabelVersion,
    configSchemaVersion: platformContract.configSchemaVersion,
    backendContract: platformContract.backendContract,
    fileCount: files.length,
    // One digest over every path and checksum, so a single tampered byte or a
    // single added file changes it.
    treeSha256: treeDigest.digest("hex"),
    members: exported,
    files,
  };
  await writeFile(
    path.join(outputDirectory, "distribution-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  process.stdout.write(
    `distribution export: ${files.length} files from ${exported.length} members → ${relativePath(outputDirectory)}\n`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
