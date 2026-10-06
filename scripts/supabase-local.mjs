import { spawnSync } from "node:child_process";
import { isAbsolute } from "node:path";
const args = process.argv.slice(2);
const workdir = process.env.WLBP_SUPABASE_WORKDIR;
if (workdir && !isAbsolute(workdir))
  throw new Error("The isolated Supabase workdir must be absolute.");
const result = spawnSync(
  "supabase",
  [...args, ...(workdir ? ["--workdir", workdir] : [])],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
