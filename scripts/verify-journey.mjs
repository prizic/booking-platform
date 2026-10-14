#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { performance } from "node:perf_hooks";
import { assertNode22 } from "./demo-dev.mjs";
import { safeFailure } from "./journey-sanitize.mjs";
import {
  preflightJourneyClock,
  shouldRunJourneyPreflight,
} from "./journey-preflight.mjs";

assertNode22();
const args = process.argv.slice(2);
const split = args.indexOf("--");
const options = args.slice(0, split < 0 ? 0 : split);
const phase = options[0] === "--phase" ? options[1] : "suite";
if (
  !["setup", "startup", "suite", "navigation"].includes(phase) ||
  (options.length && options.length !== 2)
)
  throw new Error(
    "Usage: verify-journey.mjs [--phase setup|startup|suite|navigation] -- <command> [args]",
  );
if (split < 0)
  throw new Error(
    "Select one project or gate explicitly: verify-journey.mjs [--phase phase] -- <command> [args]",
  );
const [command, ...commandArgs] = args.slice(split + 1);
if (!command) throw new Error("A command is required");
const directory = resolve(
  process.env.WLBP_JOURNEY_OUTPUT ?? ".artifacts/booking-journey",
);
await mkdir(directory, { recursive: true, mode: 0o700 });
const runId = `${phase}-${new Date().toISOString().replace(/[:.]/gu, "-")}-${process.pid}`;
const reportPath = join(directory, `${runId}.json`);
const rawResults = await mkdtemp(join(directory, `${runId}-private-results-`));
const startedAt = new Date().toISOString();
const start = performance.now();
const browserCampaign = shouldRunJourneyPreflight(phase, command, commandArgs);
let preflightFailure = null;
if (browserCampaign) {
  try {
    preflightJourneyClock();
  } catch (error) {
    preflightFailure = safeFailure(error, "Journey fixture preflight", undefined);
  }
}
if (preflightFailure) {
  const code = 1;
  await rm(rawResults, { recursive: true, force: true });
  await writeFile(
    join(directory, `${runId}-wall.json`),
    JSON.stringify(
      {
        schemaVersion: 1,
        phase,
        startedAt,
        wallClockMs: performance.now() - start,
        exitCode: code,
        node: process.versions.node,
        report: null,
        counts: null,
        failures: [preflightFailure],
        evidence: "precondition failed before invocation; no test counts",
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
  console.log(
    `${phase} exited ${code}; precondition failed; wall time recorded in ${runId}-wall.json. Raw output suppressed.`,
  );
  process.exitCode = code;
  process.exit(code);
}
// No raw output file: arbitrary app diagnostics may contain PII or credentials.
const child = spawn(command, commandArgs, {
  env: {
    ...process.env,
    WLBP_JOURNEY_REPORT: reportPath,
    WLBP_JOURNEY_RESULTS: rawResults,
    PLAYWRIGHT_NO_COPY_PROMPT: "1",
  },
  stdio: ["inherit", "pipe", "pipe"],
});
child.stdout.resume();
child.stderr.resume();
const forward = (signal) => child.kill(signal);
process.on("SIGINT", forward);
process.on("SIGTERM", forward);
let failure;
const code = await new Promise((resolveCode) => {
  child.once("error", (error) => {
    failure = safeFailure(error, "Runner launch", undefined);
    resolveCode(1);
  });
  child.once("exit", (value) => resolveCode(value ?? 1));
});
let suite;
try {
  suite = JSON.parse(await readFile(reportPath, "utf8"));
} catch {
  /* Non-browser phases have no reporter. */
}
// Playwright can write raw error-context.md even with traces/copy prompts off.
// Retain only the sanitized report; purge this run's private output directory.
await rm(rawResults, { recursive: true, force: true });
if (code !== 0 && !failure && !suite?.failures?.length)
  failure = safeFailure(
    { message: "Command exited non-zero; raw diagnostics withheld." },
    `${phase} command`,
    undefined,
  );
await writeFile(
  join(directory, `${runId}-wall.json`),
  JSON.stringify(
    {
      schemaVersion: 1,
      phase,
      startedAt,
      wallClockMs: performance.now() - start,
      exitCode: code,
      node: process.versions.node,
      report: suite ? reportPath : null,
      counts: suite?.counts ?? null,
      failures: failure ? [failure] : (suite?.failures ?? []),
      evidence: suite ? "executed" : "command-only; no test counts",
    },
    null,
    2,
  ) + "\n",
  { mode: 0o600 },
);
console.log(
  `${phase} exited ${code}; wall time recorded in ${runId}-wall.json. Raw output suppressed.`,
);
process.exitCode = code;
