// Parent-only isolated local gate. Never run against a retained stack.
// These synthetic tenants/audits are retained in the disposable verification DB.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import test from "node:test";

function connection() {
  if (process.env.BOOKING_RECOVERY_TEST_ISOLATED !== "1")
    throw new Error("isolated_database_required");
  let parsed;
  try {
    parsed = new URL(process.env.SUPABASE_DB_URL);
  } catch {
    throw new Error("local_database_url_required");
  }
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) ||
    [...parsed.searchParams.keys()].some(
      (key) => !["sslmode", "connect_timeout"].includes(key),
    )
  )
    throw new Error("local_database_required");
  return parsed.toString();
}

function sql(statement) {
  return new Promise((resolve, reject) => {
    // Keep connection material off argv and all diagnostics. Only fixed failure
    // codes escape this boundary; neither psql statements nor stderr are logged.
    const env = { ...process.env, PGDATABASE: connection(), PGCONNECT_TIMEOUT: "5" };
    delete env.PGHOSTADDR;
    delete env.PGSERVICE;
    delete env.PGSERVICEFILE;
    const child = spawn("psql", ["-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"], {
      env,
      timeout: 30000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.resume();
    child.on("error", () => reject(new Error("psql_unavailable")));
    child.on("close", (code) =>
      code === 0 ? resolve(output.trim()) : reject(new Error("psql_failed")),
    );
    child.stdin.on("error", () => {});
    child.stdin.end(statement);
  });
}

async function fixture() {
  const tenant = randomUUID(),
    brand = randomUUID(),
    revision = randomUUID(),
    instance = randomUUID();
  const host = `recovery-${tenant}.example.invalid`;
  await sql(`begin;
    insert into app.tenants(id,name) values('${tenant}','Recovery concurrency fixture');
    insert into app.brands(id,tenant_id,key) values('${brand}','${tenant}','recovery');
    insert into app.brand_revisions(id,tenant_id,brand_id,revision,state,config_version,published_at,config,content,content_hash)
      select '${revision}','${tenant}','${brand}',1,'published',1,statement_timestamp(),r.config,r.content,r.content_hash
      from app.instances i join app.brand_revisions r on r.tenant_id=i.tenant_id and r.id=i.published_brand_revision_id
      where i.id='a4200000-0000-0000-0000-000000000001';
    insert into app.instances(id,tenant_id,brand_id,published_brand_revision_id,deployment_state)
      values('${instance}','${tenant}','${brand}','${revision}','active');
    insert into app.tenant_settings(tenant_id) values('${tenant}');
    insert into app.tenant_domains(id,tenant_id,instance_id,hostname,application,kind,verification_status,verified_at,active)
      values('${randomUUID()}','${tenant}','${instance}','${host}','client','production','verified',statement_timestamp(),true);
    commit;`);
  assert.equal(
    await sql(
      `select count(*) from api_v1.resolve_public_tenant_v1('${host}','client');`,
    ),
    "1",
    "synthetic verified client route must resolve before contention",
  );
  return { tenant, host };
}

async function counts(tenant) {
  return JSON.parse(
    await sql(`select jsonb_build_object(
    'requests',(select count(*) from app.booking_recovery_requests where tenant_id='${tenant}'),
    'audits',(select count(*) from app.management_access_events where tenant_id='${tenant}' and action='recovery_requested'),
    'pii',(select count(*) from app.booking_recovery_requests q where tenant_id='${tenant}' and to_jsonb(q)::text like '%@%')
      +(select count(*) from app.management_access_events e where tenant_id='${tenant}' and action='recovery_requested' and to_jsonb(e)::text like '%@%'));`),
  );
}

async function contend({ host, workers, perWorker, sameEmail, sameIp, request }) {
  // Separate psql backends synchronize on a wall-clock barrier. Each call has
  // its own committed transaction, so waiters must see prior admissions.
  const barrier = new Date(Date.now() + 2000).toISOString();
  await Promise.all(
    Array.from({ length: workers }, (_, worker) =>
      sql(`
    select pg_sleep(greatest(0,extract(epoch from ('${barrier}'::timestamptz-clock_timestamp()))));
    ${Array.from({ length: perWorker }, (_, attempt) => {
      const address = sameEmail
        ? "shared@example.invalid"
        : `worker-${worker}-${attempt}@example.invalid`;
      const ip = sameIp
        ? "198.51.100.1"
        : `198.51.100.${worker * perWorker + attempt + 1}`;
      return `begin;
        set local role anon;
        select set_config('request.headers','{"x-forwarded-for":"${ip}"}',true);
        do $check$ begin
          if api_v1.request_booking_recovery_v1('${host}','client','${address}','${request ?? randomUUID()}')
             is distinct from '{"contractVersion":1,"outcome":"accepted"}'::jsonb then
            raise exception 'nonuniform_acknowledgment';
          end if;
        end $check$;
        commit;`;
    }).join("\n")}`),
    ),
  );
}

for (const scenario of [
  {
    title: "email",
    workers: 8,
    perWorker: 2,
    sameEmail: true,
    sameIp: false,
    expected: 3,
  },
  {
    title: "IP",
    workers: 8,
    perWorker: 5,
    sameEmail: false,
    sameIp: true,
    expected: 20,
  },
  {
    title: "tenant",
    workers: 12,
    perWorker: 10,
    sameEmail: false,
    sameIp: false,
    expected: 100,
  },
  {
    title: "same UUID replay",
    workers: 8,
    perWorker: 5,
    sameEmail: true,
    sameIp: true,
    expected: 1,
  },
]) {
  test(`B3 concurrent ${scenario.title} requests cap durable queue and audit state`, async () => {
    const started = performance.now();
    const { tenant, host } = await fixture();
    const request = scenario.title === "same UUID replay" ? randomUUID() : undefined;
    await contend({ ...scenario, host, request });
    assert.deepEqual(await counts(tenant), {
      requests: scenario.expected,
      audits: scenario.expected,
      pii: 0,
    });
    // Exhausted/replayed submissions, including new UUIDs, must still expose the
    // same response without growing persistence. Never run existence matching.
    await contend({ ...scenario, host, request });
    assert.deepEqual(await counts(tenant), {
      requests: scenario.expected,
      audits: scenario.expected,
      pii: 0,
    });
    console.info(
      JSON.stringify({
        spec: `B3 recovery ${scenario.title}`,
        wallClockMs: Math.round(performance.now() - started),
        workers: scenario.workers,
        perWorker: scenario.perWorker,
        outcome: "passed",
      }),
    );
  });
}
