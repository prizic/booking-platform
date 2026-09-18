import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const fixturePath = new URL("../tests/e2e/fixtures/live-booking.sql", import.meta.url);

function required(entries, key) {
  const value = entries.get(key);
  if (value === undefined || value === "") {
    throw new Error(`Local Supabase status did not provide ${key}.`);
  }
  return value;
}

function decodeEnvValue(value) {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Reads only the three values the live test harness needs. In particular this
 * deliberately does not return the service-role key that `supabase status`
 * also reports.
 */
export function parseSupabaseStatusEnvironment(output) {
  const entries = new Map();
  for (const line of output.split(/\r?\n/u)) {
    const delimiter = line.indexOf("=");
    if (delimiter <= 0) continue;
    entries.set(line.slice(0, delimiter), decodeEnvValue(line.slice(delimiter + 1)));
  }
  return {
    apiUrl: required(entries, "API_URL"),
    databaseUrl: required(entries, "DB_URL"),
    publishableKey: required(entries, "PUBLISHABLE_KEY"),
  };
}

export function createLiveBookingEnvironment(local, hostname) {
  return {
    LOCAL_TENANT_HOST: hostname,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: local.publishableKey,
    NEXT_PUBLIC_SUPABASE_URL: local.apiUrl,
    WLBP_RUNTIME_ENV: "test",
  };
}

/**
 * The Playwright runner receives only a path to its owner-only fixture
 * credential file. Public runtime configuration is resolved independently by
 * each Client or Dashboard web-server command below.
 */
export function createLiveBookingRunnerEnvironment(credentialFile) {
  return {
    LIVE_BOOKING_CREDENTIAL_FILE: credentialFile,
    LIVE_BOOKING_E2E: "1",
  };
}

export function readLocalSupabaseEnvironment() {
  const output = execFileSync("supabase", ["status", "--output", "env"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return parseSupabaseStatusEnvironment(output);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: options.env ?? process.env,
    stdio: "inherit",
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with ${String(result.status)}.`);
  }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/**
 * Advances only a synthetic hold past its TTL and executes the same local
 * expiry job that a later hold creation invokes. This is test-fixture control,
 * not an application capability: the browser and the two Next apps never
 * receive database credentials.
 */
export function expireLiveBookingHold(holdId) {
  if (!uuidPattern.test(holdId)) {
    throw new Error("A live booking hold id must be a UUID.");
  }
  const local = readLocalSupabaseEnvironment();
  const result = spawnSync(
    "psql",
    [
      local.databaseUrl,
      "--no-psqlrc",
      "--quiet",
      "--set=ON_ERROR_STOP=1",
      "--command",
      `with target as (
         update app.booking_holds
         set expires_at = statement_timestamp() - interval '1 second'
         where id = '${holdId}'::uuid
         returning tenant_id
       )
       select private.expire_holds_v1((select tenant_id from target), 1)
       where exists (select 1 from target);`,
    ],
    { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] },
  );
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error("The local live booking fixture could not expire its hold.");
  }
}

export function prepareLiveBookingFixture(local) {
  const dashboardPassword = randomBytes(32).toString("base64url");
  run("psql", [
    local.databaseUrl,
    "--no-psqlrc",
    "--set=ON_ERROR_STOP=1",
    `--set=dashboard_password=${dashboardPassword}`,
    "--file",
    fileURLToPath(fixturePath),
  ]);
  return { dashboardPassword };
}

function createLiveBookingCredentialFile(dashboardPassword) {
  const directory = mkdtempSync(join(tmpdir(), "wlbp-live-booking-"));
  const credentialFile = join(directory, "credentials.json");
  writeFileSync(credentialFile, JSON.stringify({ dashboardPassword }), {
    encoding: "utf8",
    mode: 0o600,
  });
  return credentialFile;
}

function dashboardCredentialFileFromEnvironment() {
  const credentialFile = process.env.LIVE_BOOKING_CREDENTIAL_FILE;
  if (
    credentialFile === undefined ||
    credentialFile === "" ||
    !isAbsolute(credentialFile)
  ) {
    throw new Error("Live booking E2E requires an absolute credential-file path.");
  }
  return credentialFile;
}

function removeLiveBookingRunnerVariables(environment) {
  const result = { ...environment };
  for (const key of Object.keys(result)) {
    if (key.startsWith("LIVE_BOOKING_")) delete result[key];
  }
  return result;
}

export function createLiveBookingApplicationEnvironment(environment, local, hostname) {
  return {
    ...removeLiveBookingRunnerVariables(environment),
    ...createLiveBookingEnvironment(local, hostname),
  };
}

function readDashboardPassword(credentialFile) {
  const credential = JSON.parse(readFileSync(credentialFile, "utf8"));
  if (
    typeof credential.dashboardPassword !== "string" ||
    credential.dashboardPassword === ""
  ) {
    throw new Error("The live booking credential file is malformed.");
  }
  return credential.dashboardPassword;
}

async function createLiveDashboardSessionState() {
  const credentialFile = dashboardCredentialFileFromEnvironment();
  const local = readLocalSupabaseEnvironment();
  const password = readDashboardPassword(credentialFile);
  const response = await fetch(`${local.apiUrl}/auth/v1/token?grant_type=password`, {
    body: JSON.stringify({
      email: "live-dashboard@example.invalid",
      password,
    }),
    headers: {
      apikey: local.publishableKey,
      Authorization: `Bearer ${local.publishableKey}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Live E2E dashboard sign-in was rejected with ${response.status}.`);
  }
  const session = await response.json();
  const storageKey = `sb-${new URL(local.apiUrl).hostname.split(".")[0]}-auth-token`;
  const sessionFile = join(dirname(credentialFile), "dashboard-storage-state.json");
  writeFileSync(
    sessionFile,
    JSON.stringify({
      cookies: [
        {
          name: storageKey,
          sameSite: "Lax",
          url: "http://localhost:41731",
          value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`,
        },
      ],
    }),
    { encoding: "utf8", mode: 0o600 },
  );
}

export function runWithLiveBookingEnvironment(hostname, command, args) {
  const local = readLocalSupabaseEnvironment();
  run(command, args, {
    env: createLiveBookingApplicationEnvironment(process.env, local, hostname),
  });
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === undefined) {
    throw new Error("Usage: live-booking-e2e.mjs <command> [arguments...]");
  }
  if (command === "expire-hold") {
    if (args.length !== 1 || args[0] === undefined) {
      throw new Error("Usage: live-booking-e2e.mjs expire-hold <hold-id>");
    }
    expireLiveBookingHold(args[0]);
    return;
  }
  if (command === "dashboard-session") {
    if (args.length !== 0) {
      throw new Error("Usage: live-booking-e2e.mjs dashboard-session");
    }
    await createLiveDashboardSessionState();
    return;
  }
  const local = readLocalSupabaseEnvironment();
  const fixture = prepareLiveBookingFixture(local);
  const credentialFile = createLiveBookingCredentialFile(fixture.dashboardPassword);
  try {
    run(command, args, {
      env: {
        ...process.env,
        ...createLiveBookingRunnerEnvironment(credentialFile),
      },
    });
  } finally {
    rmSync(dirname(credentialFile), { force: true, recursive: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
