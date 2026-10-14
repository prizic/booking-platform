#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { isolatedEnvironment } from "./platform-admin-local.mjs";
import { assertNode22 } from "./demo-dev.mjs";
assertNode22();
if (!process.env.WLBP_CAMPAIGN)
  throw new Error(
    "WLBP_CAMPAIGN required; do not extend a retained admin stack for acceptance.",
  );
const local = isolatedEnvironment();
const result = spawnSync(
  "psql",
  [
    local.dbUrl,
    "--no-psqlrc",
    "--quiet",
    "--set=ON_ERROR_STOP=1",
    "--file",
    "tests/e2e/fixtures/admin-journey.sql",
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);
if (result.error || result.status !== 0)
  throw new Error(
    "Admin journey fixture failed; credential-bearing SQL output suppressed. Apply platform-admin-local seed first on the campaign.",
  );
console.log(
  "Independent synthetic admin journey fixture added; no retained data reset.",
);
