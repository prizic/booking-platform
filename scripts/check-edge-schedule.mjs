#!/usr/bin/env node
// Issue #101. Two cheap facts about the Edge surface, checked rather than hoped.
//
// Both of these were wrong when this script was written: the README described
// four functions that did not exist, and nothing connected a Cron entry to the
// function it invokes.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { repositoryRoot } from "./workspace.mjs";

const functionsDirectory = path.join(repositoryRoot, "supabase/functions");

const entries = await readdir(functionsDirectory, { withFileTypes: true });
const deployed = entries
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
  .map((entry) => entry.name)
  .sort();

const problems = [];

// A scheduled job that names a function nobody wrote is a job that fails every
// minute in production and nowhere else.
const schedule = await readFile(
  path.join(repositoryRoot, "supabase/cron/schedule.sql"),
  "utf8",
);
for (const match of schedule.matchAll(/invoke_edge_function_v1\('([a-z0-9-]+)'\)/gu)) {
  if (!deployed.includes(match[1])) {
    problems.push(
      `supabase/cron/schedule.sql schedules ${match[1]}, which does not exist`,
    );
  }
}

// And a README that lists a function nobody wrote is documentation that lies.
const readme = await readFile(path.join(functionsDirectory, "README.md"), "utf8");
const documented = [...readme.matchAll(/^\|\s*`([a-z0-9-]+)`/gmu)]
  .map((m) => m[1])
  .sort();
for (const name of deployed) {
  if (!documented.includes(name))
    problems.push(`${name} is not in the functions README`);
}
for (const name of documented) {
  if (!deployed.includes(name)) {
    problems.push(`the functions README describes ${name}, which does not exist`);
  }
}

if (problems.length > 0) {
  process.exitCode = 1;
  process.stderr.write(`edge function surface:\n- ${problems.join("\n- ")}\n`);
} else {
  process.stdout.write(
    `✓ ${deployed.length} edge functions, each documented and each schedulable\n`,
  );
}
