import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { preflightJourneyClock } from "./journey-preflight.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(
  join(repositoryRoot, "tests", "e2e", "fixtures", "booking-journey.sql"),
  "utf8",
);
const prepareScript = join(repositoryRoot, "scripts", "prepare-booking-journey.mjs");
const verifyScript = join(repositoryRoot, "scripts", "verify-journey.mjs");

// Journey tooling must not inherit an operator's campaign shell: a campaign
// export would silently change which database or clock these tests observe.
const managedEnvKeys = [
  "JOURNEY_SPAWN_MARKER",
  "WLBP_CAMPAIGN",
  "WLBP_CAMPAIGN_INSPECTOR_PORT",
  "WLBP_CAMPAIGN_OUTPUT",
  "WLBP_CAMPAIGN_PORT_PREFIX",
  "WLBP_JOURNEY_A11Y",
  "WLBP_JOURNEY_CLOCK_FILE",
  "WLBP_JOURNEY_E2E",
  "WLBP_JOURNEY_MAILBOX",
  "WLBP_JOURNEY_OUTPUT",
  "WLBP_JOURNEY_REPORT",
  "WLBP_JOURNEY_RESULTS",
  "WLBP_SUPABASE_WORKDIR",
];
let savedEnv;
before(() => {
  savedEnv = {};
  for (const key of managedEnvKeys) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});
after(() => {
  for (const key of managedEnvKeys) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

function withEnv(overrides, fn) {
  const saved = {};
  for (const key of Object.keys(overrides)) saved[key] = process.env[key];
  try {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return fn();
  } finally {
    for (const key of Object.keys(overrides)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

test("fixture copies only writable auth.users columns", () => {
  assert.match(sql, /insert into auth\.users \(/i);
  // confirmed_at is GENERATED ALWAYS in auth.users; writing it aborts the
  // whole fixture transaction.
  assert.doesNotMatch(
    sql,
    /insert into auth\.users\s*\([^)]*\bconfirmed_at\b[^)]*\)/iu,
  );
});

test("fixture uses explicit writable columns for hold and booking inserts", () => {
  assert.match(sql, /insert into app\.booking_holds \(/i);
  assert.match(sql, /insert into app\.bookings \(/i);
  assert.doesNotMatch(sql, /jsonb_populate_record/i);
});

test("fixture guards prerequisites and stale rows before success", () => {
  assert.match(sql, /Journey fixture requires completion booking hold/i);
  assert.match(sql, /Journey fixture requires completion booking/i);
  assert.match(sql, /Journey fixture holds are stale/i);
  assert.match(sql, /Journey fixture bookings are stale/i);
});

test("fixture emits its seed instant from inside the fixture transaction", () => {
  assert.match(sql, /select transaction_timestamp\(\);/iu);
  assert.ok(
    sql.indexOf("select transaction_timestamp();") < sql.lastIndexOf("commit;"),
    "the seed instant must be emitted before the fixture transaction commits",
  );
});

test("fixture never deletes or drops retained rows", () => {
  assert.doesNotMatch(sql, /\btruncate\b/iu);
  assert.doesNotMatch(sql, /\bdrop\s+table\b/iu);
  assert.doesNotMatch(sql, /\bdelete\s+from\b/iu);
});

// Behavioral boundary between the fixture runner, the recorded clock, and the
// preflight guard. Child processes receive a synthetic environment only: a
// stubbed supabase/psql on PATH and temp files, never a real stack or fixture.
function tempRoot() {
  return mkdtempSync(join(tmpdir(), "booking-journey-136-"));
}

function isolatedWorkdir(root) {
  const workdir = join(root, ".artifacts", "campaign", "isolated");
  mkdirSync(workdir, { recursive: true });
  return workdir;
}

function writeStub(binDir, name, body) {
  mkdirSync(binDir, { recursive: true });
  const file = join(binDir, name);
  writeFileSync(file, `#!/bin/sh\n${body}`, "utf8");
  chmodSync(file, 0o755);
}

function supabaseStubBody(databaseUrl) {
  return `printf 'API_URL=http://127.0.0.1:57821\\nPUBLISHABLE_KEY=local-publishable-key\\nDB_URL=${databaseUrl}\\n'\n`;
}

function nowTimestamp() {
  const iso = new Date().toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 23)}+00`;
}

function psqlStampStub(stamp) {
  return `printf '${stamp}\\n'\n`;
}

function runNode(script, args, env) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: repositoryRoot,
    env,
    encoding: "utf8",
  });
}

function campaignEnv(root, workdir, clockFile) {
  return {
    PATH: `${join(root, "bin")}:${process.env.PATH}`,
    WLBP_SUPABASE_WORKDIR: workdir,
    WLBP_JOURNEY_CLOCK_FILE: clockFile,
  };
}

test("preparation records an atomic clock that the preflight accepts", () => {
  const root = tempRoot();
  try {
    const workdir = isolatedWorkdir(root);
    const clockFile = join(root, "clock", "fixture-clock.json");
    writeStub(
      join(root, "bin"),
      "supabase",
      supabaseStubBody("postgresql://postgres:postgres@127.0.0.1:57822/postgres"),
    );
    writeStub(join(root, "bin"), "psql", psqlStampStub(nowTimestamp()));
    const result = runNode(prepareScript, [], campaignEnv(root, workdir, clockFile));
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Synthetic journey fixture prepared/i);
    assert.doesNotMatch(result.stderr, /postgresql:\/\//u);

    const clock = JSON.parse(readFileSync(clockFile, "utf8"));
    assert.ok(Number.isFinite(Date.parse(clock.seededAt)));
    assert.equal(clock.timeZone, "America/New_York");
    assert.equal(clock.source, "booking-journey.sql");
    assert.equal(clock.databaseProfile, "57822");
    // Atomic write: only the finished clock exists, never a partial file.
    assert.deepEqual(readdirSync(join(root, "clock")), ["fixture-clock.json"]);

    const accepted = withEnv(
      {
        WLBP_JOURNEY_E2E: "1",
        WLBP_JOURNEY_CLOCK_FILE: clockFile,
        WLBP_SUPABASE_WORKDIR: workdir,
        WLBP_CAMPAIGN_PORT_PREFIX: "578",
      },
      () => preflightJourneyClock(),
    );
    assert.equal(accepted.databaseProfile, "57822");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a failed fixture run leaves no success clock behind", () => {
  const root = tempRoot();
  try {
    const workdir = isolatedWorkdir(root);
    const clockFile = join(root, "fixture-clock.json");
    writeStub(
      join(root, "bin"),
      "supabase",
      supabaseStubBody("postgresql://postgres:postgres@127.0.0.1:57822/postgres"),
    );
    writeStub(join(root, "bin"), "psql", "echo 'synthetic SQL failure' >&2\nexit 1\n");
    writeFileSync(clockFile, '{"stale":"marker"}\n', "utf8");
    const result = runNode(prepareScript, [], campaignEnv(root, workdir, clockFile));
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Journey fixture failed/i);
    assert.doesNotMatch(result.stderr, /postgresql:\/\//u);
    assert.equal(existsSync(clockFile), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("more than one returned timestamp is refused without a clock", () => {
  const root = tempRoot();
  try {
    const workdir = isolatedWorkdir(root);
    const clockFile = join(root, "fixture-clock.json");
    writeStub(
      join(root, "bin"),
      "supabase",
      supabaseStubBody("postgresql://postgres:postgres@127.0.0.1:57822/postgres"),
    );
    writeStub(
      join(root, "bin"),
      "psql",
      "printf '2026-10-14 09:00:00.000+00\\n2026-10-14 09:00:01.000+00\\n'\n",
    );
    const result = runNode(prepareScript, [], campaignEnv(root, workdir, clockFile));
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /exactly one authoritative seed timestamp/i);
    assert.equal(existsSync(clockFile), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("preparation refuses a non-isolated workdir before touching any tool", () => {
  const root = tempRoot();
  try {
    const clockFile = join(root, "fixture-clock.json");
    const result = runNode(prepareScript, [], {
      PATH: process.env.PATH,
      WLBP_SUPABASE_WORKDIR: join(root, "work"),
      WLBP_JOURNEY_CLOCK_FILE: clockFile,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Explicit isolated campaign workdir required/i);
    assert.equal(existsSync(clockFile), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("preparation refuses a retained campaign database port", () => {
  const root = tempRoot();
  try {
    const workdir = isolatedWorkdir(root);
    const clockFile = join(root, "fixture-clock.json");
    writeStub(
      join(root, "bin"),
      "supabase",
      supabaseStubBody("postgresql://postgres:postgres@127.0.0.1:54322/postgres"),
    );
    const result = runNode(prepareScript, [], campaignEnv(root, workdir, clockFile));
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /approved local campaign database/i);
    assert.equal(existsSync(clockFile), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function readWallReport(outDir) {
  const files = readdirSync(outDir);
  assert.equal(files.length, 1, `unexpected artifacts: ${files.join(", ")}`);
  assert.match(files[0], /-wall\.json$/u);
  const raw = readFileSync(join(outDir, files[0]), "utf8");
  return { raw, wall: JSON.parse(raw), path: join(outDir, files[0]) };
}

function verifyEnv(outDir) {
  return {
    PATH: process.env.PATH,
    WLBP_JOURNEY_OUTPUT: outDir,
  };
}

function browserCampaignEnv(root, outDir) {
  return {
    ...verifyEnv(outDir),
    WLBP_JOURNEY_E2E: "1",
    WLBP_JOURNEY_CLOCK_FILE: join(root, "missing-clock.json"),
    WLBP_SUPABASE_WORKDIR: join(root, ".artifacts", "campaign", "isolated"),
    WLBP_CAMPAIGN_PORT_PREFIX: "578",
    JOURNEY_SPAWN_MARKER: join(root, "spawned.marker"),
  };
}

// The script text contains "playwright test" so the wrapper classifies this
// dummy as a browser command; if the preflight guard ever regressed and
// spawned it, the harmless side effect would be observable instead of a real
// Playwright run.
const playwrightDummy =
  'require("node:fs").writeFileSync(process.env.JOURNEY_SPAWN_MARKER, "spawned"); // playwright test';
const nonBrowserDummy =
  'require("node:fs").writeFileSync(process.env.JOURNEY_SPAWN_MARKER, "spawned"); // check:fast';

test("verify wrapper records one newline-terminated sanitized JSON wall report", () => {
  const root = tempRoot();
  try {
    const outDir = join(root, "reports");
    const result = runNode(
      verifyScript,
      [
        "--phase",
        "suite",
        "--",
        process.execPath,
        "-e",
        'console.log("JOURNEY_PRIVATE_MARKER_136")',
      ],
      verifyEnv(outDir),
    );
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout + result.stderr, /JOURNEY_PRIVATE_MARKER_136/u);
    const { raw, wall, path } = readWallReport(outDir);
    assert.ok(raw.endsWith("\n") && !raw.endsWith("\n\n"));
    assert.equal(statSync(path).mode & 0o777, 0o600);
    assert.equal(wall.schemaVersion, 1);
    assert.equal(wall.phase, "suite");
    assert.equal(wall.exitCode, 0);
    assert.equal(wall.report, null);
    assert.equal(wall.counts, null);
    assert.deepEqual(wall.failures, []);
    assert.equal(wall.evidence, "command-only; no test counts");
    // Raw child output, including diagnostics, must never reach the report.
    assert.doesNotMatch(raw, /JOURNEY_PRIVATE_MARKER_136/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("verify wrapper fails closed before spawning when the clock is missing", () => {
  const root = tempRoot();
  try {
    const outDir = join(root, "reports");
    const result = runNode(
      verifyScript,
      ["--phase", "suite", "--", process.execPath, "-e", playwrightDummy],
      browserCampaignEnv(root, outDir),
    );
    assert.notEqual(result.status, 0);
    assert.equal(existsSync(join(root, "spawned.marker")), false);
    const { raw, wall } = readWallReport(outDir);
    assert.equal(wall.exitCode, 1);
    assert.equal(wall.counts, null);
    assert.equal(
      wall.evidence,
      "precondition failed before invocation; no test counts",
    );
    assert.match(wall.failures[0].error, /Prepare the isolated journey fixture clock/i);
    assert.doesNotMatch(raw, /postgresql:\/\//u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("verify wrapper setup phase bypasses the browser preflight", () => {
  const root = tempRoot();
  try {
    const outDir = join(root, "reports");
    const result = runNode(
      verifyScript,
      ["--phase", "setup", "--", process.execPath, "-e", playwrightDummy],
      browserCampaignEnv(root, outDir),
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(root, "spawned.marker")), true);
    const { wall } = readWallReport(outDir);
    assert.equal(wall.exitCode, 0);
    assert.equal(wall.counts, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("verify wrapper runs non-browser suite gates without a clock", () => {
  const root = tempRoot();
  try {
    const outDir = join(root, "reports");
    const result = runNode(
      verifyScript,
      ["--phase", "suite", "--", process.execPath, "-e", nonBrowserDummy],
      browserCampaignEnv(root, outDir),
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(root, "spawned.marker")), true);
    const { wall } = readWallReport(outDir);
    assert.equal(wall.exitCode, 0);
    assert.equal(wall.counts, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
