#!/usr/bin/env node
// Issue #11 contention gate. Every case runs against the local database through
// real parallel sessions; nothing here is mocked or simulated. Cases map onto
// docs/engineering-rules.md §8: 1 (single winner), 3 (adjacency), 4 (expiry
// racing creation), 5 (duplicate requests), 8 (multi-resource contention).
import { spawn, spawnSync } from "node:child_process";

const databaseUrl =
  process.env.SUPABASE_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const contenders = Number(process.env.HOLD_CONTENDERS ?? 100);
const hostname = "client.tenant-a.example.invalid";
const tenantId = "a0000000-0000-0000-0000-000000000001";
const locationId = "a5000000-0000-0000-0000-000000000001";
const appointmentServiceId = "a7200000-0000-0000-0000-000000000001";
const resourceServiceId = "c7200000-0000-0000-0000-000000000001";

const results = [];
let failed = false;

function report(ok, description, detail) {
  results.push({ ok, description, detail });
  if (!ok) failed = true;
}

function runSql(sql) {
  const finished = spawnSync(
    "psql",
    [databaseUrl, "-qtAX", "-v", "ON_ERROR_STOP=1", "-c", sql],
    {
      encoding: "utf8",
    },
  );
  if (finished.error) {
    throw new Error(
      `psql is required for the concurrency gate and could not be started: ${finished.error.message}`,
    );
  }
  if (finished.status !== 0) {
    throw new Error(`setup statement failed: ${finished.stderr.trim()}`);
  }
  return finished.stdout.trim();
}

// One session per attempt, all released by the same wall-clock barrier so the
// database sees genuine simultaneity rather than a staggered queue.
function attempt(sql, fireAt) {
  return new Promise((resolve) => {
    const barrier = `select pg_sleep(greatest(0,extract(epoch from ('${fireAt}'::timestamptz-clock_timestamp()))));`;
    const child = spawn(
      "psql",
      [databaseUrl, "-qtAX", "-v", "ON_ERROR_STOP=1", "-c", barrier + sql],
      {
        encoding: "utf8",
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) => {
      const error = /ERROR:\s+(.+)/u.exec(stderr);
      resolve({
        ok: code === 0,
        value: stdout.trim().split("\n").filter(Boolean).at(-1) ?? "",
        error: error ? error[1].trim() : stderr.trim(),
      });
    });
  });
}

function holdCall({ serviceId, slot, session, key }) {
  return `select hold_id from api_v1.create_hold_v1('${hostname}','client','${serviceId}','${locationId}','${slot}'::timestamptz,'${session}','${key}');`;
}

function fireAt(milliseconds = 1500) {
  return new Date(Date.now() + milliseconds).toISOString();
}

function cleanup() {
  runSql(`
    delete from app.assignment_allocations a using app.booking_holds h
      where h.id=a.hold_id and h.tenant_id='${tenantId}';
    delete from app.booking_holds where tenant_id='${tenantId}';
    delete from app.idempotency_keys where tenant_id='${tenantId}';
    delete from app.resource_requirements where tenant_id='${tenantId}' and service_id='${resourceServiceId}';
    delete from app.catalog_service_locations where tenant_id='${tenantId}' and service_id='${resourceServiceId}';
    delete from app.catalog_service_revisions where tenant_id='${tenantId}' and service_id='${resourceServiceId}';
    delete from app.catalog_services where tenant_id='${tenantId}' and id='${resourceServiceId}';
    delete from app.weekly_schedules where tenant_id='${tenantId}' and id::text like 'c8700000%';
    delete from app.schedule_scopes where tenant_id='${tenantId}' and id::text like 'c8600000%';
    delete from app.resource_locations where tenant_id='${tenantId}' and resource_id::text like 'c8500000%';
    delete from app.resources where tenant_id='${tenantId}' and id::text like 'c8500000%';
    delete from app.resource_types where tenant_id='${tenantId}' and id::text like 'c8400000%';
    delete from app.weekly_schedules where tenant_id='${tenantId}' and id::text like 'c8200000%';
    delete from app.schedule_scopes where tenant_id='${tenantId}' and id::text like 'c8100000%';
    delete from app.staff_service_locations where tenant_id='${tenantId}' and staff_id::text like 'c8000000%';
    delete from app.staff_locations where tenant_id='${tenantId}' and staff_id::text like 'c8000000%';
    delete from app.staff_services where tenant_id='${tenantId}' and staff_id::text like 'c8000000%';
    delete from app.staff_profiles where tenant_id='${tenantId}' and id::text like 'c8000000%';
  `);
}

function setup() {
  cleanup();
  runSql(`
    insert into app.staff_profiles(id,tenant_id,public_name)
      values ('c8000000-0000-0000-0000-000000000001','${tenantId}','Contention staff');
    insert into app.staff_services(tenant_id,staff_id,service_id)
      values ('${tenantId}','c8000000-0000-0000-0000-000000000001','${appointmentServiceId}');
    insert into app.staff_locations(tenant_id,staff_id,location_id)
      values ('${tenantId}','c8000000-0000-0000-0000-000000000001','${locationId}');
    insert into app.staff_service_locations(tenant_id,staff_id,service_id,location_id)
      values ('${tenantId}','c8000000-0000-0000-0000-000000000001','${appointmentServiceId}','${locationId}');
    insert into app.schedule_scopes(id,tenant_id,scope_kind,location_id,staff_id,time_zone)
      values ('c8100000-0000-0000-0000-000000000001','${tenantId}','staff','${locationId}','c8000000-0000-0000-0000-000000000001','America/New_York');
    insert into app.weekly_schedules(id,tenant_id,schedule_scope_id,day_of_week,start_minute,end_minute)
      values ('c8200000-0000-0000-0000-000000000001','${tenantId}','c8100000-0000-0000-0000-000000000001',1,540,1020);

    insert into app.catalog_services(id,tenant_id,key,category_id)
      values ('${resourceServiceId}','${tenantId}','contention-room','a7100000-0000-0000-0000-000000000001');
    insert into app.catalog_service_revisions(
      id,tenant_id,service_id,revision,locale,state,name,canonical_path,duration_minutes,
      price_minor,currency,capacity_mode,booking_mode,publication_id,published_at)
      values ('c7210000-0000-0000-0000-000000000001','${tenantId}','${resourceServiceId}',1,'en','published',
        'Contention room','/services/contention-room',45,1000,'SAR','exclusive','exclusive_resource',
        'a7000000-0000-0000-0000-000000000001','2026-09-05 00:00+00');
    insert into app.catalog_service_locations(tenant_id,service_id,location_id)
      values ('${tenantId}','${resourceServiceId}','${locationId}');
    insert into app.resource_types(id,tenant_id,key,name)
      values ('c8400000-0000-0000-0000-000000000001','${tenantId}','contention-room','Contention room');
    insert into app.resources(id,tenant_id,resource_type_id,key,public_name) values
      ('c8500000-0000-0000-0000-000000000001','${tenantId}','c8400000-0000-0000-0000-000000000001','contention-room-one','Room one'),
      ('c8500000-0000-0000-0000-000000000002','${tenantId}','c8400000-0000-0000-0000-000000000001','contention-room-two','Room two');
    insert into app.resource_locations(tenant_id,resource_id,location_id) values
      ('${tenantId}','c8500000-0000-0000-0000-000000000001','${locationId}'),
      ('${tenantId}','c8500000-0000-0000-0000-000000000002','${locationId}');
    insert into app.resource_requirements(tenant_id,service_id,resource_type_id)
      values ('${tenantId}','${resourceServiceId}','c8400000-0000-0000-0000-000000000001');
    insert into app.schedule_scopes(id,tenant_id,scope_kind,location_id,resource_id,time_zone) values
      ('c8600000-0000-0000-0000-000000000001','${tenantId}','resource','${locationId}','c8500000-0000-0000-0000-000000000001','America/New_York'),
      ('c8600000-0000-0000-0000-000000000002','${tenantId}','resource','${locationId}','c8500000-0000-0000-0000-000000000002','America/New_York');
    insert into app.weekly_schedules(id,tenant_id,schedule_scope_id,day_of_week,start_minute,end_minute) values
      ('c8700000-0000-0000-0000-000000000001','${tenantId}','c8600000-0000-0000-0000-000000000001',1,540,1020),
      ('c8700000-0000-0000-0000-000000000002','${tenantId}','c8600000-0000-0000-0000-000000000002',1,540,1020);
  `);
}

function slotAt(clock) {
  // The same derived Monday the pgTAP suites use, so notice and horizon hold
  // whatever day the gate runs on.
  return runSql(
    `select ((date_trunc('week',statement_timestamp() at time zone 'America/New_York')::date+14)+time '${clock}') at time zone 'America/New_York';`,
  );
}

function requireConnectionHeadroom() {
  const headroom = Number(
    runSql(
      "select current_setting('max_connections')::integer - (select count(*) from pg_stat_activity);",
    ),
  );
  if (headroom <= contenders) {
    throw new Error(
      `the gate needs more than ${contenders} spare connections and the database has ${headroom}. Raise max_connections on the local stack or lower HOLD_CONTENDERS.`,
    );
  }
}

async function singleWinner(slot) {
  const at = fireAt();
  const attempts = await Promise.all(
    Array.from({ length: contenders }, (unused, index) =>
      attempt(
        holdCall({
          serviceId: appointmentServiceId,
          slot,
          session: `contention-session-${String(index).padStart(4, "0")}`,
          key: `contention-key-single-${String(index).padStart(4, "0")}`,
        }),
        at,
      ),
    ),
  );
  const winners = attempts.filter((result) => result.ok);
  const losers = attempts.filter((result) => !result.ok);
  report(
    winners.length === 1,
    `${contenders} simultaneous capacity-one attempts produce exactly one allocation`,
    `winners=${winners.length}`,
  );
  report(
    losers.every((result) => result.error === "slot_unavailable"),
    "every losing caller receives the stable slot_unavailable error",
    [...new Set(losers.map((result) => result.error))].join(" | "),
  );
  report(
    runSql(
      `select count(*) from app.assignment_allocations where state='held' and starts_at='${slot}'::timestamptz;`,
    ) === "1",
    "the database holds exactly one allocation for the contended slot",
  );
}

async function adjacency(slot, adjacent) {
  const at = fireAt();
  const attempts = await Promise.all([
    attempt(
      holdCall({
        serviceId: appointmentServiceId,
        slot,
        session: "contention-session-adjacent-a",
        key: "contention-key-adjacent-aaaa",
      }),
      at,
    ),
    attempt(
      holdCall({
        serviceId: appointmentServiceId,
        slot: adjacent,
        session: "contention-session-adjacent-b",
        key: "contention-key-adjacent-bbbb",
      }),
      at,
    ),
  ]);
  report(
    attempts.every((result) => result.ok),
    "adjacent half-open slots requested at the same instant both succeed",
    attempts.map((result) => result.error).join(" | "),
  );
}

async function duplicateRequests(slot) {
  const at = fireAt();
  const call = holdCall({
    serviceId: appointmentServiceId,
    slot,
    session: "contention-session-duplicate",
    key: "contention-key-duplicate-0001",
  });
  const attempts = await Promise.all(
    Array.from({ length: 10 }, () => attempt(call, at)),
  );
  const identifiers = new Set(
    attempts.filter((result) => result.ok).map((result) => result.value),
  );
  report(
    attempts.every((result) => result.ok) && identifiers.size === 1,
    "ten simultaneous identical requests converge on one hold",
    `ok=${attempts.filter((result) => result.ok).length} distinct=${identifiers.size}`,
  );
  report(
    runSql(
      `select count(*) from app.booking_holds where starts_at='${slot}'::timestamptz and state='active';`,
    ) === "1",
    "the duplicate request created exactly one durable hold",
  );
}

async function expiryRace(slot) {
  const holdId = runSql(
    holdCall({
      serviceId: appointmentServiceId,
      slot,
      session: "contention-session-expiry",
      key: "contention-key-expiry-000001",
    }),
  );
  runSql(
    `update app.booking_holds set expires_at=statement_timestamp()-interval '1 second' where id='${holdId}';`,
  );
  const at = fireAt();
  const [job, creation] = await Promise.all([
    attempt("select expired_holds from private.expire_holds_v1();", at),
    attempt(
      holdCall({
        serviceId: appointmentServiceId,
        slot,
        session: "contention-session-expiry-two",
        key: "contention-key-expiry-000002",
      }),
      at,
    ),
  ]);
  report(job.ok, "the expiry job survives a concurrent hold creation", job.error);
  report(
    creation.ok || creation.error === "slot_unavailable",
    "the racing creation ends in exactly one explicit outcome",
    creation.error,
  );
  report(
    runSql(`select state from app.booking_holds where id='${holdId}';`) === "expired",
    "the expired hold releases its capacity exactly once",
  );
  report(
    runSql(
      `select count(*) from app.assignment_allocations where hold_id='${holdId}' and state='held';`,
    ) === "0",
    "no allocation survives its expired hold",
  );
}

async function resourceContention(slot) {
  const at = fireAt();
  const attempts = await Promise.all(
    Array.from({ length: 20 }, (unused, index) =>
      attempt(
        holdCall({
          serviceId: resourceServiceId,
          slot,
          session: `contention-room-session-${String(index).padStart(4, "0")}`,
          key: `contention-key-room-${String(index).padStart(4, "0")}`,
        }),
        at,
      ),
    ),
  );
  const winners = attempts.filter((result) => result.ok);
  report(
    winners.length === 2,
    "two interchangeable resources accept exactly two of twenty simultaneous requests",
    `winners=${winners.length}`,
  );
  report(
    attempts
      .filter((result) => !result.ok)
      .every((result) => result.error === "slot_unavailable"),
    "no caller sees a raw deadlock, serialization failure, or constraint name",
    [
      ...new Set(attempts.filter((result) => !result.ok).map((result) => result.error)),
    ].join(" | "),
  );
}

function noOverlapSurvives() {
  const overlaps = runSql(`
    select count(*) from app.assignment_allocations a
    join app.assignment_allocations b
      on b.tenant_id=a.tenant_id and b.id>a.id and b.occupied_at && a.occupied_at
     and (b.staff_id=a.staff_id or b.resource_id=a.resource_id)
    where a.state in ('held','confirmed') and b.state in ('held','confirmed');
  `);
  report(
    overlaps === "0",
    "no overlapping active allocation survives the whole gate",
    overlaps,
  );
}

async function main() {
  requireConnectionHeadroom();
  setup();
  try {
    await singleWinner(slotAt("10:00"));
    await adjacency(slotAt("11:00"), slotAt("11:45"));
    await duplicateRequests(slotAt("13:00"));
    await expiryRace(slotAt("14:00"));
    await resourceContention(slotAt("15:00"));
    noOverlapSurvives();
  } finally {
    cleanup();
  }

  process.stdout.write(`TAP version 13\n1..${results.length}\n`);
  results.forEach((result, index) => {
    process.stdout.write(
      `${result.ok ? "ok" : "not ok"} ${index + 1} - ${result.description}${
        result.ok || !result.detail ? "" : `\n# ${result.detail}`
      }\n`,
    );
  });
  if (failed) process.exitCode = 1;
}

await main();
