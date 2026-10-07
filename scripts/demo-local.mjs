#!/usr/bin/env node
// Opt-in Arabic demo business for local previews (supabase/demo/arabic-demo.sql).
//
// Refuses anything but a loopback Supabase stack, applies the synthetic SQL with
// `wlbp.allow_demo=on` for that one session, gives the demo owner a fresh random
// password through the local Auth admin API, and saves it to an ignored,
// owner-only file. The password and the stack's service key are never printed.
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const sqlPath = join(root, "supabase/demo/arabic-demo.sql");
const outputDirectory = join(root, ".artifacts/demo");
const credentialsPath = join(outputDirectory, "credentials.json");

export const demoOwner = Object.freeze({
  email: "demo-owner@example.invalid",
  userId: "ad010000-0000-4000-8000-000000000001",
});
export const demoHostnames = Object.freeze({
  client: "client.arabic-demo.example.invalid",
  dashboard: "dashboard.arabic-demo.example.invalid",
});

const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

function decode(value) {
  return value.length >= 2 && value.startsWith('"') && value.endsWith('"')
    ? value.slice(1, -1)
    : value;
}

/**
 * Parses `supabase status --output env` and fails closed unless both the API and
 * the database are on this machine. Error messages never echo a URL or key.
 */
export function parseLocalStatus(output) {
  const entries = new Map();
  for (const line of output.split(/\r?\n/u)) {
    const delimiter = line.indexOf("=");
    if (delimiter > 0)
      entries.set(line.slice(0, delimiter), decode(line.slice(delimiter + 1)));
  }
  const status = {
    apiUrl: entries.get("API_URL"),
    databaseUrl: entries.get("DB_URL"),
    publishableKey: entries.get("PUBLISHABLE_KEY") || entries.get("ANON_KEY"),
    serviceRoleKey: entries.get("SERVICE_ROLE_KEY") || entries.get("SECRET_KEY"),
  };
  let local = false;
  try {
    const api = new URL(status.apiUrl);
    const database = new URL(status.databaseUrl);
    local =
      ["http:", "https:"].includes(api.protocol) &&
      loopbackHosts.has(api.hostname) &&
      ["postgres:", "postgresql:"].includes(database.protocol) &&
      loopbackHosts.has(database.hostname) &&
      !database.searchParams.has("host") &&
      !database.searchParams.has("hostaddr") &&
      typeof status.publishableKey === "string" &&
      status.publishableKey.length > 0 &&
      typeof status.serviceRoleKey === "string" &&
      status.serviceRoleKey.length > 0;
  } catch {
    /* fail closed below without echoing connection details */
  }
  if (!local) {
    throw new Error(
      "Refusing: the Supabase stack is not a local (loopback) stack, or its status is incomplete.",
    );
  }
  return status;
}

function readStatus() {
  const workdir = process.env.WLBP_SUPABASE_WORKDIR;
  if (workdir && !isAbsolute(workdir)) {
    throw new Error("WLBP_SUPABASE_WORKDIR must be an absolute path.");
  }
  const args = [
    "status",
    "--output",
    "env",
    ...(workdir ? ["--workdir", workdir] : []),
  ];
  const shell = process.platform === "win32";
  const result = spawnSync(
    "supabase",
    shell ? args.map((arg) => (/[\s"]/u.test(arg) ? `"${arg}"` : arg)) : args,
    {
      cwd: root,
      encoding: "utf8",
      shell,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000,
    },
  );
  if (result.error !== undefined || result.status !== 0) {
    // stderr is suppressed: it can contain connection strings.
    throw new Error("`supabase status` failed. Is the local stack running?");
  }
  return parseLocalStatus(result.stdout);
}

function applySql(databaseUrl) {
  try {
    execFileSync(
      "psql",
      [
        databaseUrl,
        "--no-psqlrc",
        "--quiet",
        "--set=ON_ERROR_STOP=1",
        "--file",
        sqlPath,
      ],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, PGOPTIONS: "-c wlbp.allow_demo=on" },
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 120_000,
      },
    );
  } catch (error) {
    const detail = typeof error.stderr === "string" ? error.stderr.trim() : "";
    throw new Error(
      `Applying the Arabic demo SQL failed.${detail ? `\n${detail}` : ""}`,
    );
  }
}

async function auth(status, route, { method = "GET", token, body } = {}) {
  const key =
    token === status.serviceRoleKey ? status.serviceRoleKey : status.publishableKey;
  const response = await fetch(`${status.apiUrl}/auth/v1${route}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      apikey: key,
      authorization: `Bearer ${token ?? status.publishableKey}`,
      "content-type": "application/json",
    },
    method,
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    // The body is omitted: it may echo the request.
    throw new Error(
      `Local Auth ${method} ${route.split("?")[0]} returned ${response.status}.`,
    );
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function setOwnerPassword(status) {
  const password = randomBytes(24).toString("base64url");
  await auth(status, `/admin/users/${demoOwner.userId}`, {
    body: { email_confirm: true, password },
    method: "PUT",
    token: status.serviceRoleKey,
  });
  // Prove the credential works before saving it.
  const session = await auth(status, "/token?grant_type=password", {
    body: { email: demoOwner.email, password },
    method: "POST",
  });
  await auth(status, "/logout?scope=local", {
    method: "POST",
    token: session.access_token,
  });
  return password;
}

async function saveCredentials(password) {
  await mkdir(outputDirectory, { mode: 0o700, recursive: true });
  await chmod(outputDirectory, 0o700);
  const temporary = `${credentialsPath}.${process.pid}.tmp`;
  await writeFile(
    temporary,
    `${JSON.stringify(
      {
        note: "Synthetic local demo account. Never reuse outside a local stack.",
        email: demoOwner.email,
        password,
        dashboardHost: demoHostnames.dashboard,
        clientHost: demoHostnames.client,
      },
      null,
      2,
    )}\n`,
    { flag: "wx", mode: 0o600 },
  );
  await rename(temporary, credentialsPath);
  await chmod(credentialsPath, 0o600);
}

async function main() {
  if (process.argv.length > 2) throw new Error("Usage: pnpm demo:local");
  const status = readStatus();
  applySql(status.databaseUrl);
  const password = await setOwnerPassword(status);
  await saveCredentials(password);
  const file = relative(root, credentialsPath);
  process.stdout.write(
    [
      "Arabic demo data applied (synthetic, local only).",
      `Demo owner: ${demoOwner.email}`,
      `Password:   saved to ${file} (owner-readable only)`,
      `Dashboard tenant host: ${demoHostnames.dashboard} (set LOCAL_TENANT_HOST to it)`,
      `Client tenant host:    ${demoHostnames.client}`,
      "",
    ].join("\n"),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
