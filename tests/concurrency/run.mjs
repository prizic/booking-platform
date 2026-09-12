#!/usr/bin/env node
// Issue #11 contention gate, extended by issue #17. Every case runs against the
// local database through real parallel sessions; nothing here is mocked or
// simulated. Cases map onto docs/engineering-rules.md §8: 1 (single winner),
// 3 (adjacency), 4 (expiry racing creation), 5 (duplicate requests),
// 8 (multi-resource contention), plus concurrent staff lifecycle edits.
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
// The lifecycle fixture is deliberately kept out of cleanup(): a committed
// booking can never be deleted (invariant 5), so the gate reuses the same one
// and returns it to `confirmed` through the product's own correction path.
const lifecycleStaffId = "c9000000-0000-0000-0000-000000000001";
const adminClaims =
  '{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}';
const lifecycleContenders = Math.min(contenders, 20);
// Issue #30. Provisioning workers are horizontally scaled by design, so "two of
// them wake up at the same moment" is the ordinary case rather than the edge.
const provisioningInstanceId = "a4200000-0000-0000-0000-00000000f001";
const operatorId = "a1000000-0000-0000-0000-000000000002";
const operatorClaims = `{"sub":"${operatorId}","role":"authenticated","aal":"aal2"}`;

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
    -- A committed booking is append-only and undeletable by design (invariant 5),
    -- which is exactly right in production and exactly wrong for a gate that must
    -- leave no trace. Replica mode is the local-only escape hatch, held for these
    -- statements alone, so every other suite still starts from the seeded state.
    set local session_replication_role = 'replica';
    delete from app.booking_events where tenant_id='${tenantId}';
    delete from app.booking_notes where tenant_id='${tenantId}';
    delete from app.booking_contacts where tenant_id='${tenantId}';
    delete from app.booking_intake_answers where tenant_id='${tenantId}';
    delete from app.outbox_events where tenant_id='${tenantId}';
    delete from app.bookings where tenant_id='${tenantId}';
    delete from app.payment_webhook_events where tenant_id='${tenantId}';
    delete from app.commerce_ledger_entries where tenant_id='${tenantId}';
    delete from app.payment_refunds where tenant_id='${tenantId}';
    delete from app.payment_charges where tenant_id='${tenantId}';
    delete from app.payment_price_snapshots where tenant_id='${tenantId}';
    delete from app.payment_attempts where tenant_id='${tenantId}';
    delete from app.booking_drafts where tenant_id='${tenantId}';
    delete from app.provider_object_mappings where tenant_id='${tenantId}';
    delete from app.payment_accounts where tenant_id='${tenantId}' and id='e9000000-0000-0000-0000-00000000cccc';
    delete from app.privacy_request_steps where tenant_id='${tenantId}';
    delete from app.privacy_requests where tenant_id='${tenantId}';
    delete from app.legal_holds where tenant_id='${tenantId}';
    delete from app.customer_consents where tenant_id='${tenantId}';
    delete from app.notification_suppressions where tenant_id='${tenantId}';
    delete from app.customers where tenant_id='${tenantId}';
    set local session_replication_role = 'origin';

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
    delete from app.weekly_schedules where tenant_id='${tenantId}' and id::text like 'c9200000%';
    delete from app.schedule_scopes where tenant_id='${tenantId}' and id::text like 'c9100000%';
    delete from app.staff_service_locations where tenant_id='${tenantId}' and staff_id::text like 'c9000000%';
    delete from app.staff_locations where tenant_id='${tenantId}' and staff_id::text like 'c9000000%';
    delete from app.staff_services where tenant_id='${tenantId}' and staff_id::text like 'c9000000%';
    delete from app.staff_profiles where tenant_id='${tenantId}' and id::text like 'c9000000%';

    -- The provisioning timeline and the operator audit are append-only for the
    -- same reason bookings are, and cleared the same local-only way.
    set local session_replication_role = 'replica';
    delete from control_plane.provisioning_events e using control_plane.provisioning_runs r
      where r.id=e.run_id and r.instance_id='${provisioningInstanceId}';
    delete from control_plane.audit_events where instance_id='${provisioningInstanceId}';
    set local session_replication_role = 'origin';
    delete from control_plane.provisioning_steps s using control_plane.provisioning_runs r
      where r.id=s.run_id and r.instance_id='${provisioningInstanceId}';
    delete from control_plane.provisioning_runs where instance_id='${provisioningInstanceId}';
    delete from control_plane.instance_release_state where instance_id='${provisioningInstanceId}';
    delete from control_plane.instance_infrastructure where instance_id='${provisioningInstanceId}';
    delete from control_plane.jobs where instance_id='${provisioningInstanceId}';
    delete from app.instances where id='${provisioningInstanceId}';
    delete from control_plane.operators where auth_user_id='${operatorId}';

    set local session_replication_role = 'replica';
    delete from control_plane.usage_events where tenant_id='${tenantId}';
    set local session_replication_role = 'origin';
    delete from control_plane.invoice_lines l using control_plane.invoices i
      where i.id=l.invoice_id and i.tenant_id='${tenantId}';
    delete from control_plane.billing_credits where tenant_id='${tenantId}';
    delete from control_plane.invoices where tenant_id='${tenantId}';
    delete from control_plane.usage_counters where tenant_id='${tenantId}';
    delete from control_plane.tenant_restrictions where tenant_id='${tenantId}';
    delete from control_plane.subscriptions where tenant_id='${tenantId}';
    delete from control_plane.billing_accounts where tenant_id='${tenantId}';
    delete from app.tenant_quotas where tenant_id='${tenantId}';
  `);
}

// Issue #37. Billing runs on a schedule, and a schedule that fires on two
// workers is the ordinary way a tenant gets invoiced twice for one month.
async function concurrentInvoiceIssue() {
  runSql(`
    insert into control_plane.operators(auth_user_id,email,role)
    values ('${operatorId}','billing-gate@example.invalid','operator')
    on conflict (auth_user_id) do update set role='operator', disabled_at=null;
  `);
  runSql(`
    select set_config('request.jwt.claims','${operatorClaims}',false);
    select * from control_plane.change_plan_v1('${tenantId}','launch',1,
      '2026-03-01T00:00:00Z'::timestamptz,'2026-04-01T00:00:00Z'::timestamptz);
  `);

  const at = fireAt();
  const attempts = await Promise.all(
    Array.from({ length: lifecycleContenders }, () =>
      attempt(
        `select replayed from control_plane.issue_invoice_v1('${tenantId}',
           '2026-03-01T00:00:00Z'::timestamptz,'2026-04-01T00:00:00Z'::timestamptz);`,
        at,
      ),
    ),
  );
  const firstWriters = attempts.filter((result) => result.ok && result.value === "f");
  report(
    firstWriters.length === 1,
    `${lifecycleContenders} billing workers firing at once issue exactly one invoice`,
    attempts.map((result) => (result.ok ? result.value : result.error)).join(" | "),
  );
  const invoices = runSql(
    `select count(*) from control_plane.invoices where tenant_id='${tenantId}';`,
  );
  report(
    invoices === "1",
    "and the tenant is billed once for the month, not once per worker",
    invoices,
  );
}

// Two workers that wake at the same instant must not call the same provider
// twice, and a provider that answers both must not produce two resources. The
// first half of this case is the claim; the second is the answer.
async function concurrentProvisioningStep() {
  runSql(`
    insert into control_plane.operators(auth_user_id,email,role)
    values ('${operatorId}','provisioning-gate@example.invalid','operator');
    insert into app.instances(id,tenant_id,brand_id,published_brand_revision_id,deployment_state)
    values ('${provisioningInstanceId}','${tenantId}','a4000000-0000-0000-0000-000000000001',
      null,'provisioning');
    insert into control_plane.instance_infrastructure(
      tenant_id,instance_id,provider,resource_kind,external_id)
    values ('${tenantId}','${provisioningInstanceId}','github','app_installation','install-gate');
  `);
  const runId = runSql(`
    select set_config('request.jwt.claims','${operatorClaims}',false);
    select run_id from control_plane.request_provisioning_v1(
      '${tenantId}','${provisioningInstanceId}','contention-gate','launch','0.1.0',3,1,1,
      '{"default_locale":"en","timezone":"UTC","currency":"SAR"}'::jsonb,'gate-idem-key');
  `)
    .split("\n")
    .at(-1)
    .trim();

  const at = fireAt();
  const claims = await Promise.all(
    Array.from({ length: lifecycleContenders }, () =>
      attempt(
        `select step_key from control_plane.claim_provisioning_step_v1('${runId}'::uuid);`,
        at,
      ),
    ),
  );
  const claimed = claims.filter((result) => result.ok && result.value !== "");
  report(
    claimed.length === 1 && claimed[0].value === "validate_request",
    `${lifecycleContenders} workers racing for the first step: exactly one claims it`,
    claims
      .map((result) => (result.ok ? result.value || "-" : result.error))
      .join(" | "),
  );
  const attempted = runSql(
    `select attempts from control_plane.provisioning_steps s
     where s.run_id='${runId}'::uuid and s.step_key='validate_request';`,
  );
  report(
    attempted === "1",
    "and the step counts one attempt, so the provider is called once rather than once per worker",
    attempted,
  );

  // Now every worker reports the same success at the same moment, which is what
  // a retry storm after a provider timeout actually looks like.
  const stepId = runSql(
    `select id from control_plane.provisioning_steps
     where run_id='${runId}'::uuid and step_key='validate_request';`,
  );
  const answerAt = fireAt();
  const answers = await Promise.all(
    Array.from({ length: lifecycleContenders }, () =>
      attempt(
        `select duplicate from control_plane.complete_provisioning_step_v1(
           '${stepId}'::uuid,'succeeded');`,
        answerAt,
      ),
    ),
  );
  const firstWriters = answers.filter((result) => result.ok && result.value === "f");
  report(
    firstWriters.length === 1,
    "simultaneous success reports settle to exactly one first writer; the rest are duplicates",
    answers.map((result) => (result.ok ? result.value : result.error)).join(" | "),
  );
  const succeeded = runSql(
    `select count(*) from control_plane.provisioning_events e
     where e.run_id='${runId}'::uuid and e.event='succeeded';`,
  );
  report(
    succeeded === "1",
    "and the timeline records the step succeeding once, not once per session",
    succeeded,
  );
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

    insert into app.staff_profiles(id,tenant_id,public_name)
      values ('${lifecycleStaffId}','${tenantId}','Lifecycle staff');
    insert into app.staff_services(tenant_id,staff_id,service_id)
      values ('${tenantId}','${lifecycleStaffId}','${appointmentServiceId}');
    insert into app.staff_locations(tenant_id,staff_id,location_id)
      values ('${tenantId}','${lifecycleStaffId}','${locationId}');
    insert into app.staff_service_locations(tenant_id,staff_id,service_id,location_id)
      values ('${tenantId}','${lifecycleStaffId}','${appointmentServiceId}','${locationId}');
    insert into app.schedule_scopes(id,tenant_id,scope_kind,location_id,staff_id,time_zone)
      values ('c9100000-0000-0000-0000-000000000001','${tenantId}','staff','${locationId}','${lifecycleStaffId}','America/New_York');
    -- 16:00-18:00 local only, so the permanent lifecycle staff is never a second
    -- eligible winner in the capacity cases that contend for the morning.
    insert into app.weekly_schedules(id,tenant_id,schedule_scope_id,day_of_week,start_minute,end_minute)
      values ('c9200000-0000-0000-0000-000000000001','${tenantId}','c9100000-0000-0000-0000-000000000001',1,960,1080);
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

// A member session. The lifecycle RPCs re-read authority from the JWT claims,
// so the contenders must arrive as the member they claim to be, not as the
// superuser psql connects with.
// psql prints only the last statement of a multi-statement `-c` string, so the
// call under test is always last and the transaction is left implicit.
function asMember(sql) {
  return `select set_config('request.jwt.claims','${adminClaims}',true); set local role authenticated; ${sql}`;
}

// One real booking, made through the ordinary customer path and pinned to the
// lifecycle staff member so it never competes with the capacity cases.
function lifecycleBooking(slot) {
  const hold = runSql(
    `select hold_id from api_v1.create_hold_v1('${hostname}','client','${appointmentServiceId}',
      '${locationId}','${slot}'::timestamptz,'lifecycle-session-0001','lifecycle-hold-key-0001',
      '${lifecycleStaffId}');`,
  );
  return runSql(
    `select booking_id from api_v1.confirm_booking_v1('${hostname}','client','${hold}',
      'lifecycle-session-0001','lifecycle-confirm-key-0001',
      '{"fullName":"Lifecycle Guest","email":"lifecycle@example.invalid"}'::jsonb,
      '1','en','{}'::jsonb,'America/New_York');`,
  );
}

function restoreConfirmed(bookingId) {
  const status = runSql(
    `select status from app.bookings where id='${bookingId}'::uuid;`,
  );
  if (status === "confirmed") return;
  const revision = runSql(
    `select revision from app.bookings where id='${bookingId}'::uuid;`,
  );
  // The teardown uses the product's own correction path, so the gate never
  // reaches around the state machine it is testing.
  runSql(
    asMember(
      `select status from api_v1.transition_booking_v1('${tenantId}','${bookingId}'::uuid,
        'correct',${revision},'Concurrency gate reset.');`,
    ),
  );
}

async function concurrentStaffEdit(bookingId) {
  restoreConfirmed(bookingId);
  const revision = Number(
    runSql(`select revision from app.bookings where id='${bookingId}'::uuid;`),
  );
  const at = fireAt();
  const attempts = await Promise.all(
    Array.from({ length: lifecycleContenders }, () =>
      attempt(
        asMember(
          `select status from api_v1.transition_booking_v1('${tenantId}','${bookingId}'::uuid,
            'check_in',${revision});`,
        ),
        at,
      ),
    ),
  );
  const winners = attempts.filter((result) => result.ok);
  report(
    winners.length === 1,
    `${lifecycleContenders} staff checking the same appointment in at once produce one transition`,
    `${winners.length} winners`,
  );
  report(
    attempts
      .filter((result) => !result.ok)
      .every((result) => result.error === "revision_conflict"),
    "every losing staff session receives the stable revision_conflict error",
    [
      ...new Set(attempts.filter((result) => !result.ok).map((result) => result.error)),
    ].join(" | "),
  );
  const settled = runSql(
    `select status||':'||revision from app.bookings where id='${bookingId}'::uuid;`,
  );
  report(
    settled === `checked_in:${revision + 1}`,
    "the booking advances exactly one revision, so no losing edit left a partial effect",
    settled,
  );
  const events = runSql(
    `select count(*) from app.booking_events
     where booking_id='${bookingId}'::uuid and event_type='booking_checked_in'
       and booking_revision=${revision + 1};`,
  );
  report(events === "1", "the ledger records exactly one check-in", events);
  restoreConfirmed(bookingId);
}

/**
 * Two operators reaching for the same person's erasure at the same instant. The
 * partial unique index on live requests is what makes this one job; without it
 * the second caller would open a second deletion and the two would race over
 * the same rows.
 */
async function concurrentPrivacyRequest(bookingId) {
  const customerId = runSql(
    `select customer_id from app.booking_contacts where booking_id='${bookingId}'::uuid;`,
  );
  const at = fireAt();
  const attempts = await Promise.all(
    Array.from({ length: lifecycleContenders }, () =>
      attempt(
        asMember(
          `select api_v1.open_privacy_request_v1('${tenantId}','${customerId}'::uuid,'deletion');`,
        ),
        at,
      ),
    ),
  );
  const opened = new Set(attempts.filter((result) => result.ok).map((r) => r.value));
  report(
    opened.size === 1,
    `${lifecycleContenders} simultaneous erasure requests open exactly one job`,
    [...opened].join(" | "),
  );
  const rows = runSql(
    `select count(*) from app.privacy_requests
     where customer_id='${customerId}'::uuid and kind='deletion';`,
  );
  report(rows === "1", "the database holds exactly one deletion request", rows);

  // Running it from every session at once has to erase once, not N times: the
  // row lock plus the already-succeeded step check is what settles it.
  const runAt = fireAt();
  const runs = await Promise.all(
    Array.from({ length: lifecycleContenders }, () =>
      attempt(
        asMember(
          `select status from api_v1.run_privacy_request_v1('${tenantId}','${[...opened][0]}'::uuid);`,
        ),
        runAt,
      ),
    ),
  );
  report(
    runs.filter((result) => result.ok).every((result) => result.value === "completed"),
    "every session that ran the job sees the same settled outcome",
    [...new Set(runs.map((result) => (result.ok ? result.value : result.error)))].join(
      " | ",
    ),
  );
  const attemptsMax = runSql(
    `select max(attempts) from app.privacy_request_steps
     where request_id='${[...opened][0]}'::uuid;`,
  );
  report(
    attemptsMax === "1",
    "and no subsystem step was attempted twice, so the erasure ran exactly once",
    attemptsMax,
  );
}

/**
 * Issue #22. The money case: one verified payment, delivered to every session at
 * once, must produce one charge, one ledger entry and one booking. A provider
 * retries aggressively and a platform that settles twice has both double-booked
 * its capacity and double-counted its revenue.
 */
async function concurrentSettlement(at) {
  const session = "session-token-settle-000001";
  runSql(`update app.catalog_service_revisions set payment_mode='full'
    where tenant_id='${tenantId}' and service_id='${appointmentServiceId}';`);
  runSql(`insert into app.payment_accounts(
      id,tenant_id,provider,provider_account_reference,status,charges_enabled,payouts_enabled)
    values ('e9000000-0000-0000-0000-00000000cccc','${tenantId}','stripe','acct_gate','connected',true,true)
    on conflict do nothing;`);

  const holdId = runSql(
    `select h.hold_id from api_v1.create_hold_v1('${hostname}','client',
      '${appointmentServiceId}','${locationId}','${at}'::timestamptz,
      '${session}','idempotency-settle-00001') h;`,
  );
  const attemptId = runSql(
    `select c.payment_attempt_id from api_v1.begin_checkout_v1('${hostname}','client',
      '${holdId}'::uuid,'${session}','idempotency-settle-00002',
      '{"fullName":"Settle Guest","email":"settle@example.invalid"}'::jsonb,'1') c;`,
  );
  runSql(`select * from api_v1.attach_checkout_reference_v1('${tenantId}',
    '${attemptId}'::uuid,'cs_gate_settle');`);

  // The same provider event, delivered to every session simultaneously.
  const deliverAt = fireAt();
  const attempts = await Promise.all(
    Array.from({ length: lifecycleContenders }, () =>
      attempt(
        `select outcome from api_v1.record_payment_event_v1('${tenantId}','stripe',
          'evt_gate_settle','checkout.session.completed','cs_gate_settle','succeeded',
          null,null,'ch_gate_settle');`,
        deliverAt,
      ),
    ),
  );

  const confirmed = attempts.filter((r) => r.ok && r.value === "confirmed");
  report(
    confirmed.length === 1,
    `${lifecycleContenders} simultaneous deliveries of one payment confirm exactly one booking`,
    [...new Set(attempts.map((r) => (r.ok ? r.value : r.error)))].join(" | "),
  );
  const bookings = runSql(
    `select count(*) from app.bookings where hold_id='${holdId}'::uuid;`,
  );
  report(
    bookings === "1",
    "the database holds exactly one booking for that hold",
    bookings,
  );
  const charges = runSql(
    `select count(*) from app.payment_charges where tenant_id='${tenantId}';`,
  );
  report(
    charges === "1",
    "and exactly one charge, so the customer is billed once",
    charges,
  );
  const ledger = runSql(
    `select count(*) from app.commerce_ledger_entries
     where tenant_id='${tenantId}' and entry_type='charge';`,
  );
  report(ledger === "1", "and exactly one entry reaches the financial ledger", ledger);
  const allocations = runSql(
    `select count(*) from app.assignment_allocations
     where hold_id='${holdId}'::uuid and state='confirmed';`,
  );
  report(
    allocations === "1",
    "and exactly one allocation, so a retried webhook never double-books capacity",
    allocations,
  );

  runSql(`update app.catalog_service_revisions set payment_mode='none'
    where tenant_id='${tenantId}' and service_id='${appointmentServiceId}';`);
  return holdId;
}

async function duplicateStaffAction(bookingId) {
  restoreConfirmed(bookingId);
  const revision = Number(
    runSql(`select revision from app.bookings where id='${bookingId}'::uuid;`),
  );
  const key = `lifecycle-duplicate-${revision}-key`;
  const at = fireAt();
  const attempts = await Promise.all(
    Array.from({ length: lifecycleContenders }, () =>
      attempt(
        asMember(
          `select status from api_v1.transition_booking_v1('${tenantId}','${bookingId}'::uuid,
            'check_in',${revision},null,null,'${key}');`,
        ),
        at,
      ),
    ),
  );
  report(
    attempts.every((result) => result.ok && result.value === "checked_in"),
    "a duplicated staff action under one key answers every caller with the same settled result",
    [
      ...new Set(attempts.map((result) => (result.ok ? result.value : result.error))),
    ].join(" | "),
  );
  const events = runSql(
    `select count(*) from app.booking_events
     where booking_id='${bookingId}'::uuid and event_type='booking_checked_in'
       and booking_revision=${revision + 1};`,
  );
  report(
    events === "1",
    "the duplicated action appended exactly one ledger entry",
    events,
  );
  restoreConfirmed(bookingId);
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
    const lifecycleId = lifecycleBooking(slotAt("16:00"));
    await concurrentStaffEdit(lifecycleId);
    await duplicateStaffAction(lifecycleId);
    await concurrentPrivacyRequest(lifecycleId);
    await concurrentSettlement(slotAt("09:00"));
    await concurrentProvisioningStep();
    await concurrentInvoiceIssue();
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
