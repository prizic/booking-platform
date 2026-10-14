#!/usr/bin/env node
// Local-only, non-resetting launcher. No user .env files are written.
import { spawn, spawnSync } from "node:child_process";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { demoHostnames, parseLocalStatus } from "./demo-local.mjs";
import { isPortAvailable, selectDevPorts } from "./dev.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const workdir = join(root, ".artifacts/demo-dev/isolated");
const project = "booking-demo-dev-20261013";
const prefix = "589";
const inspector = 8293;

export function assertNode22(version = process.versions.node) {
  const [major, minor] = version.split(".").map(Number);
  if (major !== 22 || minor < 13)
    throw new Error(
      "Node >=22.13 <23 required. Put an isolated Node22 bin directory first on PATH; do not change global defaults.",
    );
}

export function demoConfig(text) {
  if (!text.includes('project_id = "white-label-booking-platform"'))
    throw new Error("Unexpected source Supabase project; refusing to start.");
  return text
    .replace('project_id = "white-label-booking-platform"', `project_id = "${project}"`)
    .replace(/\b543(\d\d)\b/gu, `${prefix}$1`)
    .replace(/\binspector_port = 8083\b/u, `inspector_port = ${inspector}`)
    .replace(/(\[analytics\]\s*\nenabled\s*=\s*)true/u, "$1false");
}

function checked(command, args, label, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 300_000,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `${label} failed. ${result.error?.code === "ENOENT" ? `Install ${command} and put it on PATH.` : "Check the local prerequisite; credential-bearing output was suppressed."}`,
    );
  return result.stdout;
}

async function prepare() {
  const target = join(workdir, "supabase");
  const source = join(root, "supabase");
  const expected = demoConfig(await readFile(join(source, "config.toml"), "utf8"));
  let existing;
  try {
    existing = await readFile(join(target, "config.toml"), "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (existing !== undefined && existing !== expected)
    throw new Error(
      "Demo stack configuration changed. Review/apply local configuration deliberately; retained demo data will not be reset or overwritten.",
    );
  if (existing === undefined) {
    await mkdir(target, { recursive: true, mode: 0o700 });
    await cp(source, target, {
      recursive: true,
      filter: (file) => !/[/\\]\.(temp|branches)([/\\]|$)/u.test(file),
    });
    await writeFile(join(target, "config.toml"), expected, { mode: 0o600 });
  } else {
    // Refresh only this launcher-owned migration copy, never retained DB data.
    await cp(join(source, "migrations"), join(target, "migrations"), {
      recursive: true,
      force: true,
    });
  }
  const args = ["exec", "supabase", "status", "--output", "env", "--workdir", workdir];
  let output;
  try {
    output = checked("pnpm", args, "Local Supabase status");
  } catch {
    const ports = [
      ...expected.matchAll(/^\s*(?:port|shadow_port|inspector_port)\s*=\s*(\d+)/gmu),
    ].map((match) => Number(match[1]));
    for (const port of new Set(ports)) {
      if (!(await isPortAvailable(port)))
        throw new Error(
          `Demo stack port ${port} is occupied. Stop only its owning process or choose a separate local profile; no retained stack was stopped.`,
        );
    }
    process.stdout.write(`Starting local Supabase project ${project} (no reset).\n`);
    checked(
      "pnpm",
      ["exec", "supabase", "start", "--workdir", workdir],
      "Local Supabase start (Docker/images/ports)",
    );
    output = checked("pnpm", args, "Local Supabase status");
  }
  const local = parseLocalStatus(output);
  if (
    new URL(local.apiUrl).port !== `${prefix}21` ||
    new URL(local.databaseUrl).port !== `${prefix}22`
  )
    throw new Error("Supabase identity/port mismatch; refusing to seed.");
  return local;
}

export function demoAppEnvironment(
  local,
  application,
  port,
  environment = process.env,
) {
  const env = { ...environment };
  // Privileged credentials and harness/session files cannot reach distributed apps.
  for (const key of Object.keys(env))
    if (
      /SERVICE_ROLE|SECRET|PRIVATE_KEY|PASSWORD|TOKEN|API_KEY|DATABASE_URL|DB_URL|CREDENTIAL_FILE|STORAGE_STATE|^WLBP_(?:SUPABASE|DEMO)_/u.test(
        key,
      )
    )
      delete env[key];
  return {
    ...env,
    NODE_ENV: "development",
    LOCAL_TENANT_HOST: demoHostnames[application],
    NEXT_PUBLIC_SITE_URL: `http://localhost:${port}`,
    NEXT_PUBLIC_SUPABASE_URL: local.apiUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: local.publishableKey,
    WLBP_NEXT_DIST_DIR: `.next-demo-dev-${application}`,
    WLBP_RUNTIME_ENV: "test",
  };
}

async function main() {
  if (process.argv.length > 2) throw new Error("Usage: pnpm demo:dev");
  assertNode22();
  checked(
    "docker",
    ["info", "--format", "{{.ServerVersion}}"],
    "Docker daemon (start Docker Desktop)",
  );
  checked("psql", ["--version"], "psql (PostgreSQL client)");
  process.stdout.write("Checking frozen workspace installation.\n");
  checked(
    "pnpm",
    ["install", "--frozen-lockfile"],
    "Frozen install (lockfile/network/Node)",
  );
  const local = await prepare();
  checked(
    "pnpm",
    ["exec", "supabase", "migration", "up", "--local", "--workdir", workdir],
    "Named local demo migrations (data retained; no reset)",
  );
  checked(process.execPath, ["scripts/demo-local.mjs"], "Arabic demo seed", {
    ...process.env,
    WLBP_SUPABASE_WORKDIR: workdir,
    WLBP_DEMO_OUTPUT: ".artifacts/demo-dev",
  });
  // Fresh checkout package exports point to dist; build shared prerequisites once.
  checked(
    "pnpm",
    [
      "exec",
      "turbo",
      "run",
      "build",
      "--filter=@wlbp/client^...",
      "--filter=@wlbp/dashboard^...",
      "--concurrency=2",
    ],
    "Shared package build",
  );
  const ports = await selectDevPorts([3000, 3001]);
  const children = [];
  for (const [index, app] of ["client", "dashboard"].entries()) {
    process.stdout.write(
      `${app}: http://localhost:${ports[index]}/ar (tenant ${demoHostnames[app]})\n`,
    );
    const child = spawn(
      "pnpm",
      [
        "--filter",
        `@wlbp/${app}`,
        "exec",
        "next",
        "dev",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(ports[index]),
      ],
      {
        cwd: root,
        env: demoAppEnvironment(local, app, ports[index]),
        stdio: "inherit",
      },
    );
    children.push(child);
  }
  process.stdout.write(
    "Credentials remain in .artifacts/demo-dev/credentials.json (owner-readable). No admin app started. Ctrl-C stops these apps; the local stack/data stays retained.\n",
  );
  const stop = (signal = "SIGTERM") => children.forEach((child) => child.kill(signal));
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop());
  await Promise.all(
    children.map(
      (child) =>
        new Promise((resolve, reject) => {
          child.once("error", () => {
            stop();
            reject(new Error("App launch failed; check pnpm and available ports."));
          });
          child.once("exit", (code, signal) => {
            stop();
            if (code && !signal) process.exitCode = code;
            resolve();
          });
        }),
    ),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
