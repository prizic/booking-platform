import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
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
    env: { ...process.env, ...options.env },
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

export function runWithLiveBookingEnvironment(hostname, command, args) {
  const local = readLocalSupabaseEnvironment();
  run(command, args, { env: createLiveBookingEnvironment(local, hostname) });
}

function main() {
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
  const local = readLocalSupabaseEnvironment();
  const fixture = prepareLiveBookingFixture(local);
  run(command, args, {
    env: {
      ...createLiveBookingEnvironment(local, "client.live-booking.example.invalid"),
      LIVE_BOOKING_DASHBOARD_PASSWORD: fixture.dashboardPassword,
      LIVE_BOOKING_E2E: "1",
    },
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
