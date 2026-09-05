import { spawnSync } from "node:child_process";
import { readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import prettier from "prettier";

import { repositoryRoot } from "./workspace.mjs";

const generatedTypesPath = path.join(
  repositoryRoot,
  "packages/supabase-client/src/database.types.ts",
);
const writeMode = process.argv.length === 3 && process.argv[2] === "--write";

if (process.argv.length > (writeMode ? 3 : 2)) {
  fail("supported usage is check mode or --write mode only.");
}

function fail(message) {
  process.stderr.write(`Database type check failed: ${message}\n`);
  process.exit(1);
}

function normalizeNewlines(value) {
  return value.replace(/\r\n?/gu, "\n");
}

const generated = spawnSync(
  "pnpm",
  ["exec", "supabase", "gen", "types", "typescript", "--local", "--schema", "api_v1"],
  {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  },
);

if (generated.error || generated.status !== 0) {
  fail(
    "the local-only Supabase type generator did not complete. Confirm Docker is healthy, run pnpm supabase:start and pnpm db:reset, then retry. CLI output was intentionally suppressed so generated credentials and connection details cannot enter CI logs.",
  );
}

const prettierConfig = await prettier.resolveConfig(generatedTypesPath);
const generatedTypes = normalizeNewlines(
  await prettier.format(generated.stdout ?? "", {
    ...(prettierConfig ?? {}),
    parser: "typescript",
    filepath: generatedTypesPath,
  }),
);

if (!/\bapi_v1:\s*\{/u.test(generatedTypes)) {
  fail("the generated output does not contain the api_v1 schema.");
}

if (/\n\s+(?:app|private):\s*\{/u.test(generatedTypes)) {
  fail("the generated output exposes a non-api_v1 application schema.");
}

if (/SUPABASE_(?:SERVICE_ROLE|SECRET)_KEY/u.test(generatedTypes)) {
  fail("the generated output contains a privileged credential-shaped name.");
}

if (writeMode) {
  const temporaryPath = `${generatedTypesPath}.${process.pid}.tmp`;
  try {
    writeFileSync(temporaryPath, generatedTypes, "utf8");
    renameSync(temporaryPath, generatedTypesPath);
  } catch (error) {
    try {
      unlinkSync(temporaryPath);
    } catch (cleanupError) {
      if (!(
        cleanupError &&
        typeof cleanupError === "object" &&
        cleanupError.code === "ENOENT"
      )) {
        throw cleanupError;
      }
    }
    throw error;
  }
  process.stdout.write(
    "Updated committed database types from the local api_v1 schema.\n",
  );
  process.exit(0);
}

let committedTypes;
try {
  committedTypes = normalizeNewlines(readFileSync(generatedTypesPath, "utf8"));
} catch (error) {
  if (error && typeof error === "object" && error.code === "ENOENT") {
    fail(
      "packages/supabase-client/src/database.types.ts is missing. Start the local Supabase stack, reset it, then generate the file with: pnpm db:types",
    );
  }
  throw error;
}

if (generatedTypes !== committedTypes) {
  const generatedLines = generatedTypes.split("\n");
  const committedLines = committedTypes.split("\n");
  const firstDifference = Math.max(
    0,
    generatedLines.findIndex((line, index) => line !== committedLines[index]),
  );
  fail(
    `packages/supabase-client/src/database.types.ts is stale at line ${firstDifference + 1}. Generated=${JSON.stringify(generatedLines[firstDifference] ?? "<EOF>")} committed=${JSON.stringify(committedLines[firstDifference] ?? "<EOF>")}. Regenerate it from the reset local stack with: pnpm db:types`,
  );
}

process.stdout.write("Committed database types match the local api_v1 schema.\n");
