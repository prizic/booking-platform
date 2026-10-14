#!/usr/bin/env node
// Current-owned harness can build/serve the original source without edits.
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { platform, arch, release } from "node:os";
import { assertNode22 } from "./demo-dev.mjs";
import {
  createLiveBookingApplicationEnvironment,
  readLocalSupabaseEnvironment,
} from "./live-booking-e2e.mjs";
import { platformAdminChildEnvironment } from "./platform-admin-local.mjs";
import { isPortAvailable } from "./dev.mjs";
assertNode22();
const [label, app, checkoutText, action, port = "41831"] = process.argv.slice(2);
if (
  !["before", "after"].includes(label) ||
  !["dashboard", "admin"].includes(app) ||
  !["build", "serve"].includes(action) ||
  !/^\d{4,5}$/u.test(port)
)
  throw new Error(
    "Usage: navigation-target.mjs before|after dashboard|admin <absolute checkout> build|serve [port]",
  );
const checkout = resolve(checkoutText);
const application = app === "admin" ? "platform-admin" : app;
const local = readLocalSupabaseEnvironment();
const db = new URL(local.databaseUrl);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(db.hostname) ||
  !["55322", "57722", "57822", "57922"].includes(db.port) ||
  !process.env.WLBP_SUPABASE_WORKDIR?.includes("/.artifacts/")
)
  throw new Error("Isolated local synthetic measurement DB required");
const base = "a94bad638b0eaf49de0bc62c1b3ed5965b28308e";
const git = (args) =>
  execFileSync("git", ["-C", checkout, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const revision = git(["rev-parse", "HEAD"]);
const untrackedSource = git([
  "ls-files",
  "--others",
  "--exclude-standard",
  "--",
  "apps",
  "packages",
  "supabase",
]);
const diff = git([
  "diff",
  "HEAD",
  "--",
  "apps",
  "packages",
  "supabase",
  "platform-contract.json",
  "pnpm-lock.yaml",
]);
if (label === "before" && (revision !== base || diff !== "" || untrackedSource !== ""))
  throw new Error(
    "Before source must remain the exact original base, with no source modifications",
  );
const cache = `.next-navigation-${label}-${application}`;
const sourceHasher = createHash("sha256");
const sourceFiles = git([
  "ls-files",
  "--cached",
  "--others",
  "--exclude-standard",
  "--",
  "apps",
  "packages",
  "supabase",
  "platform-contract.json",
  "pnpm-lock.yaml",
  "package.json",
  "turbo.json",
  ".nvmrc",
])
  .split("\n")
  .filter(Boolean)
  .sort();
for (const file of sourceFiles) {
  sourceHasher.update(file);
  try {
    sourceHasher.update(await readFile(join(checkout, file)));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    sourceHasher.update("[deleted]");
  }
}
const sourceFingerprint = sourceHasher.digest("hex");
const safe = {
  ...createLiveBookingApplicationEnvironment(
    Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) =>
          !/(?:SERVICE_ROLE|TOKEN|SECRET|PRIVATE_KEY|PASSWORD|DATABASE_URL|DB_URL|CREDENTIAL_FILE|STORAGE_STATE)/u.test(
            key,
          ),
      ),
    ),
    local,
    "dashboard.dashboard-completion.example.invalid",
  ),
  NODE_ENV: "production",
  WLBP_NEXT_DIST_DIR: cache,
  NEXT_PUBLIC_SITE_URL: `http://localhost:${port}`,
};
const env =
  app === "admin"
    ? {
        ...platformAdminChildEnvironment(local, port, safe),
        PLATFORM_ADMIN_DIST_DIR: cache,
      }
    : safe;
const run = (args) => {
  const result = spawnSync("pnpm", ["--dir", checkout, ...args], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 900000,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      "Production-like build failed; raw credential-bearing diagnostics suppressed. Use the parent sanitized gate report.",
    );
};
const output = resolve(".artifacts/booking-journey");
await mkdir(output, { recursive: true, mode: 0o700 });
const metaPath = join(output, `build-${label}-${app}.json`);
if (action === "build") {
  const started = performance.now();
  run([
    "exec",
    "turbo",
    "run",
    "build",
    `--filter=@wlbp/${application}^...`,
    "--concurrency=2",
  ]);
  run(["--filter", `@wlbp/${application}`, "exec", "next", "build"]);
  const fixture = await readFile("tests/e2e/fixtures/booking-journey.sql");
  await writeFile(
    metaPath,
    JSON.stringify(
      {
        label,
        application: app,
        revision,
        workingTreeFingerprint: sourceFingerprint,
        buildMode: "production",
        node: process.versions.node,
        os: platform(),
        architecture: arch(),
        osRelease: release(),
        buildCache: cache,
        databaseProfile: db.port,
        fixtureDigest: createHash("sha256").update(fixture).digest("hex"),
        buildWallClockMs: performance.now() - started,
        builtAt: new Date().toISOString(),
        checkout,
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
  console.log(
    `Production ${label} ${app} build metadata saved; no timing samples measured.`,
  );
} else {
  if (!(await isPortAvailable(Number(port))))
    throw new Error(
      "Requested measurement port is held; no existing server was stopped",
    );
  const metadata = JSON.parse(await readFile(metaPath, "utf8"));
  if (
    metadata.revision !== revision ||
    metadata.workingTreeFingerprint !== sourceFingerprint
  )
    throw new Error("Source changed after build; rebuild before measuring");
  const startupStarted = performance.now();
  const child = spawn(
    "pnpm",
    [
      "--dir",
      checkout,
      "--filter",
      `@wlbp/${application}`,
      "exec",
      "next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      port,
    ],
    { env, stdio: ["ignore", "ignore", "ignore"] },
  );
  console.log(
    `${label} ${app} on http://localhost:${port}; metadata ${metaPath}. Ctrl-C stops only this child.`,
  );
  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
  child.once("error", () => {
    console.error("Measurement server failed to start");
    process.exitCode = 1;
  });
  child.once("exit", (code) => {
    process.exitCode = code ?? 0;
  });
  const readinessRoute = app === "admin" ? "/en/login" : "/en/auth/sign-in";
  let isReady = false;
  while (performance.now() - startupStarted < 120000 && child.exitCode === null) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}${readinessRoute}`, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        isReady = true;
        break;
      }
    } catch {
      /* startup only, no credential/error output */
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
  if (!isReady) {
    child.kill("SIGTERM");
    throw new Error(
      "Production server did not reach its sign-in route within startup budget",
    );
  }
  await writeFile(
    join(output, `startup-${label}-${app}.json`),
    JSON.stringify(
      {
        schemaVersion: 1,
        label,
        application: app,
        spawnToRouteReadyMs: performance.now() - startupStarted,
        readinessRoute,
        port,
        buildMetadata: metaPath,
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
  console.log(
    "Server ready; startup time recorded separately from setup/build/navigation suite.",
  );
}
