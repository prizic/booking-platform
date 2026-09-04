import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

import {
  buildReleaseManifest,
  validateReleaseNotesInput,
} from "../control-plane/contracts/release-contracts.mjs";
import { pathExists, readJson, repositoryRoot } from "./workspace.mjs";

const [, , commit, notesPath] = process.argv;
if (!commit || !notesPath) {
  throw new Error(
    "Usage: node scripts/generate-release-manifest.mjs <full-git-commit> <release-notes.json>",
  );
}

const platformContract = await readJson(
  path.join(repositoryRoot, "platform-contract.json"),
);
const absoluteNotesPath = path.resolve(repositoryRoot, notesPath);
const notes = await readJson(absoluteNotesPath);
const notesErrors = validateReleaseNotesInput(notes);
if (notesErrors.length > 0) {
  throw new Error(`Invalid release notes:\n- ${notesErrors.join("\n- ")}`);
}
const migrationsPath = path.join(repositoryRoot, "supabase", "migrations");
const migrationFiles = (await pathExists(migrationsPath))
  ? (await readdir(migrationsPath)).filter((file) => file.endsWith(".sql")).sort()
  : [];

const migrations = [];
for (const migrationFile of migrationFiles) {
  const id = migrationFile.slice(0, -4);
  const source = await readFile(path.join(migrationsPath, migrationFile));
  migrations.push({
    id,
    checksum: `sha256:${createHash("sha256").update(source).digest("hex")}`,
    dependsOn: notes.migrationDependencies?.[id] ?? [],
  });
}

const unknownDependencyEntries = Object.keys(notes.migrationDependencies ?? {}).filter(
  (id) => !migrationFiles.includes(`${id}.sql`),
);
if (unknownDependencyEntries.length > 0) {
  throw new Error(
    `Release notes describe missing migration(s): ${unknownDependencyEntries.join(", ")}`,
  );
}

const manifest = buildReleaseManifest({
  platformContract,
  commit,
  migrations,
  featureNotes: notes.featureNotes,
  upgradeNotes: notes.upgradeNotes,
});

process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
