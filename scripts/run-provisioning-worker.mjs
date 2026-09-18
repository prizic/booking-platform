#!/usr/bin/env node
// Runs the github provisioning worker once against whatever is claimable.
//
// Deliberately not a daemon: the database owns ordering, retries and the
// visibility timeout, so a process that exits between drains loses nothing and
// cannot wedge. The schedule decides the cadence.
import {
  createWorkerFromEnvironment,
  drain,
} from "../control-plane/github-app/src/run-worker.mjs";
import { repositoryRoot } from "./workspace.mjs";

const worker = createWorkerFromEnvironment({ root: repositoryRoot });
const outcomes = await drain(worker);

for (const outcome of outcomes) {
  process.stdout.write(
    `${outcome.kind}${outcome.stepKey ? ` ${outcome.stepKey}` : ""}${
      outcome.reason ? ` (${outcome.reason})` : ""
    }\n`,
  );
}

// A failed step is a fact the database already recorded; exiting non-zero as
// well turns one bad step into a red schedule that hides the next one.
process.exit(0);
