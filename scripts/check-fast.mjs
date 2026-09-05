import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageManager = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function resolveCommit(ref) {
  if (!ref || /^0+$/.test(ref)) return undefined;

  try {
    return execFileSync("git", ["rev-parse", "--verify", `${ref}^{commit}`], {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

function run(label, args) {
  process.stdout.write(`\n▸ ${label}\n`);
  const result = spawnSync(packageManager, args, {
    cwd: repositoryRoot,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// The workflow supplies the pull request's base/head SHA. Locally, origin/main
// is the preferred base, with the first parent as a useful fallback for a
// shallow checkout. A missing base is handled by checking every workspace so
// this command remains fail-closed rather than silently checking nothing.
const requestedBase =
  process.env.FAST_BASE_SHA ?? process.env.GITHUB_BASE_SHA ?? "origin/main";
const requestedHead = process.env.FAST_HEAD_SHA ?? process.env.GITHUB_SHA ?? "HEAD";
const head = resolveCommit(requestedHead) ?? resolveCommit("HEAD");
const base = resolveCommit(requestedBase) ?? resolveCommit(`${head}^`);
const affectedFilter =
  base && head && base !== head ? `--filter=...[${base}...${head}]` : undefined;

for (const [label, args] of [
  ["Validate the lockfile", ["check:lockfile"]],
  ["Validate workflow safety controls", ["check:ci"]],
  ["Check formatting", ["format:check"]],
  ["Check release and compatibility contracts", ["test:contract"]],
  ["Check configuration fixtures", ["test:config"]],
  ["Check instance configuration", ["check:config"]],
  ["Check distribution closure", ["check:distribution"]],
  ["Scan secret-shaped values", ["check:secrets"]],
  ["Validate the knowledge pack", ["check:docs"]],
]) {
  run(label, ["run", ...args]);
}

run("Validate the affected workspace graph", [
  "exec",
  "turbo",
  "run",
  "lint",
  "typecheck",
  "test:unit",
  ...(affectedFilter ? [affectedFilter] : []),
  "--concurrency=4",
  "--output-logs=errors-only",
]);

process.stdout.write(
  `\n✓ Fast feedback passed${affectedFilter ? ` for ${base.slice(0, 12)}..${head.slice(0, 12)}` : " for the full workspace"}.\n` +
    "  The ordered source workflow remains the required merge/release gate.\n",
);
