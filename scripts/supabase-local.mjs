import { spawnSync } from "node:child_process";
import { isAbsolute, join } from "node:path";
import { repositoryRoot } from "./workspace.mjs";
const args = process.argv.slice(2);
const workdir = process.env.WLBP_SUPABASE_WORKDIR;
if (workdir && !isAbsolute(workdir))
  throw new Error("The isolated Supabase workdir must be absolute.");
const result = spawnSync(
  process.execPath,
  [
    join(repositoryRoot, "node_modules/supabase/dist/supabase.js"),
    ...args,
    ...(workdir ? ["--workdir", workdir] : []),
  ],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
