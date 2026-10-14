#!/usr/bin/env node
// No reset/start/stop: parent prepares an isolated campaign first.
import { spawnSync } from "node:child_process";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { readLocalSupabaseEnvironment } from "./live-booking-e2e.mjs";
import { assertNode22 } from "./demo-dev.mjs";
import {
  APPROVED_DATABASE_PORTS,
  isIsolatedWorkdir,
  journeyClockPath,
} from "./journey-preflight.mjs";
assertNode22();
if (!isIsolatedWorkdir(process.env.WLBP_SUPABASE_WORKDIR))
  throw new Error(
    "Explicit isolated campaign workdir required; never use retained/default project.",
  );
const local = readLocalSupabaseEnvironment();
const db = new URL(local.databaseUrl);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(db.hostname) ||
  !APPROVED_DATABASE_PORTS.has(db.port) ||
  db.search ||
  db.hash
)
  throw new Error("Journey fixtures require an approved local campaign database.");
const clockFile = resolve(journeyClockPath());
// A failed earlier attempt must not leave a success marker behind.
await rm(clockFile, { force: true });
const result = spawnSync(
  "psql",
  [
    local.databaseUrl,
    "--no-psqlrc",
    "--tuples-only",
    "--no-align",
    "--quiet",
    "--set=ON_ERROR_STOP=1",
    "--file",
    "tests/e2e/fixtures/booking-journey.sql",
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);
if (result.error || result.status !== 0) {
  await rm(clockFile, { force: true });
  throw new Error(
    "Journey fixture failed; raw SQL/credentials suppressed. Ensure dashboard-completion fixture has been applied after DB suites.",
  );
}
const output = `${result.stdout ?? ""}`.trim();
const outputLines = output
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);
if (outputLines.length !== 1) {
  await rm(clockFile, { force: true });
  throw new Error(
    "Journey fixture succeeded but did not return exactly one authoritative seed timestamp.",
  );
}
const seededAt = outputLines[0];
if (!seededAt || Number.isNaN(Date.parse(seededAt))) {
  await rm(clockFile, { force: true });
  throw new Error(
    "Journey fixture succeeded but did not return an authoritative seed timestamp.",
  );
}
const clockDirectory = resolve(clockFile, "..");
await mkdir(clockDirectory, { recursive: true, mode: 0o700 });
const temporaryClockFile = `${clockFile}.tmp-${randomUUID()}`;
try {
  await writeFile(
    temporaryClockFile,
    JSON.stringify(
      {
        seededAt,
        timeZone: "America/New_York",
        databaseProfile: db.port,
        source: "booking-journey.sql",
        note: "Do not cross civil midnight; booking dates remain immutable.",
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
  await rename(temporaryClockFile, clockFile);
} finally {
  await rm(temporaryClockFile, { force: true });
}
console.log(
  "Synthetic journey fixture prepared; seed clock recorded. No retained stack reset.",
);
