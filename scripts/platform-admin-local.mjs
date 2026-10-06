#!/usr/bin/env node
// The isolated Supabase stack Platform Admin work runs against. It exists
// because the retained `white-label-booking-platform` stack holds demo data we
// must not reset, port 54321 currently belongs to an unrelated project, and the
// dashboard campaign owns 553xx. Every command here refuses any other workdir.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { chmod, cp, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { closeSync, openSync } from "node:fs";
import { totp } from "./totp.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("..", import.meta.url));
export const output = path.join(root, ".artifacts/platform-admin");
export const workdir = path.join(output, "isolated");
export const projectId = "platform-admin-20261006";

export function isolateConfig(text) {
  if (!text.includes('project_id = "white-label-booking-platform"'))
    throw new Error("unexpected config.toml: refusing to isolate another project");
  let out = text
    .replace(
      'project_id = "white-label-booking-platform"',
      `project_id = "${projectId}"`,
    )
    .replace(/\b543(\d\d)\b/gu, "565$1")
    .replace(/\binspector_port = 8083\b/u, "inspector_port = 8093");
  if (/^\[analytics\]$/mu.test(out)) {
    out = out.replace(
      /^\[analytics\]\n(?:enabled = \w+\n)?/mu,
      "[analytics]\nenabled = false\n",
    );
  } else {
    out += `${out.endsWith("\n") ? "" : "\n"}[analytics]\nenabled = false\n`;
  }
  if (/^\[realtime\]$/mu.test(out)) {
    out = out.replace(
      /^(\[realtime\]\n)((?:(?!^\[)[\s\S])*)/mu,
      (_match, header, section) =>
        header +
        (/^enabled\s*=/mu.test(section)
          ? section.replace(/^enabled\s*=.*$/mu, "enabled = true")
          : `enabled = true\n${section}`),
    );
  } else {
    out += `${out.endsWith("\n") ? "" : "\n"}[realtime]\nenabled = true\n`;
  }
  return out;
}

async function sync() {
  const source = path.join(root, "supabase");
  const target = path.join(workdir, "supabase");
  await mkdir(target, { recursive: true });
  await cp(source, target, {
    recursive: true,
    force: true,
    filter: (file) => !/[/\\]\.(temp|branches)([/\\]|$)/u.test(file),
  });
  const config = await readFile(path.join(source, "config.toml"), "utf8");
  await writeFile(path.join(target, "config.toml"), isolateConfig(config));
}

async function assertIsolated() {
  const config = await readFile(path.join(workdir, "supabase/config.toml"), "utf8");
  if (!config.includes(`project_id = "${projectId}"`))
    throw new Error(`refusing: ${workdir} is not ${projectId}`);
}

function supabase(args, quiet = false) {
  const result = spawnSync(
    "pnpm",
    ["exec", "supabase", ...args, "--workdir", workdir],
    {
      cwd: root,
      stdio: quiet ? ["ignore", "pipe", "pipe"] : "inherit",
    },
  );
  if (result.status !== 0) {
    if (quiet)
      process.stderr.write(
        `Supabase ${args[0]} failed; credential-bearing diagnostics suppressed.\n`,
      );
    process.exit(result.status ?? 1);
  }
}

const credentialsPath = path.join(output, "credentials.json");

export function parseIsolatedStatus(text) {
  const env = Object.fromEntries(
    text
      .trim()
      .split("\n")
      .filter((line) => /^[A-Z_]+=/u.test(line))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1).replace(/^"|"$/gu, "")];
      }),
  );
  const result = {
    apiUrl: env.API_URL,
    dbUrl: env.DB_URL,
    anonKey: env.ANON_KEY,
    publishableKey: env.PUBLISHABLE_KEY,
    serviceRoleKey: env.SERVICE_ROLE_KEY,
  };
  // Every write below uses the service key; it must only ever be this stack's.
  let safe = false;
  try {
    const api = new URL(result.apiUrl);
    const db = new URL(result.dbUrl);
    const localHosts = ["127.0.0.1", "localhost", "[::1]"];
    safe =
      api.protocol === "http:" &&
      api.port === "56521" &&
      localHosts.includes(api.hostname) &&
      !api.username &&
      !api.password &&
      api.pathname === "/" &&
      !api.search &&
      !api.hash &&
      db.protocol === "postgresql:" &&
      db.port === "56522" &&
      localHosts.includes(db.hostname) &&
      db.pathname === "/postgres" &&
      !db.search &&
      !db.hash &&
      [result.anonKey, result.publishableKey, result.serviceRoleKey].every(
        (key) => typeof key === "string" && key.length > 0,
      );
  } catch {
    /* fail closed without echoing connection strings or keys */
  }
  if (!safe) {
    throw new Error("refusing: status is not the isolated platform-admin stack");
  }
  return result;
}

export function isolatedEnvironment() {
  let status;
  try {
    status = execFileSync(
      path.join(root, "node_modules/.bin/supabase"),
      ["status", "--output", "env", "--workdir", workdir],
      {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30_000,
      },
    );
  } catch {
    throw new Error(
      "isolated Supabase status unavailable; credential-bearing diagnostics suppressed",
    );
  }
  return parseIsolatedStatus(status);
}

export const demoOperators = Object.freeze(
  [
    { key: "admin", email: "demo-admin@platform-admin.example.invalid", role: "admin" },
    {
      key: "admin2",
      email: "demo-admin-2@platform-admin.example.invalid",
      role: "admin",
    },
    {
      key: "operator",
      email: "demo-operator@platform-admin.example.invalid",
      role: "operator",
    },
    {
      key: "viewer",
      email: "demo-viewer@platform-admin.example.invalid",
      role: "viewer",
    },
  ].map(Object.freeze),
);

export function demoCodeForOperator(credentials, who, unixSeconds) {
  if (!demoOperators.some((operator) => operator.key === who))
    throw new Error("unknown demo operator");
  if (credentials.project !== projectId) throw new Error("wrong demo project");
  const secret = credentials.operators?.[who]?.totpSecret;
  if (typeof secret !== "string" || !secret)
    throw new Error("demo credential unavailable; run seed");
  return totp(secret, unixSeconds);
}

async function code() {
  const who = process.argv[3];
  if (
    !demoOperators.some((operator) => operator.key === who) ||
    process.argv.length !== 4
  ) {
    throw new Error("unknown demo operator; use code admin|admin2|operator|viewer");
  }
  let credentials;
  try {
    const info = await stat(credentialsPath);
    if (
      (info.mode & 0o077) !== 0 ||
      (process.getuid && info.uid !== process.getuid())
    ) {
      throw new Error("credentials must be owner-readable only");
    }
    credentials = JSON.parse(await readFile(credentialsPath, "utf8"));
  } catch {
    throw new Error("demo credentials unavailable or unsafe; run seed");
  }
  process.stdout.write(`${demoCodeForOperator(credentials, who)}\n`);
}

async function auth(env, route, { method = "GET", token, body } = {}) {
  const response = await fetch(`${env.apiUrl}/auth/v1${route}`, {
    method,
    headers: {
      apikey: token === env.serviceRoleKey ? env.serviceRoleKey : env.anonKey,
      authorization: `Bearer ${token ?? env.anonKey}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
  });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`${method} ${route} → ${response.status}`); // body omitted: it may echo input
    error.status = response.status;
    throw error;
  }
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`unexpected Auth response for ${method} ${route}`);
  }
}

async function ensureOperatorAccount(env, operator, previous) {
  const password = previous?.password ?? randomBytes(18).toString("base64url");
  let user;
  for (let page = 1; page <= 20; page += 1) {
    const users = await auth(env, `/admin/users?per_page=1000&page=${page}`, {
      token: env.serviceRoleKey,
    });
    user = users.users.find((candidate) => candidate.email === operator.email);
    if (user || users.users.length < 1000) break;
    if (page === 20) throw new Error("isolated demo user search exceeded its bound");
  }
  if (!user) {
    user = await auth(env, "/admin/users", {
      method: "POST",
      token: env.serviceRoleKey,
      body: {
        email: operator.email,
        password,
        email_confirm: true,
        user_metadata: { synthetic: true },
      },
    });
  } else {
    await auth(env, `/admin/users/${user.id}`, {
      method: "PUT",
      token: env.serviceRoleKey,
      body: { password },
    });
  }

  // Reuse a verified factor we hold the secret for; otherwise remove every
  // factor and enroll exactly one, so the credentials file is always usable.
  let factors;
  try {
    factors = await auth(env, `/admin/users/${user.id}/factors`, {
      token: env.serviceRoleKey,
    });
  } catch (error) {
    if (error.status !== 404) throw error;
    factors =
      (await auth(env, `/admin/users/${user.id}`, { token: env.serviceRoleKey }))
        .factors ?? [];
  }
  if (!Array.isArray(factors)) throw new Error("unexpected Auth factor response");
  const known = factors.find(
    (factor) => factor.id === previous?.factorId && factor.status === "verified",
  );
  if (known && previous?.totpSecret) {
    return {
      email: operator.email,
      password,
      totpSecret: previous.totpSecret,
      factorId: known.id,
      userId: user.id,
    };
  }
  for (const factor of factors) {
    await auth(env, `/admin/users/${user.id}/factors/${factor.id}`, {
      method: "DELETE",
      token: env.serviceRoleKey,
    });
  }
  const session = await auth(env, "/token?grant_type=password", {
    method: "POST",
    body: { email: operator.email, password },
  });
  try {
    const enrolled = await auth(env, "/factors", {
      method: "POST",
      token: session.access_token,
      body: {
        factor_type: "totp",
        friendly_name: "Demo authenticator",
        issuer: "Atlas Platform Admin (demo)",
      },
    });
    const challenge = await auth(env, `/factors/${enrolled.id}/challenge`, {
      method: "POST",
      token: session.access_token,
      body: {},
    });
    await auth(env, `/factors/${enrolled.id}/verify`, {
      method: "POST",
      token: session.access_token,
      body: { challenge_id: challenge.id, code: totp(enrolled.totp.secret) },
    });
    return {
      email: operator.email,
      password,
      totpSecret: enrolled.totp.secret,
      factorId: enrolled.id,
      userId: user.id,
    };
  } finally {
    await auth(env, "/logout?scope=local", {
      method: "POST",
      token: session.access_token,
    });
  }
}

async function saveCredentials(operators) {
  await mkdir(output, { recursive: true, mode: 0o700 });
  await chmod(output, 0o700);
  const temporary = `${credentialsPath}.${process.pid}.tmp`;
  await writeFile(
    temporary,
    JSON.stringify(
      {
        project: projectId,
        url: "http://localhost:3002",
        note: "Synthetic local demo accounts. Never reuse outside the isolated stack.",
        operators,
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600, flag: "wx" },
  );
  await rename(temporary, credentialsPath);
  await chmod(credentialsPath, 0o600);
}

function isolatedSql(env, input) {
  const options = {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 30_000,
  };
  try {
    return execFileSync(
      "psql",
      [env.dbUrl, "--no-psqlrc", "-v", "ON_ERROR_STOP=1", "-q"],
      options,
    );
  } catch (error) {
    if (error.code !== "ENOENT")
      throw new Error(
        `isolated demo SQL failed: ${error.stderr || "database command failed"}`,
      );
    try {
      return execFileSync(
        "docker",
        [
          "exec",
          "-i",
          `supabase_db_${projectId}`,
          "psql",
          "-U",
          "postgres",
          "-d",
          "postgres",
          "--no-psqlrc",
          "-v",
          "ON_ERROR_STOP=1",
          "-q",
        ],
        options,
      );
    } catch (failure) {
      throw new Error(
        `isolated demo SQL failed: ${failure.stderr || "database command failed"}`,
      );
    }
  }
}

async function seed() {
  await assertIsolated();
  const env = isolatedEnvironment();
  // The base SQL fixture predates GoTrue's non-null token scanners. Repair only
  // its seven explicit synthetic identities, and only after both isolation guards.
  isolatedSql(
    env,
    `update auth.users set
      confirmation_token = coalesce(confirmation_token, ''),
      recovery_token = coalesce(recovery_token, ''),
      email_change_token_new = coalesce(email_change_token_new, ''),
      email_change = coalesce(email_change, ''),
      email_change_token_current = coalesce(email_change_token_current, ''),
      reauthentication_token = coalesce(reauthentication_token, '')
      where email in ('staff-a@example.invalid', 'admin-a@example.invalid',
        'manager-a@example.invalid', 'revoked-a@example.invalid', 'staff-b@example.invalid',
        'multi-tenant@example.invalid', 'no-membership@example.invalid');`,
  );
  let previous = {};
  try {
    previous = JSON.parse(await readFile(credentialsPath, "utf8")).operators ?? {};
  } catch (error) {
    if (error.code !== "ENOENT")
      throw new Error(
        "demo credentials unreadable; refusing to replace enrolled factors",
      );
  }
  const operators = {};
  for (const operator of demoOperators) {
    operators[operator.key] = await ensureOperatorAccount(
      env,
      operator,
      previous[operator.key],
    );
    // Persist progress before SQL so a failed demo transaction does not strand MFA secrets.
    await saveCredentials({ ...previous, ...operators });
  }
  isolatedSql(
    env,
    await readFile(path.join(root, "supabase/demo/platform-admin-demo.sql"), "utf8"),
  );
  await saveCredentials(operators);
  process.stdout.write(
    `Seeded ${demoOperators.length} demo operators and demo data into ${projectId}.\n`,
  );
  process.stdout.write(
    `Credentials: ${path.relative(root, credentialsPath)} (owner-readable only).\n`,
  );
}

export function platformAdminEnvironment(env, port) {
  return {
    NEXT_PUBLIC_SUPABASE_URL: env.apiUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.publishableKey,
    WLBP_RUNTIME_ENV: "local",
    PLATFORM_ADMIN_PORT: port,
    PLATFORM_ADMIN_DIST_DIR:
      port === "3002" ? ".next-platform-admin-local" : `.next-platform-admin-${port}`,
  };
}

export function platformAdminChildEnvironment(env, port, inherited = process.env) {
  const safe = Object.fromEntries(
    Object.entries(inherited).filter(
      ([key]) =>
        !/(?:SERVICE_ROLE|TOKEN|SECRET|PRIVATE_KEY|PASSWORD|DATABASE_URL|DB_URL)/u.test(
          key,
        ),
    ),
  );
  return { ...safe, ...platformAdminEnvironment(env, port) };
}

export function isPlatformAdminCwd(cwd) {
  return path.resolve(cwd) === path.join(root, "apps/platform-admin");
}

function listenerOn(port) {
  try {
    return (
      execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
        encoding: "utf8",
      })
        .trim()
        .split("\n")[0] || null
    );
  } catch {
    return null;
  }
}

function cwdOf(pid) {
  const out = execFileSync("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"], {
    encoding: "utf8",
  });
  return (
    out
      .split("\n")
      .find((line) => line.startsWith("n"))
      ?.slice(1) ?? ""
  );
}

async function serve() {
  await assertIsolated();
  const args = process.argv.slice(3);
  const port = args.includes("--port") ? args[args.indexOf("--port") + 1] : "3002";
  if (!/^\d+$/u.test(port ?? "") || Number(port) < 1024 || Number(port) > 65535)
    throw new Error("invalid local server port");
  const env = isolatedEnvironment();
  const holder = listenerOn(port);
  if (holder) {
    const cwd = cwdOf(holder);
    if (!args.includes("--replace") || !isPlatformAdminCwd(cwd)) {
      throw new Error(
        `port ${port} is held by pid ${holder} (${cwd || "unknown cwd"}); ` +
          "rerun with --replace only if that is this repository's Platform Admin dev server",
      );
    }
    process.kill(Number(holder), "SIGTERM");
    for (let tries = 0; listenerOn(port) && tries < 50; tries += 1)
      await new Promise((r) => setTimeout(r, 200));
    if (listenerOn(port)) throw new Error(`port ${port} did not free up`);
  }
  const childEnv = platformAdminChildEnvironment(env, port);
  const command = [
    "--filter",
    "@wlbp/platform-admin",
    "exec",
    "next",
    "dev",
    "--port",
    port,
  ];
  if (args.includes("--foreground")) {
    const child = spawn("pnpm", command, {
      cwd: root,
      env: childEnv,
      stdio: "inherit",
    });
    child.on("exit", (code) => process.exit(code ?? 0));
    return;
  }
  const log = openSync(path.join(output, "dev.log"), "a");
  const child = spawn("pnpm", command, {
    cwd: root,
    env: childEnv,
    stdio: ["ignore", log, log],
    detached: true,
  });
  closeSync(log);
  child.unref();
  await writeFile(path.join(output, "dev.pid"), `${child.pid}\n`);
  process.stdout.write(
    `Platform Admin starting on http://localhost:${port} against ${projectId} (log: .artifacts/platform-admin/dev.log)\n`,
  );
}

const commands = {
  code,
  seed,
  serve,
  sync,
  async start() {
    await sync();
    supabase(["start"], true);
    const env = isolatedEnvironment();
    process.stdout.write(
      `${projectId} started. API: ${env.apiUrl}; database port: 56522.\n`,
    );
  },
  async replay() {
    await sync();
    await assertIsolated();
    supabase(["db", "reset", "--local"]);
  },
  async test() {
    await sync();
    await assertIsolated();
    supabase(["test", "db", "--local"]);
  },
  async status() {
    await assertIsolated();
    const env = isolatedEnvironment();
    process.stdout.write(
      `${projectId} running. API: ${env.apiUrl}; database port: 56522.\n`,
    );
  },
  async stop() {
    await assertIsolated();
    supabase(["stop"]);
  },
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const command = commands[process.argv[2]];
  if (!command) {
    process.stderr.write(
      `Usage: platform-admin-local.mjs <${Object.keys(commands).join("|")}>\n`,
    );
    process.exit(2);
  }
  await command();
}
