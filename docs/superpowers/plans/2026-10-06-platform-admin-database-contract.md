# Platform Admin Completion — Part A: Database Contract

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Master plan and Global Constraints: [`2026-10-06-platform-admin-completion.md`](2026-10-06-platform-admin-completion.md) — every task here implicitly includes them.

**Goal:** Extend the private control plane with the reads, mutations, worker boundaries and tables Platform Admin needs, each behind `require_operator_v1` and exposed only through same-named `api_v1` definer pass-throughs.

**Architecture:** Six forward-only migrations, one per functional area, each with a pgTAP file that proves: tenant sessions and non-operators are refused, viewers cannot mutate, aal1 is refused, step-up is enforced where required, validation and concurrency failures return stable codes, idempotent replays return the first result, and every success and failure leaves an audit row.

**Tech Stack:** PostgreSQL 17 (Supabase local), plpgsql, pgTAP, Supabase CLI 2.116.

## Conventions used by every SQL task

- Run every database command against the isolated stack: `export WLBP_SUPABASE_WORKDIR="$PWD/.artifacts/platform-admin/isolated"` in the shell first; Task 1's script refuses any other workdir.
- Table-returning plpgsql functions start with `#variable_conflict use_column` and alias every table, because their result column names (`tenant_id`, `status` …) collide with table columns.
- List functions clamp `p_limit` to `1..100` and `p_offset` to `>= 0`, and return `total_count bigint` from `count(*) over ()`.
- Search uses `pg_catalog.strpos(lower(x), lower(p_search)) > 0` (no `LIKE`, so `%`/`_` in user input are literal).
- pgTAP files wrap everything in `begin; select no_plan(); … select * from finish(); rollback;` and grant the temp schema to `authenticated` so `pg_temp` helpers can run under `set local role authenticated`.

The shared pgTAP helper block (repeat verbatim at the top of each `platform_admin_*_test.sql`; pgTAP files cannot import each other):

```sql
do $$ begin
  execute format('grant usage on schema %I to authenticated',pg_my_temp_schema()::regnamespace::text);
end $$;

-- A real auth user, so MFA-factor and email lookups behave as in production.
create function pg_temp.user(p_id uuid, p_email text) returns uuid
language sql as $$
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,
    email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values ('00000000-0000-0000-0000-000000000000',p_id,'authenticated','authenticated',
    p_email,'',now(),'{}','{}',now(),now())
  on conflict (id) do nothing;
  select p_id;
$$;

create function pg_temp.verified_factor(p_user uuid) returns void
language sql as $$
  insert into auth.mfa_factors(id,user_id,friendly_name,factor_type,status,created_at,updated_at)
  values (gen_random_uuid(),p_user,'test-'||gen_random_uuid(),'totp','verified',now(),now());
$$;

-- Lists the user, then becomes them with aal2 and a TOTP verification p_age seconds ago.
create function pg_temp.as_operator(p_user uuid, p_role text, p_age integer default 60) returns void
language plpgsql as $$
begin
  perform pg_temp.user(p_user, 'op-'||p_user::text||'@example.invalid');
  insert into control_plane.operators(auth_user_id,email,role,expires_at)
  values (p_user,'op-'||p_user::text||'@example.invalid',p_role,
    case when p_role='break_glass' then now()+interval '1 hour' end)
  on conflict (auth_user_id) do update
    set role=excluded.role, expires_at=excluded.expires_at, disabled_at=null;
  perform pg_temp.claims(p_user,'aal2',p_age);
end $$;

create function pg_temp.claims(p_user uuid, p_aal text, p_age integer default 60) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub',p_user,'role','authenticated','aal',p_aal,
    'amr',jsonb_build_array(jsonb_build_object('method','totp',
      'timestamp',extract(epoch from statement_timestamp())::bigint - p_age)))::text, true);
$$;

create function pg_temp.as_worker() returns void
language sql as $$ select set_config('request.jwt.claims',null,true); $$;
```

Fixed test identities (used across files):

| UUID | Meaning |
| --- | --- |
| `c0000000-0000-0000-0000-00000000000a` | admin A |
| `c0000000-0000-0000-0000-00000000000b` | admin B (second operator for two-person rules) |
| `c0000000-0000-0000-0000-00000000000c` | operator |
| `c0000000-0000-0000-0000-00000000000d` | viewer |
| `c0000000-0000-0000-0000-00000000000e` | signed-in, not an operator (tenant-style session) |

---

### Task 1: Isolated local stack for Platform Admin

**Files:**
- Create: `scripts/platform-admin-local.mjs`
- Create: `scripts/platform-admin-local.test.mjs`
- Modify: `package.json` (`test:config` list only)

**Interfaces:**
- Produces: `node scripts/platform-admin-local.mjs <sync|start|replay|test|status|stop>`; exports `isolateConfig(text): string`, `workdir`, `projectId = "platform-admin-20261006"`. Part C adds `seed` and `serve`.

- [ ] **Step 1: Confirm the environment before touching anything**

Run:
```bash
rtk lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(5432[0-9]|5532[0-9]|5652[0-9]|8093) '
rtk docker ps --format '{{.Names}} {{.Ports}}' | grep -E 'supabase|maslak'
grep -n "^\[analytics\]" -A3 supabase/config.toml; grep -nE "port *= *543" supabase/config.toml
```
Expected: 54321 owned by `maslak_dashboard-*`, 553xx owned by `dashboard-completion-20261005`, nothing on 565xx/8093. Record the output in `.artifacts/platform-admin/environment.txt`. If anything already listens on 565xx, stop and pick 566xx by changing `"565$1"` below.

- [ ] **Step 2: Write the failing test**

`scripts/platform-admin-local.test.mjs`:
```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { isolateConfig, projectId } from "./platform-admin-local.mjs";

const sample = `project_id = "white-label-booking-platform"
[api]
port = 54321
[db]
port = 54322
shadow_port = 54320
[inbucket]
port = 54324
[edge_runtime]
inspector_port = 8083
`;

test("isolates project id and every 543xx port", () => {
  const out = isolateConfig(sample);
  assert.match(out, new RegExp(`project_id = "${projectId}"`));
  assert.doesNotMatch(out, /543\d\d/u);
  assert.match(out, /port = 56521/u);
  assert.match(out, /shadow_port = 56520/u);
  assert.match(out, /inspector_port = 8093/u);
});

test("disables analytics so it cannot collide with other stacks", () => {
  assert.match(isolateConfig(sample), /\[analytics\]\nenabled = false/u);
  const withSection = sample + "[analytics]\nenabled = true\nport = 54327\n";
  const out = isolateConfig(withSection);
  assert.match(out, /\[analytics\]\nenabled = false/u);
  assert.equal(out.match(/\[analytics\]/gu).length, 1);
});

test("refuses a config that is not this repository's", () => {
  assert.throws(() => isolateConfig('project_id = "maslak_dashboard"'), /unexpected/u);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `rtk node --test scripts/platform-admin-local.test.mjs`
Expected: FAIL — `Cannot find module … platform-admin-local.mjs`.

- [ ] **Step 4: Implement the script**

`scripts/platform-admin-local.mjs`:
```js
#!/usr/bin/env node
// The isolated Supabase stack Platform Admin work runs against. It exists
// because the retained `white-label-booking-platform` stack holds demo data we
// must not reset, port 54321 currently belongs to an unrelated project, and the
// dashboard campaign owns 553xx. Every command here refuses any other workdir.
import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
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
    .replace('project_id = "white-label-booking-platform"', `project_id = "${projectId}"`)
    .replace(/\b543(\d\d)\b/gu, "565$1")
    .replace(/\binspector_port = 8083\b/u, "inspector_port = 8093");
  if (/^\[analytics\]$/mu.test(out)) {
    out = out.replace(/^\[analytics\]\n(?:enabled = \w+\n)?/mu, "[analytics]\nenabled = false\n");
  } else {
    out += `${out.endsWith("\n") ? "" : "\n"}[analytics]\nenabled = false\n`;
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

function supabase(args) {
  const result = spawnSync("pnpm", ["exec", "supabase", ...args, "--workdir", workdir], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const commands = {
  sync,
  async start() {
    await sync();
    supabase(["start"]);
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
    supabase(["status"]);
  },
  async stop() {
    await assertIsolated();
    supabase(["stop"]);
  },
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const command = commands[process.argv[2]];
  if (!command) {
    process.stderr.write(`Usage: platform-admin-local.mjs <${Object.keys(commands).join("|")}>\n`);
    process.exit(2);
  }
  await command();
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `rtk node --test scripts/platform-admin-local.test.mjs`
Expected: 3 passing.

- [ ] **Step 6: Register the test and start the stack**

In `package.json`, append ` scripts/platform-admin-local.test.mjs` to the `test:config` command's file list (edit only that string).

Run:
```bash
rtk node scripts/platform-admin-local.mjs start
rtk node scripts/platform-admin-local.mjs status
```
Expected: API on `http://127.0.0.1:56521`, DB on `56522`; migrations and `seed.sql` applied. Then:
```bash
export WLBP_SUPABASE_WORKDIR="$PWD/.artifacts/platform-admin/isolated"
rtk pnpm test:db
```
Expected: the existing 33 pgTAP files pass on the isolated stack (baseline). Record failures, if any, in `.artifacts/platform-admin/baseline-db-tests.log` before changing SQL — they are pre-existing and must not be attributed to this work.

- [ ] **Step 7: Commit**

```bash
rtk git add scripts/platform-admin-local.mjs scripts/platform-admin-local.test.mjs package.json
rtk git commit -m "Give Platform Admin its own isolated local Supabase stack"
```
(If `package.json` carries unrelated uncommitted edits, commit it with `git add -p package.json` selecting only the `test:config` hunk.)

---

### Task 2: Foundation — step-up, audit outcome, idempotency, operator context, audit list/export

**Files:**
- Create: `supabase/migrations/20261006120000_platform_admin_foundation.sql`
- Create: `supabase/tests/database/platform_admin_foundation_test.sql`
- Modify: `supabase/tests/database/tenant_schema_contract_test.sql:67-85` (definer allowlist rule)

**Interfaces:**
- Produces: `control_plane.step_up_seconds_v1()`, `aal2_age_seconds_v1()`, `require_operator_v1(text, integer)`, `write_audit_v1(...)`, `replay_request_v1(text,text)`, `remember_request_v1(text,text,jsonb)`, `audit_detail_summary_v1(jsonb)`, `audit_rows_v1(...)`; api_v1 `get_operator_context_v1`, `record_operator_failure_v1`, `list_audit_events_v1`, `export_audit_events_v1`.

- [ ] **Step 1: Write the failing test**

`supabase/tests/database/platform_admin_foundation_test.sql` (helper block from the top of this document first, then):
```sql
-- Boundary: the wrappers exist, are definer pass-throughs, and anon cannot run them.
select has_function('api_v1','get_operator_context_v1',array[]::text[]);
select ok(not has_function_privilege('anon','api_v1.list_audit_events_v1(text,text,uuid,uuid,text,timestamptz,timestamptz,integer,integer)','execute'),
  'anon cannot list audit events');
select ok(not has_schema_privilege('authenticated','control_plane','usage'),
  'the schema stays unnamed to application roles');

-- Not an operator: refused at every level.
select pg_temp.user('c0000000-0000-0000-0000-00000000000e','tenant-user@example.invalid');
select pg_temp.claims('c0000000-0000-0000-0000-00000000000e','aal2');
set local role authenticated;
select throws_ok($$ select * from api_v1.get_operator_context_v1() $$,'42501','policy_denied',
  'a signed-in non-operator is refused');
select throws_ok($$ select api_v1.record_operator_failure_v1('tenant.suspend','policy_denied',null,null,null) $$,
  '42501','policy_denied','and cannot write audit noise');
reset role;

-- Viewer: context works.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000d','viewer');
set local role authenticated;
select is((select role from api_v1.get_operator_context_v1()),'viewer','a viewer reads their own context');
select is((select step_up_seconds from api_v1.get_operator_context_v1()),900,'and learns the step-up window');
reset role;

-- aal1 is refused even when listed.
select pg_temp.claims('c0000000-0000-0000-0000-00000000000d','aal1');
set local role authenticated;
select throws_ok($$ select * from api_v1.get_operator_context_v1() $$,'42501','policy_denied','aal1 is refused');
reset role;

-- Step-up: recent passes, old fails, missing amr fails.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000a','admin',60);
select lives_ok($$ select control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1()) $$,
  'a TOTP verification one minute ago satisfies step-up');
select pg_temp.claims('c0000000-0000-0000-0000-00000000000a','aal2',3600);
select throws_ok($$ select control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1()) $$,
  '42501','recent_authentication_required','an hour-old verification does not');
select set_config('request.jwt.claims','{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","aal":"aal2"}',true);
select throws_ok($$ select control_plane.require_operator_v1('admin',900) $$,
  '42501','recent_authentication_required','a token without amr is never recent');
select lives_ok($$ select control_plane.require_operator_v1('admin') $$,
  'but step-up is opt-in per action');

-- Idempotency ledger.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000a','admin');
select is(control_plane.replay_request_v1('test-key-0000000001','tenant.create'),null,'a new key replays nothing');
select control_plane.remember_request_v1('test-key-0000000001','tenant.create','{"tenant_id":"x"}');
select is(control_plane.replay_request_v1('test-key-0000000001','tenant.create')->>'tenant_id','x','the same key replays the first result');
select throws_ok($$ select control_plane.replay_request_v1('test-key-0000000001','plan.save') $$,
  '23505','idempotency_conflict','reusing a key for another action is refused');
select throws_ok($$ select control_plane.replay_request_v1('short','tenant.create') $$,
  '22023','idempotency_key_invalid','a malformed key is refused');
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000b','admin');
select throws_ok($$ select control_plane.replay_request_v1('test-key-0000000001','tenant.create') $$,
  '23505','idempotency_conflict','another operator cannot replay someone else''s request');

-- Failures are recorded as denied/failed, append-only.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000c','operator');
set local role authenticated;
select lives_ok($$ select api_v1.record_operator_failure_v1('tenant.suspend','policy_denied',null,'tenant','abc') $$,
  'an operator records their own refused attempt');
reset role;
select is((select outcome from control_plane.audit_events where action='tenant.suspend' and operator_id='c0000000-0000-0000-0000-00000000000c'),
  'denied','a refusal is recorded as denied');
select throws_ok($$ select control_plane.record_operator_failure_v1('Bad Action','x',null,null,null) $$,
  '22023','settings_invalid','malformed codes are refused');
select throws_ok($$ select control_plane.write_audit_v1('c0000000-0000-0000-0000-00000000000c','x.y',null,null,null,null,'token sk_live_abcdef',null) $$,
  '23514',null,'a secret-shaped reason cannot be stored');

-- Audit list: viewer reads, filters, paginates; detail is summarised.
select control_plane.write_audit_v1('c0000000-0000-0000-0000-00000000000a','plan.updated',null,null,'plan','launch',
  'Tightened features','{"plan":"launch","unlisted_key":"hidden"}');
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000d','viewer');
set local role authenticated;
select ok((select count(*) from api_v1.list_audit_events_v1(null,'plan',null,null,null,null,null,10,0)) >= 1,
  'a viewer lists audit events filtered by action family');
select is((select detail from api_v1.list_audit_events_v1(null,'plan.updated',null,null,null,null,null,10,0) limit 1),
  '{"plan":"launch"}'::jsonb,'only allow-listed detail keys leave the database');
select is((select count(*)::int from api_v1.list_audit_events_v1('tightened',null,null,null,null,null,null,10,0)),1,
  'search matches the reason case-insensitively');
select is((select count(*)::int from api_v1.list_audit_events_v1('%',null,null,null,null,null,null,10,0)),0,
  'search treats % literally');
select throws_ok($$ select * from api_v1.export_audit_events_v1(null,null,null,null,null,null,null) $$,
  '42501','policy_denied','a viewer cannot export');
reset role;

-- Export: admin with step-up only, and audited.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000a','admin',3600);
set local role authenticated;
select throws_ok($$ select * from api_v1.export_audit_events_v1(null,null,null,null,null,null,null) $$,
  '42501','recent_authentication_required','an admin without recent verification cannot export');
reset role;
select pg_temp.claims('c0000000-0000-0000-0000-00000000000a','aal2',30);
set local role authenticated;
select ok((select count(*) from api_v1.export_audit_events_v1(null,null,null,null,null,null,null)) >= 2,'a recent admin exports');
reset role;
select is((select count(*)::int from control_plane.audit_events where action='audit.exported'),1,'and the export is itself audited');

select * from finish();
rollback;
```
Begin the file with `begin;` and `select no_plan();` above the helper block.

- [ ] **Step 2: Run it to verify it fails**

Run: `rtk node scripts/platform-admin-local.mjs test 2>&1 | tail -20`
Expected: FAIL in `platform_admin_foundation_test.sql` — `function api_v1.get_operator_context_v1() does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261006120000_platform_admin_foundation.sql`:
```sql
-- Platform Admin completion, part 1: the boundary every later operator RPC uses.
--
-- One function decides whether a caller may act: require_operator_v1. It keeps
-- is_operator_v1's live allow-list + aal2 check and adds an optional recency
-- check read from the JWT's amr timestamps, because an aal2 session that was
-- strong this morning is not consent for suspending a tenant this evening.
--
-- Audit gains outcome, reason and target so a reviewer can answer "who tried
-- what, against what, why, and did it work" without parsing detail blobs. A
-- failed action rolls back its own audit row with the transaction, so refused
-- and failed attempts are written afterwards by record_operator_failure_v1,
-- callable only by someone on the allow-list.
--
-- Create-type actions take an idempotency key; operator_requests remembers the
-- first result so a double-submitted form returns the same tenant rather than a
-- second one.

-- ---------------------------------------------------------------------------
-- 1. Audit columns
-- ---------------------------------------------------------------------------
alter table control_plane.audit_events
  add column outcome text not null default 'succeeded'
    check (outcome in ('succeeded','failed','denied')),
  add column reason text
    check (reason is null or pg_catalog.char_length(reason) between 1 and 500),
  add column target_kind text
    check (target_kind is null or target_kind ~ '^[a-z][a-z_]{1,40}$'),
  add column target_id text
    check (target_id is null or pg_catalog.char_length(target_id) between 1 and 200);
alter table control_plane.audit_events
  add constraint audit_events_reason_no_secret check (reason is null
    or control_plane.contains_no_secret_v1(pg_catalog.jsonb_build_object('reason',reason)));
create index audit_events_recent_idx on control_plane.audit_events (created_at desc, id desc);
create index audit_events_tenant_recent_idx on control_plane.audit_events (tenant_id, created_at desc)
  where tenant_id is not null;
create index audit_events_target_idx on control_plane.audit_events (target_kind, target_id)
  where target_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Who may act, and how recently they proved it
-- ---------------------------------------------------------------------------
create or replace function control_plane.step_up_seconds_v1()
returns integer language sql immutable set search_path = '' as $$ select 900 $$;

-- Seconds since the most recent second-factor verification in this JWT, or
-- null when the token carries none.
create or replace function control_plane.aal2_age_seconds_v1()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (extract(epoch from pg_catalog.statement_timestamp())
          - pg_catalog.max((e.value->>'timestamp')::numeric))::integer
  from pg_catalog.jsonb_array_elements(
    case when pg_catalog.jsonb_typeof(auth.jwt()->'amr') = 'array'
         then auth.jwt()->'amr' else '[]'::jsonb end) e
  where e.value->>'method' in ('totp','webauthn','phone')
    and (e.value->>'timestamp') ~ '^[0-9]{1,12}$';
$$;

create or replace function control_plane.require_operator_v1(
  p_minimum text,
  p_recent_seconds integer default null
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_age integer;
begin
  if not control_plane.is_operator_v1(p_minimum) then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  if p_recent_seconds is not null then
    v_age := control_plane.aal2_age_seconds_v1();
    if v_age is null or v_age > p_recent_seconds then
      raise exception using errcode='42501',message='recent_authentication_required';
    end if;
  end if;
  return (select private.current_auth_user_id());
end;
$function$;

create or replace function control_plane.write_audit_v1(
  p_operator uuid,
  p_action text,
  p_tenant_id uuid default null,
  p_instance_id uuid default null,
  p_target_kind text default null,
  p_target_id text default null,
  p_reason text default null,
  p_detail jsonb default '{}'::jsonb,
  p_outcome text default 'succeeded'
)
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$
  insert into control_plane.audit_events(
    operator_id,action,tenant_id,instance_id,target_kind,target_id,reason,detail,outcome)
  values (p_operator,p_action,p_tenant_id,p_instance_id,p_target_kind,p_target_id,
    nullif(pg_catalog.btrim(p_reason),''),coalesce(p_detail,'{}'::jsonb),p_outcome)
  returning id;
$$;

-- ---------------------------------------------------------------------------
-- 3. Idempotency ledger for create-type operator actions
-- ---------------------------------------------------------------------------
create table control_plane.operator_requests (
  idempotency_key text not null primary key
    check (idempotency_key ~ '^[A-Za-z0-9:_-]{16,200}$'),
  action text not null check (action ~ '^[a-z][a-z_]*(\.[a-z][a-z_]*)+$'),
  operator_id uuid not null,
  result jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  check (control_plane.contains_no_secret_v1(result))
);
alter table control_plane.operator_requests enable row level security;
create policy operator_requests_no_application_access on control_plane.operator_requests
  for all to anon,authenticated using (false) with check (false);
revoke all on control_plane.operator_requests from public,anon,authenticated;

-- Returns the remembered result, or null for a new key. The advisory lock makes
-- two simultaneous submissions of one form queue behind each other, so the
-- second sees the first's row instead of racing it.
create or replace function control_plane.replay_request_v1(p_key text, p_action text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_row control_plane.operator_requests%rowtype;
begin
  if p_key is null or p_key !~ '^[A-Za-z0-9:_-]{16,200}$' then
    raise exception using errcode='22023',message='idempotency_key_invalid';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_key,0));
  select * into v_row from control_plane.operator_requests r where r.idempotency_key = p_key;
  if v_row.idempotency_key is null then
    return null;
  end if;
  if v_row.action <> p_action
     or v_row.operator_id is distinct from (select private.current_auth_user_id()) then
    raise exception using errcode='23505',message='idempotency_conflict';
  end if;
  return v_row.result;
end;
$function$;

create or replace function control_plane.remember_request_v1(p_key text, p_action text, p_result jsonb)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into control_plane.operator_requests(idempotency_key,action,operator_id,result)
  values (p_key,p_action,(select private.current_auth_user_id()),coalesce(p_result,'{}'::jsonb));
$$;

-- ---------------------------------------------------------------------------
-- 4. Recording what did not happen
-- ---------------------------------------------------------------------------
create or replace function control_plane.record_operator_failure_v1(
  p_action text,
  p_error_code text,
  p_tenant_id uuid default null,
  p_target_kind text default null,
  p_target_id text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user uuid := (select private.current_auth_user_id());
begin
  -- Anyone on the allow-list, even disabled or at aal1, so refused attempts are
  -- visible; nobody else, so a tenant session cannot write audit noise.
  if v_user is null or not exists (
      select 1 from control_plane.operators o where o.auth_user_id = v_user) then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  if p_action is null or p_action !~ '^[a-z][a-z_]*(\.[a-z][a-z_]*)+$'
     or p_error_code is null or p_error_code !~ '^[a-z][a-z0-9_]{2,60}$'
     or (p_target_kind is not null and p_target_kind !~ '^[a-z][a-z_]{1,40}$')
     or (p_target_id is not null and p_target_id !~ '^[A-Za-z0-9:_.-]{1,200}$') then
    raise exception using errcode='22023',message='settings_invalid';
  end if;
  perform control_plane.write_audit_v1(v_user,p_action,p_tenant_id,null,p_target_kind,p_target_id,
    null,pg_catalog.jsonb_build_object('error_code',p_error_code),
    case when p_error_code in ('policy_denied','recent_authentication_required')
         then 'denied' else 'failed' end);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. The caller's own standing
-- ---------------------------------------------------------------------------
create or replace function control_plane.get_operator_context_v1()
returns table (operator_id uuid, email text, role text, expires_at timestamptz,
  aal2_age_seconds integer, step_up_seconds integer)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_user uuid;
begin
  v_user := control_plane.require_operator_v1('viewer');
  return query
  select o.auth_user_id, o.email, o.role, o.expires_at,
    control_plane.aal2_age_seconds_v1(), control_plane.step_up_seconds_v1()
  from control_plane.operators o where o.auth_user_id = v_user;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Reading the audit trail
-- ---------------------------------------------------------------------------
-- Detail is already secret-free by constraint; this also keeps unreviewed keys
-- from reaching a screen or a CSV as new actions add them.
create or replace function control_plane.audit_detail_summary_v1(p_detail jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(pg_catalog.jsonb_object_agg(d.key,d.value),'{}'::jsonb)
  from pg_catalog.jsonb_each(coalesce(p_detail,'{}'::jsonb)) d
  where d.key in ('kind','job_id','plan','ring','grant_id','ticket','minutes','expires_at',
    'run_id','steps_reset','state','from','to','role','release','rollout_id','provider',
    'status','error_code','feature_key','granted','hostname','application','targets',
    'blocked','filters','rows','name','brand_key','added','removed','version','channel',
    'flag_key','enabled','job_ids','resources_deactivated');
$$;

-- Unchecked engine shared by list and export; never granted.
create or replace function control_plane.audit_rows_v1(
  p_search text, p_action text, p_tenant_id uuid, p_operator_id uuid, p_outcome text,
  p_from timestamptz, p_to timestamptz, p_limit integer, p_offset integer
)
returns table (event_id uuid, created_at timestamptz, operator_id uuid, operator_email text,
  action text, outcome text, tenant_id uuid, tenant_name text, instance_id uuid,
  target_kind text, target_id text, reason text, detail jsonb, total_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.created_at, e.operator_id, o.email, e.action, e.outcome, e.tenant_id, t.name,
    e.instance_id, e.target_kind, e.target_id, e.reason,
    control_plane.audit_detail_summary_v1(e.detail), pg_catalog.count(*) over ()
  from control_plane.audit_events e
  left join control_plane.operators o on o.auth_user_id = e.operator_id
  left join app.tenants t on t.id = e.tenant_id
  where (p_action is null or e.action = p_action or e.action like p_action || '.%')
    and (p_tenant_id is null or e.tenant_id = p_tenant_id)
    and (p_operator_id is null or e.operator_id = p_operator_id)
    and (p_outcome is null or e.outcome = p_outcome)
    and (p_from is null or e.created_at >= p_from)
    and (p_to is null or e.created_at < p_to)
    and (coalesce(p_search,'') = '' or
      pg_catalog.strpos(pg_catalog.lower(e.action), pg_catalog.lower(p_search)) > 0 or
      pg_catalog.strpos(pg_catalog.lower(coalesce(o.email,'')), pg_catalog.lower(p_search)) > 0 or
      pg_catalog.strpos(pg_catalog.lower(coalesce(t.name,'')), pg_catalog.lower(p_search)) > 0 or
      pg_catalog.strpos(pg_catalog.lower(coalesce(e.target_id,'')), pg_catalog.lower(p_search)) > 0 or
      pg_catalog.strpos(pg_catalog.lower(coalesce(e.reason,'')), pg_catalog.lower(p_search)) > 0)
  order by e.created_at desc, e.id desc
  limit p_limit offset p_offset;
$$;

create or replace function control_plane.list_audit_events_v1(
  p_search text default null, p_action text default null, p_tenant_id uuid default null,
  p_operator_id uuid default null, p_outcome text default null,
  p_from timestamptz default null, p_to timestamptz default null,
  p_limit integer default 50, p_offset integer default 0
)
returns table (event_id uuid, created_at timestamptz, operator_id uuid, operator_email text,
  action text, outcome text, tenant_id uuid, tenant_name text, instance_id uuid,
  target_kind text, target_id text, reason text, detail jsonb, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform control_plane.require_operator_v1('viewer');
  if p_outcome is not null and p_outcome not in ('succeeded','failed','denied') then
    raise exception using errcode='22023',message='settings_invalid';
  end if;
  return query select * from control_plane.audit_rows_v1(
    nullif(pg_catalog.btrim(p_search),''), nullif(pg_catalog.btrim(p_action),''),
    p_tenant_id, p_operator_id, p_outcome, p_from, p_to,
    least(greatest(coalesce(p_limit,50),1),100), greatest(coalesce(p_offset,0),0));
end;
$function$;

create or replace function control_plane.export_audit_events_v1(
  p_search text default null, p_action text default null, p_tenant_id uuid default null,
  p_operator_id uuid default null, p_outcome text default null,
  p_from timestamptz default null, p_to timestamptz default null
)
returns table (event_id uuid, created_at timestamptz, operator_id uuid, operator_email text,
  action text, outcome text, tenant_id uuid, tenant_name text, instance_id uuid,
  target_kind text, target_id text, reason text, detail jsonb, total_count bigint)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_operator uuid;
begin
  v_operator := control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  if p_outcome is not null and p_outcome not in ('succeeded','failed','denied') then
    raise exception using errcode='22023',message='settings_invalid';
  end if;
  -- Which filters were used, never their values: a search string is whatever an
  -- operator typed, and that is not something to copy into a permanent ledger.
  perform control_plane.write_audit_v1(v_operator,'audit.exported',p_tenant_id,null,null,null,null,
    pg_catalog.jsonb_build_object('filters',pg_catalog.jsonb_build_object(
      'search',p_search is not null,'action',p_action,'tenant',p_tenant_id is not null,
      'operator',p_operator_id is not null,'outcome',p_outcome,
      'from',p_from,'to',p_to)));
  return query select * from control_plane.audit_rows_v1(
    nullif(pg_catalog.btrim(p_search),''), nullif(pg_catalog.btrim(p_action),''),
    p_tenant_id, p_operator_id, p_outcome, p_from, p_to, 5000, 0);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 7. api_v1 pass-throughs and grants
-- ---------------------------------------------------------------------------
create or replace function api_v1.get_operator_context_v1()
returns table (operator_id uuid, email text, role text, expires_at timestamptz,
  aal2_age_seconds integer, step_up_seconds integer)
language sql security definer set search_path to ''
as $$ select * from control_plane.get_operator_context_v1(); $$;

create or replace function api_v1.record_operator_failure_v1(
  p_action text, p_error_code text, p_tenant_id uuid default null,
  p_target_kind text default null, p_target_id text default null)
returns void
language sql security definer set search_path to ''
as $$ select control_plane.record_operator_failure_v1(p_action,p_error_code,p_tenant_id,p_target_kind,p_target_id); $$;

create or replace function api_v1.list_audit_events_v1(
  p_search text default null, p_action text default null, p_tenant_id uuid default null,
  p_operator_id uuid default null, p_outcome text default null,
  p_from timestamptz default null, p_to timestamptz default null,
  p_limit integer default 50, p_offset integer default 0)
returns table (event_id uuid, created_at timestamptz, operator_id uuid, operator_email text,
  action text, outcome text, tenant_id uuid, tenant_name text, instance_id uuid,
  target_kind text, target_id text, reason text, detail jsonb, total_count bigint)
language sql security definer set search_path to ''
as $$ select * from control_plane.list_audit_events_v1(p_search,p_action,p_tenant_id,p_operator_id,p_outcome,p_from,p_to,p_limit,p_offset); $$;

create or replace function api_v1.export_audit_events_v1(
  p_search text default null, p_action text default null, p_tenant_id uuid default null,
  p_operator_id uuid default null, p_outcome text default null,
  p_from timestamptz default null, p_to timestamptz default null)
returns table (event_id uuid, created_at timestamptz, operator_id uuid, operator_email text,
  action text, outcome text, tenant_id uuid, tenant_name text, instance_id uuid,
  target_kind text, target_id text, reason text, detail jsonb, total_count bigint)
language sql security definer set search_path to ''
as $$ select * from control_plane.export_audit_events_v1(p_search,p_action,p_tenant_id,p_operator_id,p_outcome,p_from,p_to); $$;

revoke all on all functions in schema control_plane from public,anon,authenticated;
grant execute on function control_plane.contains_no_secret_v1(jsonb) to service_role;

revoke all on function
  api_v1.get_operator_context_v1(),
  api_v1.record_operator_failure_v1(text,text,uuid,text,text),
  api_v1.list_audit_events_v1(text,text,uuid,uuid,text,timestamptz,timestamptz,integer,integer),
  api_v1.export_audit_events_v1(text,text,uuid,uuid,text,timestamptz,timestamptz)
from public, anon;
grant execute on function
  api_v1.get_operator_context_v1(),
  api_v1.record_operator_failure_v1(text,text,uuid,text,text),
  api_v1.list_audit_events_v1(text,text,uuid,uuid,text,timestamptz,timestamptz,integer,integer),
  api_v1.export_audit_events_v1(text,text,uuid,uuid,text,timestamptz,timestamptz)
to authenticated;
```

- [ ] **Step 4: Generalize the reviewed-definer rule**

In `supabase/tests/database/tenant_schema_contract_test.sql`, replace the `select ok( not exists ( … procedure.prosecdef ), 'only reviewed operator/worker and public catalog wrappers use definer rights');` block (lines 67–85) with:
```sql
-- Definer rights on api_v1 are allowed for exactly two shapes: the reviewed
-- public catalog, and a same-named pass-through into control_plane, which owns
-- its own authorization (require_operator_v1 / is_worker_v1). Anything else —
-- logic in the wrapper, a different target, a mutable search_path — fails here.
select ok(
  not exists (
    select 1
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'api_v1'
      and procedure.prosecdef
      and procedure.oid::regprocedure::text <> 'api_v1.get_public_catalog_v1(text,text,text)'
      and not (
        procedure.prolang = (select oid from pg_language where lanname = 'sql')
        and 'search_path=""' = any(procedure.proconfig)
        and pg_catalog.btrim(procedure.prosrc, E' \n\t')
          ~ ('^select (\* from )?control_plane\.' || procedure.proname || '\(')
        and exists (
          select 1 from pg_proc as inner_procedure
          join pg_namespace as inner_namespace on inner_namespace.oid = inner_procedure.pronamespace
          where inner_namespace.nspname = 'control_plane'
            and inner_procedure.proname = procedure.proname)
      )
  ),
  'api_v1 definer functions are only the public catalog or same-named control_plane pass-throughs'
);

select ok(
  not exists (
    select 1
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'api_v1'
      and procedure.prosecdef
      and procedure.oid::regprocedure::text <> 'api_v1.get_public_catalog_v1(text,text,text)'
      and has_function_privilege('anon', procedure.oid, 'execute')
  ),
  'no control-plane pass-through is executable by anon'
);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run:
```bash
rtk node scripts/platform-admin-local.mjs replay
rtk node scripts/platform-admin-local.mjs test 2>&1 | tail -40
```
Expected: `platform_admin_foundation_test.sql .. ok`, `tenant_schema_contract_test.sql .. ok`, no new failures versus the Task 1 baseline.

- [ ] **Step 6: Commit**

```bash
rtk git add supabase/migrations/20261006120000_platform_admin_foundation.sql supabase/tests/database/platform_admin_foundation_test.sql supabase/tests/database/tenant_schema_contract_test.sql
rtk git commit -m "Add the operator step-up, audit outcome and idempotency boundary"
```
(`tenant_schema_contract_test.sql` has unrelated uncommitted edits: stage only this hunk with `git add -p`.)

---

### Task 3: Tenants — directory, detail, idempotent creation, update, lifecycle, guarded closure

**Files:**
- Create: `supabase/migrations/20261006130000_platform_admin_tenants.sql`
- Create: `supabase/tests/database/platform_admin_tenants_test.sql`

**Interfaces:**
- Consumes: Task 2 helpers.
- Produces: api_v1 `list_tenants_v1`, `get_tenant_v1` (jsonb with keys `tenant, brands, subscription, plan, entitlements, domains, instances, provisioning_runs, jobs, support_grants, audit`), `create_tenant_v2`, `update_tenant_v1`, `set_tenant_status_v1`, `request_tenant_closure_v1`. Internal `control_plane.enqueue_operator_job_v1` is defined in Task 4; closure here inserts its jobs directly so this migration does not depend on Task 4.

- [ ] **Step 1: Write the failing test**

`supabase/tests/database/platform_admin_tenants_test.sql` (begin/no_plan, helper block, then):
```sql
-- Create (admin), idempotent.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000a','admin');
set local role authenticated;
select set_config('test.t1',(select tenant_id::text from api_v1.create_tenant_v2('North Clinic','north-clinic','create-north-clinic-0001')),true);
select is((select tenant_id::text from api_v1.create_tenant_v2('North Clinic','north-clinic','create-north-clinic-0001')),
  current_setting('test.t1'),'resubmitting the same form returns the same tenant');
select is((select replayed from api_v1.create_tenant_v2('North Clinic','north-clinic','create-north-clinic-0001')),true,
  'and says it was a replay');
select throws_ok($$ select * from api_v1.create_tenant_v2(' ','x-y','create-bad-name-00001') $$,'22023','tenant_name_invalid',
  'a blank name is refused');
reset role;
select is((select count(*)::int from app.tenants where name='North Clinic'),1,'only one tenant exists');
select is((select count(*)::int from control_plane.audit_events where action='tenant.created'
  and tenant_id=current_setting('test.t1')::uuid),1,'creation is audited once');

-- Operators cannot create; viewers cannot update.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000c','operator');
set local role authenticated;
select throws_ok($$ select * from api_v1.create_tenant_v2('X','x','create-by-operator-0001') $$,'42501','policy_denied',
  'an operator cannot originate a tenant');
reset role;
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000d','viewer');
set local role authenticated;
select ok((select count(*) from api_v1.list_tenants_v1('north',null,null,null,20,0)) = 1,'a viewer finds the tenant by search');
select is((select get_tenant_v1->'tenant'->>'name' from api_v1.get_tenant_v1(current_setting('test.t1')::uuid)),
  'North Clinic','and reads its detail');
select ok((select get_tenant_v1 ? 'audit' from api_v1.get_tenant_v1(current_setting('test.t1')::uuid)),'detail carries audit history');
select ok(not (select get_tenant_v1::text ~* '(customer|booking)' from api_v1.get_tenant_v1(current_setting('test.t1')::uuid)),
  'detail never carries tenant customers or bookings');
select throws_ok($$ select api_v1.get_tenant_v1('00000000-0000-0000-0000-000000000099') $$,'P0002','not_found',
  'an unknown tenant is not_found');
select throws_ok(format($$ select * from api_v1.update_tenant_v1(%L,'New',now()) $$,current_setting('test.t1')),
  '42501','policy_denied','a viewer cannot rename');
reset role;

-- Update with optimistic concurrency.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000c','operator');
set local role authenticated;
select throws_ok(format($$ select * from api_v1.update_tenant_v1(%L,'North Clinic Group','2000-01-01') $$,current_setting('test.t1')),
  '40001','stale_revision','a stale edit is refused');
select lives_ok(format($$ select * from api_v1.update_tenant_v1(%L,'North Clinic Group',
  (select (get_tenant_v1->'tenant'->>'updated_at')::timestamptz from api_v1.get_tenant_v1(%L))) $$,
  current_setting('test.t1'),current_setting('test.t1')),'a current edit succeeds');
reset role;

-- Suspend/reactivate: admin, reason, step-up, legal transitions only.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000a','admin',3600);
set local role authenticated;
select throws_ok(format($$ select * from api_v1.set_tenant_status_v1(%L,'suspended','Payment dispute open','active') $$,current_setting('test.t1')),
  '42501','recent_authentication_required','suspension needs a recent verification');
reset role;
select pg_temp.claims('c0000000-0000-0000-0000-00000000000a','aal2',30);
set local role authenticated;
select throws_ok(format($$ select * from api_v1.set_tenant_status_v1(%L,'suspended','short','active') $$,current_setting('test.t1')),
  '22023','reason_required','a reason under ten characters is refused');
select throws_ok(format($$ select * from api_v1.set_tenant_status_v1(%L,'suspended','Payment dispute open','suspended') $$,current_setting('test.t1')),
  '40001','stale_revision','acting on a stale status is refused');
select is((select status from api_v1.set_tenant_status_v1(current_setting('test.t1')::uuid,'suspended','Payment dispute open','active')),
  'suspended','a recent admin suspends with a reason');
select throws_ok(format($$ select * from api_v1.set_tenant_status_v1(%L,'closed','Closing the account','suspended') $$,current_setting('test.t1')),
  '22023','transition_not_allowed','closing is not a status flip');
reset role;
select is((select reason from control_plane.audit_events where action='tenant.suspended'),'Payment dispute open',
  'the reason is in the audit trail');

-- Closure: confirmation, suspended first, two-person approval job, no deletion.
select pg_temp.claims('c0000000-0000-0000-0000-00000000000a','aal2',30);
set local role authenticated;
select throws_ok(format($$ select * from api_v1.request_tenant_closure_v1(%L,'Contract ended in writing','Wrong Name','close-north-000000001') $$,current_setting('test.t1')),
  '22023','confirmation_mismatch','closure requires typing the tenant name');
select is((select array_length(job_ids,1) from api_v1.request_tenant_closure_v1(current_setting('test.t1')::uuid,
  'Contract ended in writing','North Clinic Group','close-north-000000001')),1,'one close job per instance');
reset role;
select ok((select approved_by is null and status='queued' from control_plane.jobs where kind='close_instance'
  and tenant_id=current_setting('test.t1')::uuid),'the close job waits for a second admin');
select is((select status from app.tenants where id=current_setting('test.t1')::uuid),'suspended','nothing was closed or deleted');

select pg_temp.claims('c0000000-0000-0000-0000-00000000000a','aal2',30);
set local role authenticated;
select is((select status from api_v1.set_tenant_status_v1(current_setting('test.t1')::uuid,'active','Dispute resolved by finance','suspended')),
  'active','reactivation works');
reset role;

-- A tenant session never reaches any of this.
select pg_temp.user('c0000000-0000-0000-0000-00000000000e','tenant-user@example.invalid');
select pg_temp.claims('c0000000-0000-0000-0000-00000000000e','aal2');
set local role authenticated;
select throws_ok($$ select * from api_v1.list_tenants_v1() $$,'42501','policy_denied','a tenant session is refused');
reset role;

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to verify it fails**

Run: `rtk node scripts/platform-admin-local.mjs test 2>&1 | grep -A5 platform_admin_tenants`
Expected: FAIL — `function api_v1.create_tenant_v2(...) does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261006130000_platform_admin_tenants.sql`:
```sql
-- Platform Admin completion, part 2: the tenant directory and lifecycle.
--
-- Suspension is real: every public tenant-context check already requires
-- app.tenants.status = 'active', so a suspended tenant's client stops resolving
-- on the next request. Reactivation restores it. Closure is not a status flip
-- here — it is a queued close_instance job per instance that a second admin
-- must approve (the existing two-person rule on control_plane.jobs), and
-- nothing in this file deletes a row.

create or replace function control_plane.create_tenant_v2(
  p_name text, p_brand_key text, p_idempotency_key text)
returns table (tenant_id uuid, brand_id uuid, instance_id uuid, replayed boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_prior jsonb;
  v_row record;
begin
  v_operator := control_plane.require_operator_v1('admin');
  v_prior := control_plane.replay_request_v1(p_idempotency_key,'tenant.create');
  if v_prior is not null then
    return query select (v_prior->>'tenant_id')::uuid,(v_prior->>'brand_id')::uuid,
      (v_prior->>'instance_id')::uuid,true;
    return;
  end if;

  select c.tenant_id, c.brand_id, c.instance_id into v_row
  from control_plane.create_tenant_v1(p_name,p_brand_key) c;

  perform control_plane.write_audit_v1(v_operator,'tenant.created',v_row.tenant_id,v_row.instance_id,
    'tenant',v_row.tenant_id::text,null,
    pg_catalog.jsonb_build_object('name',pg_catalog.btrim(p_name),'brand_key',p_brand_key));
  perform control_plane.remember_request_v1(p_idempotency_key,'tenant.create',
    pg_catalog.jsonb_build_object('tenant_id',v_row.tenant_id,'brand_id',v_row.brand_id,
      'instance_id',v_row.instance_id));
  return query select v_row.tenant_id,v_row.brand_id,v_row.instance_id,false;
end;
$function$;

create or replace function control_plane.list_tenants_v1(
  p_search text default null, p_status text default null, p_plan_key text default null,
  p_sort text default null, p_limit integer default 25, p_offset integer default 0)
returns table (tenant_id uuid, name text, status text, brand_keys text, plan_key text,
  subscription_state text, instance_count bigint, active_instances bigint,
  provisioning_state text, created_at timestamptz, updated_at timestamptz, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_sort text := case when p_sort in ('name','-name','created','-created','status')
                      then p_sort else '-created' end;
begin
  perform control_plane.require_operator_v1('viewer');
  return query
  select t.id, t.name, t.status,
    (select pg_catalog.string_agg(b.key, ', ' order by b.key) from app.brands b where b.tenant_id = t.id),
    s.plan_key, s.state,
    (select pg_catalog.count(*) from app.instances i where i.tenant_id = t.id),
    (select pg_catalog.count(*) from app.instances i where i.tenant_id = t.id and i.deployment_state = 'active'),
    (select r.state from control_plane.provisioning_runs r where r.tenant_id = t.id
       order by r.created_at desc limit 1),
    t.created_at, t.updated_at, pg_catalog.count(*) over ()
  from app.tenants t
  left join control_plane.subscriptions s on s.tenant_id = t.id
  where (p_status is null or t.status = p_status)
    and (p_plan_key is null or s.plan_key = p_plan_key or (p_plan_key = 'none' and s.plan_key is null))
    and (coalesce(pg_catalog.btrim(p_search),'') = ''
      or pg_catalog.strpos(pg_catalog.lower(t.name), pg_catalog.lower(pg_catalog.btrim(p_search))) > 0
      or t.id::text = pg_catalog.btrim(p_search)
      or exists (select 1 from app.brands b where b.tenant_id = t.id
        and pg_catalog.strpos(b.key, pg_catalog.lower(pg_catalog.btrim(p_search))) > 0))
  order by
    case when v_sort = 'name' then t.name end asc,
    case when v_sort = '-name' then t.name end desc,
    case when v_sort = 'status' then t.status end asc,
    case when v_sort = 'created' then t.created_at end asc,
    case when v_sort = '-created' then t.created_at end desc,
    t.id
  limit least(greatest(coalesce(p_limit,25),1),100) offset greatest(coalesce(p_offset,0),0);
end;
$function$;

create or replace function control_plane.get_tenant_v1(p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_tenant app.tenants%rowtype;
begin
  perform control_plane.require_operator_v1('viewer');
  select * into v_tenant from app.tenants t where t.id = p_tenant_id;
  if v_tenant.id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;

  return pg_catalog.jsonb_build_object(
    'tenant', pg_catalog.jsonb_build_object('id',v_tenant.id,'name',v_tenant.name,
      'status',v_tenant.status,'created_at',v_tenant.created_at,'updated_at',v_tenant.updated_at),
    'brands', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',b.id,'key',b.key,'status',b.status) order by b.created_at)
      from app.brands b where b.tenant_id = p_tenant_id),'[]'::jsonb),
    'subscription', (select pg_catalog.jsonb_build_object('plan_key',s.plan_key,'state',s.state,
        'rollout_ring',s.rollout_ring,'started_at',s.started_at,'ends_at',s.ends_at,'updated_at',s.updated_at)
      from control_plane.subscriptions s where s.tenant_id = p_tenant_id),
    'plan', (select pg_catalog.jsonb_build_object('key',p.key,'name',p.name,'entitlements',p.entitlements,'active',p.active)
      from control_plane.subscriptions s join control_plane.plans p on p.key = s.plan_key
      where s.tenant_id = p_tenant_id),
    'entitlements', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'feature_key',e.feature_key,'granted',e.granted,'source',e.source,
        'expires_at',e.expires_at,'updated_at',e.updated_at) order by e.feature_key)
      from app.tenant_entitlements e where e.tenant_id = p_tenant_id),'[]'::jsonb),
    'domains', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',d.id,'instance_id',d.instance_id,'hostname',d.hostname,'application',d.application,
        'kind',d.kind,'verification_status',d.verification_status,'verified_at',d.verified_at,
        'active',d.active) order by d.hostname)
      from app.tenant_domains d where d.tenant_id = p_tenant_id),'[]'::jsonb),
    'instances', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',i.id,'deployment_state',i.deployment_state,'brand_id',i.brand_id,
        'brand_published',i.published_brand_revision_id is not null,
        'desired_release',r.desired_release,'current_release',r.current_release,
        'reported_at',r.reported_at,'created_at',i.created_at) order by i.created_at)
      from app.instances i
      left join control_plane.instance_release_state r on r.tenant_id = i.tenant_id and r.instance_id = i.id
      where i.tenant_id = p_tenant_id),'[]'::jsonb),
    'provisioning_runs', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',r.id,'instance_id',r.instance_id,'slug',r.slug,'state',r.state,
        'waiting_reason',r.waiting_reason,'last_error_code',r.last_error_code,
        'created_at',r.created_at,'updated_at',r.updated_at) order by r.created_at desc)
      from control_plane.provisioning_runs r where r.tenant_id = p_tenant_id),'[]'::jsonb),
    'jobs', coalesce((select pg_catalog.jsonb_agg(x.j order by x.created_at desc) from (
        select j.created_at, pg_catalog.jsonb_build_object('id',j.id,'kind',j.kind,'status',j.status,
          'attempts',j.attempts,'last_error_code',j.last_error_code,
          'needs_approval',j.kind in ('close_instance','rotate_secret') and j.approved_by is null and j.status = 'queued',
          'created_at',j.created_at) as j
        from control_plane.jobs j where j.tenant_id = p_tenant_id
        order by j.created_at desc limit 20) x),'[]'::jsonb),
    'support_grants', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',g.id,'status',case when g.status = 'active' and g.expires_at <= pg_catalog.statement_timestamp()
          then 'expired' else g.status end,
        'ticket_reference',g.ticket_reference,'scope',g.scope,'expires_at',g.expires_at,
        'requested_at',g.requested_at) order by g.requested_at desc)
      from control_plane.support_grants g where g.tenant_id = p_tenant_id),'[]'::jsonb),
    'audit', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) - 'total_count')
      from control_plane.audit_rows_v1(null,null,p_tenant_id,null,null,null,null,20,0) a),'[]'::jsonb)
  );
end;
$function$;

create or replace function control_plane.update_tenant_v1(
  p_tenant_id uuid, p_name text, p_expected_updated_at timestamptz)
returns table (tenant_id uuid, updated_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_tenant app.tenants%rowtype;
  v_name text := pg_catalog.btrim(p_name);
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  v_operator := control_plane.require_operator_v1('operator');
  if v_name is null or v_name = '' or pg_catalog.char_length(v_name) > 160 then
    raise exception using errcode='22023',message='name_invalid';
  end if;
  select * into v_tenant from app.tenants t where t.id = p_tenant_id for update;
  if v_tenant.id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  if v_tenant.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode='40001',message='stale_revision';
  end if;
  update app.tenants t set name = v_name, updated_at = v_now where t.id = p_tenant_id;
  perform control_plane.write_audit_v1(v_operator,'tenant.renamed',p_tenant_id,null,'tenant',
    p_tenant_id::text,null,pg_catalog.jsonb_build_object('from',v_tenant.name,'to',v_name));
  return query select p_tenant_id, v_now;
end;
$function$;

create or replace function control_plane.set_tenant_status_v1(
  p_tenant_id uuid, p_status text, p_reason text, p_expected_status text)
returns table (tenant_id uuid, status text, updated_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_tenant app.tenants%rowtype;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  v_operator := control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 10 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  select * into v_tenant from app.tenants t where t.id = p_tenant_id for update;
  if v_tenant.id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  if v_tenant.status is distinct from p_expected_status then
    raise exception using errcode='40001',message='stale_revision';
  end if;
  if not ((v_tenant.status = 'active' and p_status = 'suspended')
       or (v_tenant.status = 'suspended' and p_status = 'active')) then
    raise exception using errcode='22023',message='transition_not_allowed';
  end if;

  update app.tenants t set status = p_status, updated_at = v_now where t.id = p_tenant_id;
  perform control_plane.write_audit_v1(v_operator,
    case p_status when 'suspended' then 'tenant.suspended' else 'tenant.reactivated' end,
    p_tenant_id,null,'tenant',p_tenant_id::text,p_reason,
    pg_catalog.jsonb_build_object('from',v_tenant.status,'to',p_status));
  return query select p_tenant_id, p_status, v_now;
end;
$function$;

create or replace function control_plane.request_tenant_closure_v1(
  p_tenant_id uuid, p_reason text, p_confirmation text, p_idempotency_key text)
returns table (job_ids uuid[])
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_tenant app.tenants%rowtype;
  v_prior jsonb;
  v_ids uuid[] := '{}'::uuid[];
  v_id uuid;
  v_instance record;
begin
  v_operator := control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  v_prior := control_plane.replay_request_v1(p_idempotency_key,'tenant.closure');
  if v_prior is not null then
    return query select (select pg_catalog.array_agg(x::uuid)
      from pg_catalog.jsonb_array_elements_text(v_prior->'job_ids') x);
    return;
  end if;
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 10 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  select * into v_tenant from app.tenants t where t.id = p_tenant_id for update;
  if v_tenant.id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  if p_confirmation is distinct from v_tenant.name then
    raise exception using errcode='22023',message='confirmation_mismatch';
  end if;
  if v_tenant.status <> 'suspended' then
    raise exception using errcode='22023',message='suspend_before_closure';
  end if;

  for v_instance in
    select i.id from app.instances i
    where i.tenant_id = p_tenant_id and i.deployment_state <> 'closed'
    order by i.created_at
  loop
    insert into control_plane.jobs(kind,tenant_id,instance_id,parameters,requested_by)
    values ('close_instance',p_tenant_id,v_instance.id,
      pg_catalog.jsonb_build_object('reason_recorded',true),v_operator)
    returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;

  perform control_plane.write_audit_v1(v_operator,'tenant.closure_requested',p_tenant_id,null,
    'tenant',p_tenant_id::text,p_reason,pg_catalog.jsonb_build_object('job_ids',pg_catalog.to_jsonb(v_ids)));
  perform control_plane.remember_request_v1(p_idempotency_key,'tenant.closure',
    pg_catalog.jsonb_build_object('job_ids',pg_catalog.to_jsonb(v_ids)));
  return query select v_ids;
end;
$function$;

-- api_v1 pass-throughs
create or replace function api_v1.create_tenant_v2(p_name text, p_brand_key text, p_idempotency_key text)
returns table (tenant_id uuid, brand_id uuid, instance_id uuid, replayed boolean)
language sql security definer set search_path to ''
as $$ select * from control_plane.create_tenant_v2(p_name,p_brand_key,p_idempotency_key); $$;

create or replace function api_v1.list_tenants_v1(
  p_search text default null, p_status text default null, p_plan_key text default null,
  p_sort text default null, p_limit integer default 25, p_offset integer default 0)
returns table (tenant_id uuid, name text, status text, brand_keys text, plan_key text,
  subscription_state text, instance_count bigint, active_instances bigint,
  provisioning_state text, created_at timestamptz, updated_at timestamptz, total_count bigint)
language sql security definer set search_path to ''
as $$ select * from control_plane.list_tenants_v1(p_search,p_status,p_plan_key,p_sort,p_limit,p_offset); $$;

create or replace function api_v1.get_tenant_v1(p_tenant_id uuid)
returns jsonb
language sql security definer set search_path to ''
as $$ select control_plane.get_tenant_v1(p_tenant_id); $$;

create or replace function api_v1.update_tenant_v1(p_tenant_id uuid, p_name text, p_expected_updated_at timestamptz)
returns table (tenant_id uuid, updated_at timestamptz)
language sql security definer set search_path to ''
as $$ select * from control_plane.update_tenant_v1(p_tenant_id,p_name,p_expected_updated_at); $$;

create or replace function api_v1.set_tenant_status_v1(p_tenant_id uuid, p_status text, p_reason text, p_expected_status text)
returns table (tenant_id uuid, status text, updated_at timestamptz)
language sql security definer set search_path to ''
as $$ select * from control_plane.set_tenant_status_v1(p_tenant_id,p_status,p_reason,p_expected_status); $$;

create or replace function api_v1.request_tenant_closure_v1(p_tenant_id uuid, p_reason text, p_confirmation text, p_idempotency_key text)
returns table (job_ids uuid[])
language sql security definer set search_path to ''
as $$ select * from control_plane.request_tenant_closure_v1(p_tenant_id,p_reason,p_confirmation,p_idempotency_key); $$;

revoke all on all functions in schema control_plane from public,anon,authenticated;
grant execute on function control_plane.contains_no_secret_v1(jsonb) to service_role;

revoke all on function
  api_v1.create_tenant_v2(text,text,text),
  api_v1.list_tenants_v1(text,text,text,text,integer,integer),
  api_v1.get_tenant_v1(uuid),
  api_v1.update_tenant_v1(uuid,text,timestamptz),
  api_v1.set_tenant_status_v1(uuid,text,text,text),
  api_v1.request_tenant_closure_v1(uuid,text,text,text)
from public, anon;
grant execute on function
  api_v1.create_tenant_v2(text,text,text),
  api_v1.list_tenants_v1(text,text,text,text,integer,integer),
  api_v1.get_tenant_v1(uuid),
  api_v1.update_tenant_v1(uuid,text,timestamptz),
  api_v1.set_tenant_status_v1(uuid,text,text,text),
  api_v1.request_tenant_closure_v1(uuid,text,text,text)
to authenticated;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `rtk node scripts/platform-admin-local.mjs replay && rtk node scripts/platform-admin-local.mjs test 2>&1 | tail -40`
Expected: `platform_admin_tenants_test.sql .. ok`; contract test still ok.

- [ ] **Step 5: Commit**

```bash
rtk git add supabase/migrations/20261006130000_platform_admin_tenants.sql supabase/tests/database/platform_admin_tenants_test.sql
rtk git commit -m "Give operators a tenant directory, detail, and audited lifecycle"
```

---

### Task 4: Operations — jobs, provisioning reads/actions, instances, domains, health observations table

**Files:**
- Create: `supabase/migrations/20261006140000_platform_admin_operations.sql`
- Create: `supabase/tests/database/platform_admin_operations_test.sql`

**Interfaces:**
- Produces: `control_plane.enqueue_operator_job_v1(...)` (internal), `control_plane.job_events`, `control_plane.health_observations`; api_v1 `list_jobs_v1`, `get_job_v1`, `cancel_job_v1`, `retry_job_v1`, `approve_operator_job_v1`, `claim_job_v1`*, `complete_job_v1`*, `list_provisioning_runs_v1`, `get_provisioning_run_detail_v1`, `retry_provisioning_run_v1`, `activate_provisioned_instance_v1`, `deactivate_provisioned_instance_v1`, `list_instances_v1`, `get_instance_v1`, `list_domains_v1`, `add_tenant_domain_v1`, `request_domain_verification_v1`, `record_health_observation_v1`* (* = `service_role` only).

- [ ] **Step 1: Write the failing test**

`supabase/tests/database/platform_admin_operations_test.sql` (begin/no_plan, helper block, then):
```sql
-- Fixture: a tenant, its instance in provisioning, and a GitHub installation record.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000a','admin');
select set_config('test.t',(select tenant_id::text from control_plane.create_tenant_v2('Ops Tenant','ops-tenant','ops-tenant-create-0001')),true);
select set_config('test.i',(select id::text from app.instances where tenant_id=current_setting('test.t')::uuid),true);
insert into control_plane.instance_infrastructure(tenant_id,instance_id,provider,resource_kind,external_id)
values (current_setting('test.t')::uuid,current_setting('test.i')::uuid,'github','app_installation','inst-ops-1');

-- Local-step constraint fix: a provider-less step may wait on a missing worker.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000c','operator');
select set_config('test.run',(select run_id::text from control_plane.request_provisioning_v1(
  current_setting('test.t')::uuid,current_setting('test.i')::uuid,'ops-tenant','launch','0.1.0',3,1,1,
  '{"default_locale":"en","timezone":"Asia/Riyadh","currency":"SAR"}','ops-tenant-run-0001')),true);
select pg_temp.as_worker();
select set_config('test.step',(select step_id::text from control_plane.claim_provisioning_step_v1(
  current_setting('test.run')::uuid,120,array['local'])),true);
select lives_ok($$ select * from control_plane.complete_provisioning_step_v1(current_setting('test.step')::uuid,
  'waiting',null,'{}',null,'worker_not_implemented',now()+interval '1 hour') $$,
  'worker_not_implemented is an accepted waiting reason (was a check violation)');

-- Provisioning reads.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000d','viewer');
set local role authenticated;
select is((select count(*)::int from api_v1.list_provisioning_runs_v1('waiting',null,null,10,0)),1,'waiting runs are filterable');
select is((select get_provisioning_run_detail_v1->>'tenant_name' from api_v1.get_provisioning_run_detail_v1(current_setting('test.run')::uuid)),
  'Ops Tenant','run detail names the tenant');
select is((select jsonb_array_length(get_provisioning_run_detail_v1->'steps') from api_v1.get_provisioning_run_detail_v1(current_setting('test.run')::uuid)),
  12,'and carries every step');
select ok((select (get_provisioning_run_detail_v1->'steps'->0) ? 'started_at' from api_v1.get_provisioning_run_detail_v1(current_setting('test.run')::uuid)),
  'steps carry timestamps');
select throws_ok(format($$ select * from api_v1.retry_provisioning_run_v1(%L) $$,current_setting('test.run')),
  '42501','policy_denied','a viewer cannot retry');
reset role;

-- Jobs: list, detail, cancel, retry, approval.
select set_config('test.job',(select j.id::text from control_plane.jobs j where j.kind='provision_instance'
  and j.tenant_id=current_setting('test.t')::uuid),true);
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000c','operator');
set local role authenticated;
select ok((select count(*) from api_v1.list_jobs_v1('queued','provision_instance',null,10,0)) >= 1,'queued jobs list');
select ok((select get_job_v1 ? 'events' from api_v1.get_job_v1(current_setting('test.job')::uuid)),'job detail has events');
select throws_ok(format($$ select * from api_v1.retry_job_v1(%L,'Retry after fix') $$,current_setting('test.job')),
  '22023','transition_not_allowed','a queued job cannot be retried');
select is((select status from api_v1.cancel_job_v1(current_setting('test.job')::uuid,'Superseded by new request')),
  'cancelled','an operator cancels a queued job');
select throws_ok(format($$ select * from api_v1.cancel_job_v1(%L,'again please') $$,current_setting('test.job')),
  '22023','transition_not_allowed','cancelling twice is refused');
reset role;
select is((select count(*)::int from control_plane.job_events where job_id=current_setting('test.job')::uuid and event='cancelled'),
  1,'cancellation is an event');

-- Worker boundary: operators cannot claim; workers claim, fail, and operators retry.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000c','operator');
select set_config('test.job2',control_plane.enqueue_operator_job_v1('c0000000-0000-0000-0000-00000000000c',
  'reconcile_drift',current_setting('test.t')::uuid,current_setting('test.i')::uuid,'{}','reconcile-ops-0001')::text,true);
select is(control_plane.enqueue_operator_job_v1('c0000000-0000-0000-0000-00000000000c',
  'reconcile_drift',current_setting('test.t')::uuid,current_setting('test.i')::uuid,'{}','reconcile-ops-0001')::text,
  current_setting('test.job2'),'enqueueing with the same key returns the same job');
select throws_ok($$ select * from control_plane.claim_job_v1(array['reconcile_drift'],60) $$,'42501','policy_denied',
  'an operator session cannot claim a job');
select pg_temp.as_worker();
select is((select job_id::text from control_plane.claim_job_v1(array['reconcile_drift'],60)),current_setting('test.job2'),'a worker claims it');
select is((select status from control_plane.complete_job_v1(current_setting('test.job2')::uuid,'failed','provider_timeout')),'failed','and reports failure');
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000c','operator');
set local role authenticated;
select throws_ok(format($$ select * from api_v1.cancel_job_v1(%L,'x') $$,current_setting('test.job2')),
  '22023','reason_required','cancelling needs a reason');
select is((select status from api_v1.retry_job_v1(current_setting('test.job2')::uuid,'Provider recovered')),'queued','an operator retries a failed job');
reset role;

-- Destructive approval needs a different admin with step-up.
insert into control_plane.jobs(kind,tenant_id,instance_id,requested_by)
values ('close_instance',current_setting('test.t')::uuid,current_setting('test.i')::uuid,'c0000000-0000-0000-0000-00000000000a');
select set_config('test.close',(select id::text from control_plane.jobs where kind='close_instance' and tenant_id=current_setting('test.t')::uuid),true);
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000a','admin',30);
set local role authenticated;
select throws_ok(format($$ select * from api_v1.approve_operator_job_v1(%L) $$,current_setting('test.close')),
  '42501','second_operator_required','the requester cannot approve');
reset role;
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000b','admin',3600);
set local role authenticated;
select throws_ok(format($$ select * from api_v1.approve_operator_job_v1(%L) $$,current_setting('test.close')),
  '42501','recent_authentication_required','approval needs step-up');
reset role;
select pg_temp.claims('c0000000-0000-0000-0000-00000000000b','aal2',30);
set local role authenticated;
select lives_ok(format($$ select * from api_v1.approve_operator_job_v1(%L) $$,current_setting('test.close')),'a second recent admin approves');
select lives_ok(format($$ select * from api_v1.cancel_job_v1(%L,'Customer renewed contract') $$,current_setting('test.close')),
  'an approved or unapproved destructive job can still be cancelled');
reset role;

-- Instances and domains.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000d','viewer');
set local role authenticated;
select ok((select count(*) from api_v1.list_instances_v1('ops',null,null,null,10,0)) = 1,'instances are searchable by tenant');
select is((select health_status from api_v1.list_instances_v1('ops',null,null,null,10,0)),null,
  'an instance nobody observed has no health status — never "healthy"');
select ok((select get_instance_v1 ? 'infrastructure' from api_v1.get_instance_v1(current_setting('test.i')::uuid)),'instance detail has infrastructure');
reset role;

select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000c','operator');
set local role authenticated;
select throws_ok(format($$ select * from api_v1.add_tenant_domain_v1(%L,%L,'Not A Host','client','domain-ops-0000000001') $$,
  current_setting('test.t'),current_setting('test.i')),'22023','hostname_invalid','a malformed hostname is refused');
select set_config('test.domain',(select domain_id::text from api_v1.add_tenant_domain_v1(current_setting('test.t')::uuid,
  current_setting('test.i')::uuid,'book.ops-tenant.example','client','domain-ops-0000000001')),true);
select is((select domain_id::text from api_v1.add_tenant_domain_v1(current_setting('test.t')::uuid,
  current_setting('test.i')::uuid,'book.ops-tenant.example','client','domain-ops-0000000001')),current_setting('test.domain'),
  'adding the same domain twice with one key is idempotent');
select is((select verification_status from api_v1.list_domains_v1('book.ops',null,10,0)),'pending','a new domain is pending, never verified');
select is((select certificate_status from api_v1.list_domains_v1('book.ops',null,10,0)),null,'certificate status is unknown until a worker reports');
select is((select job_id from api_v1.request_domain_verification_v1(current_setting('test.domain')::uuid)),
  (select job_id from api_v1.request_domain_verification_v1(current_setting('test.domain')::uuid)),
  'a second verification request reuses the queued job');
reset role;

-- Health observations: worker-only writes, secret-free.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000a','admin');
select throws_ok(format($$ select control_plane.record_health_observation_v1('instance',%L,%L,'client','http_health','healthy',null,'{}',now()) $$,
  current_setting('test.t'),current_setting('test.i')),'42501','policy_denied','an operator cannot invent an observation');
select pg_temp.as_worker();
select lives_ok(format($$ select control_plane.record_health_observation_v1('instance',%L,%L,'client','http_health','failing','http_503','{}',now()) $$,
  current_setting('test.t'),current_setting('test.i')),'a worker records one');
select throws_ok(format($$ select control_plane.record_health_observation_v1('instance',%L,%L,'client','http_health','failing',null,'{"h":"Bearer abc"}',now()) $$,
  current_setting('test.t'),current_setting('test.i')),'22023','secret_rejected','secret-shaped detail is refused');

-- Deactivation is admin + step-up and audited.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000c','operator');
set local role authenticated;
select throws_ok(format($$ select * from api_v1.deactivate_provisioned_instance_v1(%L,'Tenant asked to stop') $$,current_setting('test.run')),
  '42501','policy_denied','an operator cannot deactivate');
reset role;
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000a','admin',30);
set local role authenticated;
select is((select run_state from api_v1.deactivate_provisioned_instance_v1(current_setting('test.run')::uuid,'Tenant asked to stop')),
  'deactivated','a recent admin deactivates');
reset role;

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to verify it fails**

Run: `rtk node scripts/platform-admin-local.mjs test 2>&1 | grep -A5 platform_admin_operations`
Expected: FAIL — first failure at the `worker_not_implemented` waiting step (check violation) or missing functions.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261006140000_platform_admin_operations.sql`:
```sql
-- Platform Admin completion, part 3: jobs, provisioning, instances, domains.
--
-- Jobs gain an event timeline, idempotency keys, cancellation and retry, and a
-- worker-only claim/complete pair so the boundary an external worker will use
-- is real and tested even where no worker runs yet. A queued job that no worker
-- has claimed is shown as exactly that; nothing here marks external work done.
--
-- Also fixes 20260930160000: execute_local_provisioning_steps_v1 parks steps
-- with waiting_reason 'worker_not_implemented', which the check constraints on
-- provisioning_steps and provisioning_runs did not allow.

-- ---------------------------------------------------------------------------
-- 0. Waiting-reason fix
-- ---------------------------------------------------------------------------
do $$
declare v_table text; v_name text;
begin
  foreach v_table in array array['provisioning_steps','provisioning_runs'] loop
    select c.conname into v_name from pg_catalog.pg_constraint c
    where c.conrelid = ('control_plane.' || v_table)::regclass and c.contype = 'c'
      and pg_catalog.pg_get_constraintdef(c.oid) like '%customer_dns%';
    execute format('alter table control_plane.%I drop constraint %I', v_table, v_name);
    execute format('alter table control_plane.%I add constraint %I check (waiting_reason is null or waiting_reason in '
      '(''customer_dns'',''external_approval'',''provider_rate_limit'',''provider_outage'',''worker_not_implemented''))',
      v_table, v_table || '_waiting_reason_check');
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Jobs: kinds, keys, cancellation, events
-- ---------------------------------------------------------------------------
do $$
declare v_name text;
begin
  select c.conname into v_name from pg_catalog.pg_constraint c
  where c.conrelid = 'control_plane.jobs'::regclass and c.contype = 'c'
    and pg_catalog.pg_get_constraintdef(c.oid) like '%provision_instance%';
  execute format('alter table control_plane.jobs drop constraint %I', v_name);

  select c.conname into v_name from pg_catalog.pg_constraint c
  where c.conrelid = 'control_plane.jobs'::regclass and c.contype = 'c'
    and pg_catalog.pg_get_constraintdef(c.oid) like '%approved_by IS NOT NULL%';
  execute format('alter table control_plane.jobs drop constraint %I', v_name);
end $$;

alter table control_plane.jobs
  add constraint jobs_kind_check check (kind in (
    'provision_instance','seed_repository','provision_domains','publish_release',
    'rotate_secret','suspend_instance','close_instance','reconcile_drift',
    'verify_domain','check_integration')),
  -- Cancelling an unapproved destructive job must be possible: it is the safe way out.
  add constraint jobs_destructive_approval_check check (
    kind not in ('close_instance','rotate_secret') or approved_by is not null
    or status in ('queued','cancelled')),
  add column idempotency_key text unique
    check (idempotency_key is null or idempotency_key ~ '^[A-Za-z0-9:_.-]{8,200}$'),
  add column started_at timestamptz,
  add column cancelled_by uuid,
  add column cancelled_at timestamptz,
  add column reason text check (reason is null or pg_catalog.char_length(reason) between 1 and 500);
create index jobs_status_created_idx on control_plane.jobs (status, created_at desc);

create table control_plane.job_events (
  id bigint generated always as identity primary key,
  job_id uuid not null references control_plane.jobs(id) on delete restrict,
  event text not null check (event in (
    'enqueued','approved','claimed','succeeded','failed','retried','cancelled')),
  attempt integer check (attempt is null or attempt >= 0),
  error_code text check (error_code is null or pg_catalog.char_length(error_code) between 1 and 80),
  actor_id uuid,
  occurred_at timestamptz not null default pg_catalog.statement_timestamp()
);
create index job_events_job_idx on control_plane.job_events (job_id, id);
create trigger job_events_append_only
  before update or delete on control_plane.job_events
  for each row execute function private.enforce_append_only();
alter table control_plane.job_events enable row level security;
create policy job_events_no_application_access on control_plane.job_events
  for all to anon,authenticated using (false) with check (false);
revoke all on control_plane.job_events from public,anon,authenticated;

create or replace function control_plane.enqueue_operator_job_v1(
  p_operator uuid, p_kind text, p_tenant_id uuid, p_instance_id uuid,
  p_parameters jsonb, p_idempotency_key text, p_reason text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
begin
  if not control_plane.contains_no_secret_v1(coalesce(p_parameters,'{}'::jsonb)) then
    raise exception using errcode='22023',message='secret_rejected';
  end if;
  insert into control_plane.jobs(kind,tenant_id,instance_id,parameters,requested_by,idempotency_key,reason)
  values (p_kind,p_tenant_id,p_instance_id,coalesce(p_parameters,'{}'::jsonb),p_operator,
    p_idempotency_key,nullif(pg_catalog.btrim(p_reason),''))
  on conflict (idempotency_key) do nothing
  returning id into v_id;
  if v_id is null then
    select j.id into v_id from control_plane.jobs j where j.idempotency_key = p_idempotency_key;
    return v_id;
  end if;
  insert into control_plane.job_events(job_id,event,actor_id) values (v_id,'enqueued',p_operator);
  perform control_plane.write_audit_v1(p_operator,'job.enqueued',p_tenant_id,p_instance_id,'job',
    v_id::text,p_reason,pg_catalog.jsonb_build_object('kind',p_kind,'job_id',v_id));
  return v_id;
end;
$function$;

create or replace function control_plane.list_jobs_v1(
  p_status text default null, p_kind text default null, p_tenant_id uuid default null,
  p_limit integer default 25, p_offset integer default 0)
returns table (job_id uuid, kind text, status text, tenant_id uuid, tenant_name text,
  instance_id uuid, attempts integer, last_error_code text, requested_by_email text,
  approved_by_email text, needs_approval boolean, created_at timestamptz,
  updated_at timestamptz, completed_at timestamptz, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  perform control_plane.require_operator_v1('viewer');
  return query
  select j.id, j.kind, j.status, j.tenant_id, t.name, j.instance_id, j.attempts, j.last_error_code,
    ro.email, ao.email,
    (j.kind in ('close_instance','rotate_secret') and j.approved_by is null and j.status = 'queued'),
    j.created_at, j.updated_at, j.completed_at, pg_catalog.count(*) over ()
  from control_plane.jobs j
  left join app.tenants t on t.id = j.tenant_id
  left join control_plane.operators ro on ro.auth_user_id = j.requested_by
  left join control_plane.operators ao on ao.auth_user_id = j.approved_by
  where (p_status is null or j.status = p_status
         or (p_status = 'awaiting_approval' and j.kind in ('close_instance','rotate_secret')
             and j.approved_by is null and j.status = 'queued'))
    and (p_kind is null or j.kind = p_kind)
    and (p_tenant_id is null or j.tenant_id = p_tenant_id)
  order by j.created_at desc, j.id
  limit least(greatest(coalesce(p_limit,25),1),100) offset greatest(coalesce(p_offset,0),0);
end;
$function$;

create or replace function control_plane.get_job_v1(p_job_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_doc jsonb;
begin
  perform control_plane.require_operator_v1('viewer');
  select pg_catalog.jsonb_build_object(
    'id',j.id,'kind',j.kind,'status',j.status,'tenant_id',j.tenant_id,'tenant_name',t.name,
    'instance_id',j.instance_id,'attempts',j.attempts,'last_error_code',j.last_error_code,
    'parameters',control_plane.audit_detail_summary_v1(j.parameters),
    'requested_by_email',ro.email,'approved_by_email',ao.email,'reason',j.reason,
    'needs_approval',j.kind in ('close_instance','rotate_secret') and j.approved_by is null and j.status = 'queued',
    'locked_until',j.locked_until,'created_at',j.created_at,'started_at',j.started_at,
    'updated_at',j.updated_at,'completed_at',j.completed_at,'cancelled_at',j.cancelled_at,
    'events',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'event',e.event,'attempt',e.attempt,'error_code',e.error_code,
        'actor_email',eo.email,'at',e.occurred_at) order by e.id)
      from control_plane.job_events e
      left join control_plane.operators eo on eo.auth_user_id = e.actor_id
      where e.job_id = j.id),'[]'::jsonb))
  into v_doc
  from control_plane.jobs j
  left join app.tenants t on t.id = j.tenant_id
  left join control_plane.operators ro on ro.auth_user_id = j.requested_by
  left join control_plane.operators ao on ao.auth_user_id = j.approved_by
  where j.id = p_job_id;
  if v_doc is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  return v_doc;
end;
$function$;

create or replace function control_plane.cancel_job_v1(p_job_id uuid, p_reason text)
returns table (job_id uuid, status text)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_job control_plane.jobs%rowtype;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  v_operator := control_plane.require_operator_v1('operator');
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 5 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  select * into v_job from control_plane.jobs j where j.id = p_job_id for update;
  if v_job.id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  if v_job.status = 'running' then
    raise exception using errcode='22023',message='job_running';
  end if;
  if v_job.status not in ('queued','failed') then
    raise exception using errcode='22023',message='transition_not_allowed';
  end if;
  update control_plane.jobs j set status = 'cancelled', cancelled_by = v_operator,
    cancelled_at = v_now, locked_until = null, updated_at = v_now
  where j.id = p_job_id;
  insert into control_plane.job_events(job_id,event,actor_id) values (p_job_id,'cancelled',v_operator);
  perform control_plane.write_audit_v1(v_operator,'job.cancelled',v_job.tenant_id,v_job.instance_id,
    'job',p_job_id::text,p_reason,pg_catalog.jsonb_build_object('kind',v_job.kind,'from',v_job.status));
  return query select p_job_id,'cancelled'::text;
end;
$function$;

create or replace function control_plane.retry_job_v1(p_job_id uuid, p_reason text)
returns table (job_id uuid, status text)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_job control_plane.jobs%rowtype;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  v_operator := control_plane.require_operator_v1('operator');
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 5 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  select * into v_job from control_plane.jobs j where j.id = p_job_id for update;
  if v_job.id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  if v_job.status <> 'failed' then
    raise exception using errcode='22023',message='transition_not_allowed';
  end if;
  if v_job.attempts >= 20 then
    raise exception using errcode='22023',message='attempts_exhausted';
  end if;
  -- A destructive job that failed is re-approved, not silently re-run.
  update control_plane.jobs j set status = 'queued', locked_until = null, last_error_code = null,
    completed_at = null, updated_at = v_now,
    approved_by = case when j.kind in ('close_instance','rotate_secret') then null else j.approved_by end
  where j.id = p_job_id;
  insert into control_plane.job_events(job_id,event,actor_id,attempt) values (p_job_id,'retried',v_operator,v_job.attempts);
  perform control_plane.write_audit_v1(v_operator,'job.retried',v_job.tenant_id,v_job.instance_id,
    'job',p_job_id::text,p_reason,pg_catalog.jsonb_build_object('kind',v_job.kind));
  return query select p_job_id,'queued'::text;
end;
$function$;

create or replace function control_plane.approve_operator_job_v1(p_job_id uuid)
returns table (job_id uuid, status text)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
begin
  v_operator := control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  perform control_plane.approve_job_v1(p_job_id);
  insert into control_plane.job_events(job_id,event,actor_id) values (p_job_id,'approved',v_operator);
  return query select p_job_id,'queued'::text;
end;
$function$;

-- The worker side. Destructive jobs are claimable only once approved.
create or replace function control_plane.claim_job_v1(p_kinds text[] default null, p_lock_seconds integer default 300)
returns table (job_id uuid, kind text, tenant_id uuid, instance_id uuid, parameters jsonb, attempt integer)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_job control_plane.jobs%rowtype;
begin
  if not control_plane.is_worker_v1() then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  select * into v_job from control_plane.jobs j
  where (j.status = 'queued' or (j.status = 'running' and j.locked_until < v_now))
    and (p_kinds is null or j.kind = any(p_kinds))
    and (j.kind not in ('close_instance','rotate_secret') or j.approved_by is not null)
    and j.attempts < 20
  order by j.created_at
  for update skip locked
  limit 1;
  if v_job.id is null then
    return;
  end if;
  update control_plane.jobs j set status = 'running', attempts = j.attempts + 1,
    started_at = coalesce(j.started_at,v_now),
    locked_until = v_now + pg_catalog.make_interval(secs => greatest(coalesce(p_lock_seconds,300),30)),
    updated_at = v_now
  where j.id = v_job.id
  returning * into v_job;
  insert into control_plane.job_events(job_id,event,attempt) values (v_job.id,'claimed',v_job.attempts);
  return query select v_job.id,v_job.kind,v_job.tenant_id,v_job.instance_id,v_job.parameters,v_job.attempts;
end;
$function$;

create or replace function control_plane.complete_job_v1(p_job_id uuid, p_outcome text, p_error_code text default null)
returns table (job_id uuid, status text)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_job control_plane.jobs%rowtype;
begin
  if not control_plane.is_worker_v1() then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  if p_outcome not in ('succeeded','failed')
     or (p_error_code is not null and p_error_code !~ '^[a-z][a-z0-9_]{2,60}$') then
    raise exception using errcode='22023',message='transition_not_allowed';
  end if;
  select * into v_job from control_plane.jobs j where j.id = p_job_id for update;
  if v_job.id is null or v_job.status <> 'running' then
    raise exception using errcode='22023',message='transition_not_allowed';
  end if;
  update control_plane.jobs j set status = p_outcome, locked_until = null,
    last_error_code = case when p_outcome = 'failed' then coalesce(p_error_code,'unknown_error') end,
    completed_at = case when p_outcome = 'succeeded' then v_now end, updated_at = v_now
  where j.id = p_job_id;
  insert into control_plane.job_events(job_id,event,attempt,error_code)
  values (p_job_id,p_outcome,v_job.attempts,p_error_code);
  return query select p_job_id,p_outcome;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Provisioning reads and operator actions
-- ---------------------------------------------------------------------------
create or replace function control_plane.list_provisioning_runs_v1(
  p_state text default null, p_tenant_id uuid default null, p_search text default null,
  p_limit integer default 25, p_offset integer default 0)
returns table (run_id uuid, tenant_id uuid, tenant_name text, instance_id uuid, slug text,
  plan_key text, state text, waiting_reason text, last_error_code text, desired_release text,
  steps_total bigint, steps_succeeded bigint, steps_failed bigint,
  created_at timestamptz, updated_at timestamptz, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  perform control_plane.require_operator_v1('viewer');
  return query
  select r.id, r.tenant_id, t.name, r.instance_id, r.slug, r.plan_key, r.state, r.waiting_reason,
    r.last_error_code, r.desired_release,
    (select pg_catalog.count(*) from control_plane.provisioning_steps s where s.run_id = r.id),
    (select pg_catalog.count(*) from control_plane.provisioning_steps s where s.run_id = r.id and s.status = 'succeeded'),
    (select pg_catalog.count(*) from control_plane.provisioning_steps s where s.run_id = r.id and s.status = 'failed'),
    r.created_at, r.updated_at, pg_catalog.count(*) over ()
  from control_plane.provisioning_runs r
  join app.tenants t on t.id = r.tenant_id
  where (p_state is null or r.state = p_state
         or (p_state = 'waiting' and r.waiting_reason is not null)
         or (p_state = 'in_progress' and r.state not in ('active','failed','deactivated')))
    and (p_tenant_id is null or r.tenant_id = p_tenant_id)
    and (coalesce(pg_catalog.btrim(p_search),'') = ''
      or pg_catalog.strpos(r.slug, pg_catalog.lower(pg_catalog.btrim(p_search))) > 0
      or pg_catalog.strpos(pg_catalog.lower(t.name), pg_catalog.lower(pg_catalog.btrim(p_search))) > 0)
  order by r.updated_at desc, r.id
  limit least(greatest(coalesce(p_limit,25),1),100) offset greatest(coalesce(p_offset,0),0);
end;
$function$;

create or replace function control_plane.get_provisioning_run_detail_v1(p_run_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_doc jsonb;
begin
  perform control_plane.require_operator_v1('viewer');
  select pg_catalog.jsonb_build_object(
    'id',r.id,'tenant_id',r.tenant_id,'tenant_name',t.name,'instance_id',r.instance_id,
    'slug',r.slug,'plan_key',r.plan_key,'state',r.state,'waiting_reason',r.waiting_reason,
    'last_error_code',r.last_error_code,'desired_release',r.desired_release,
    'config_schema_version',r.config_schema_version,
    'backend_contract_min',r.backend_contract_min,'backend_contract_max',r.backend_contract_max,
    'requested_by_email',o.email,'activated_at',r.activated_at,'deactivated_at',r.deactivated_at,
    'deactivation_reason',r.deactivation_reason,'created_at',r.created_at,'updated_at',r.updated_at,
    'steps',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'step_key',s.step_key,'order',s.step_order,'provider',s.provider,'required',s.required,
        'status',s.status,'attempts',s.attempts,'max_attempts',s.max_attempts,
        'external_id',s.external_id,'waiting_reason',s.waiting_reason,'error_code',s.last_error_code,
        'retry_after',s.retry_after,'locked_until',s.locked_until,'started_at',s.started_at,
        'last_success_at',s.last_success_at,'updated_at',s.updated_at) order by s.step_order)
      from control_plane.provisioning_steps s where s.run_id = r.id),'[]'::jsonb),
    'timeline',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'at',e.occurred_at,'event',e.event,'step_key',e.step_key,'attempt',e.attempt,
        'error_code',e.error_code,'detail',control_plane.audit_detail_summary_v1(e.detail)) order by e.id)
      from control_plane.provisioning_events e where e.run_id = r.id),'[]'::jsonb))
  into v_doc
  from control_plane.provisioning_runs r
  join app.tenants t on t.id = r.tenant_id
  left join control_plane.operators o on o.auth_user_id = r.requested_by
  where r.id = p_run_id;
  if v_doc is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  return v_doc;
end;
$function$;

create or replace function control_plane.activate_provisioned_instance_v1(p_run_id uuid)
returns table (activated boolean, run_state text, blocked text[])
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_result record;
  v_run control_plane.provisioning_runs%rowtype;
begin
  v_operator := control_plane.require_operator_v1('operator');
  select * into v_run from control_plane.provisioning_runs r where r.id = p_run_id;
  if v_run.id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  select a.activated, a.run_state, a.blocked into v_result
  from control_plane.activate_instance_v1(p_run_id) a;
  perform control_plane.write_audit_v1(v_operator,'provisioning.activation_requested',
    v_run.tenant_id,v_run.instance_id,'provisioning_run',p_run_id::text,null,
    pg_catalog.jsonb_build_object('blocked',pg_catalog.to_jsonb(v_result.blocked)),
    case when v_result.activated then 'succeeded' else 'failed' end);
  return query select v_result.activated, v_result.run_state, v_result.blocked;
end;
$function$;

create or replace function control_plane.deactivate_provisioned_instance_v1(p_run_id uuid, p_reason text)
returns table (run_state text, resources_deactivated integer)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  perform control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 10 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  -- deactivate_instance_v1 writes its own audit row with the reason.
  return query select * from control_plane.deactivate_instance_v1(p_run_id,p_reason);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Health observations (written by workers; read in part 6)
-- ---------------------------------------------------------------------------
create table control_plane.health_observations (
  id bigint generated always as identity primary key,
  subject_kind text not null check (subject_kind in ('instance','integration')),
  tenant_id uuid references app.tenants(id) on delete restrict,
  instance_id uuid,
  subject_key text not null check (subject_key ~ '^[a-z][a-z0-9_]{1,40}$'),
  signal text not null check (signal ~ '^[a-z][a-z0-9_]{1,40}$'),
  status text not null check (status in ('healthy','degraded','failing')),
  error_code text check (error_code is null or error_code ~ '^[a-z][a-z0-9_]{2,60}$'),
  detail jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(detail) = 'object'),
  observed_at timestamptz not null,
  recorded_at timestamptz not null default pg_catalog.statement_timestamp(),
  foreign key (tenant_id,instance_id) references app.instances(tenant_id,id) on delete restrict,
  check ((subject_kind = 'instance') = (instance_id is not null)),
  check (control_plane.contains_no_secret_v1(detail))
);
create index health_observations_latest_idx
  on control_plane.health_observations (subject_kind, instance_id, subject_key, signal, observed_at desc);
create trigger health_observations_append_only
  before update or delete on control_plane.health_observations
  for each row execute function private.enforce_append_only();
alter table control_plane.health_observations enable row level security;
create policy health_observations_no_application_access on control_plane.health_observations
  for all to anon,authenticated using (false) with check (false);
revoke all on control_plane.health_observations from public,anon,authenticated;

create or replace function control_plane.record_health_observation_v1(
  p_subject_kind text, p_tenant_id uuid, p_instance_id uuid, p_subject_key text,
  p_signal text, p_status text, p_error_code text, p_detail jsonb, p_observed_at timestamptz)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_id bigint;
begin
  if not control_plane.is_worker_v1() then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  if not control_plane.contains_no_secret_v1(coalesce(p_detail,'{}'::jsonb)) then
    raise exception using errcode='22023',message='secret_rejected';
  end if;
  if p_observed_at is null or p_observed_at > pg_catalog.statement_timestamp() + interval '5 minutes' then
    raise exception using errcode='22023',message='transition_not_allowed';
  end if;
  insert into control_plane.health_observations(subject_kind,tenant_id,instance_id,subject_key,
    signal,status,error_code,detail,observed_at)
  values (p_subject_kind,p_tenant_id,p_instance_id,p_subject_key,p_signal,p_status,p_error_code,
    coalesce(p_detail,'{}'::jsonb),p_observed_at)
  returning id into v_id;
  return v_id;
end;
$function$;

-- Worst latest status across an instance's signals, or null when unobserved.
create or replace function control_plane.instance_health_v1(p_instance_id uuid)
returns table (status text, observed_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with latest as (
    select distinct on (h.subject_key,h.signal) h.status, h.observed_at
    from control_plane.health_observations h
    where h.subject_kind = 'instance' and h.instance_id = p_instance_id
    order by h.subject_key, h.signal, h.observed_at desc)
  select (select l.status from latest l
          order by case l.status when 'failing' then 1 when 'degraded' then 2 else 3 end limit 1),
         (select pg_catalog.min(l.observed_at) from latest l);
$$;

-- ---------------------------------------------------------------------------
-- 4. Instances
-- ---------------------------------------------------------------------------
create or replace function control_plane.list_instances_v1(
  p_search text default null, p_state text default null, p_ring text default null,
  p_drift boolean default null, p_limit integer default 25, p_offset integer default 0)
returns table (instance_id uuid, tenant_id uuid, tenant_name text, tenant_status text,
  deployment_state text, rollout_ring text, desired_release text, current_release text,
  release_drifted boolean, infrastructure_total bigint, infrastructure_failing bigint,
  infrastructure_drifted bigint, health_status text, health_observed_at timestamptz,
  created_at timestamptz, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  perform control_plane.require_operator_v1('viewer');
  return query
  with base as (
    select i.id, i.tenant_id, t.name, t.status as tenant_status, i.deployment_state,
      s.rollout_ring, r.desired_release, r.current_release,
      (r.desired_release is distinct from r.current_release) as release_drifted,
      (select pg_catalog.count(*) from control_plane.instance_infrastructure f
        where f.tenant_id = i.tenant_id and f.instance_id = i.id) as infra_total,
      (select pg_catalog.count(*) from control_plane.instance_infrastructure f
        where f.tenant_id = i.tenant_id and f.instance_id = i.id and f.last_error_code is not null) as infra_failing,
      (select pg_catalog.count(*) from control_plane.instance_infrastructure f
        where f.tenant_id = i.tenant_id and f.instance_id = i.id
          and exists (select 1 from pg_catalog.jsonb_each(f.desired_state) d
                      where f.observed_state -> d.key is distinct from d.value)) as infra_drifted,
      h.status as health_status, h.observed_at as health_observed_at, i.created_at
    from app.instances i
    join app.tenants t on t.id = i.tenant_id
    left join control_plane.subscriptions s on s.tenant_id = i.tenant_id
    left join control_plane.instance_release_state r on r.tenant_id = i.tenant_id and r.instance_id = i.id
    left join lateral control_plane.instance_health_v1(i.id) h on true
  )
  select b.id, b.tenant_id, b.name, b.tenant_status, b.deployment_state, b.rollout_ring,
    b.desired_release, b.current_release, b.release_drifted, b.infra_total, b.infra_failing,
    b.infra_drifted, b.health_status, b.health_observed_at, b.created_at, pg_catalog.count(*) over ()
  from base b
  where (p_state is null or b.deployment_state = p_state)
    and (p_ring is null or b.rollout_ring = p_ring)
    and (p_drift is null or (p_drift = (b.release_drifted or b.infra_drifted > 0)))
    and (coalesce(pg_catalog.btrim(p_search),'') = ''
      or pg_catalog.strpos(pg_catalog.lower(b.name), pg_catalog.lower(pg_catalog.btrim(p_search))) > 0
      or b.id::text = pg_catalog.btrim(p_search))
  order by b.name, b.created_at, b.id
  limit least(greatest(coalesce(p_limit,25),1),100) offset greatest(coalesce(p_offset,0),0);
end;
$function$;

create or replace function control_plane.get_instance_v1(p_instance_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_doc jsonb;
begin
  perform control_plane.require_operator_v1('viewer');
  select pg_catalog.jsonb_build_object(
    'id',i.id,'tenant_id',i.tenant_id,'tenant_name',t.name,'deployment_state',i.deployment_state,
    'brand_published',i.published_brand_revision_id is not null,'created_at',i.created_at,
    'release',(select pg_catalog.jsonb_build_object('desired_release',r.desired_release,
        'current_release',r.current_release,'config_schema_version',r.config_schema_version,
        'customization_tier',r.customization_tier,'supported_backend_min',r.supported_backend_min,
        'supported_backend_max',r.supported_backend_max,
        'environment_verified',r.environment_fingerprint is not null,'reported_at',r.reported_at)
      from control_plane.instance_release_state r where r.tenant_id = i.tenant_id and r.instance_id = i.id),
    'infrastructure',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',f.id,'provider',f.provider,'resource_kind',f.resource_kind,'external_id',f.external_id,
        'desired_state',f.desired_state,'observed_state',f.observed_state,
        'drifted',exists (select 1 from pg_catalog.jsonb_each(f.desired_state) d
                          where f.observed_state -> d.key is distinct from d.value),
        'observed_at',f.observed_at,'attempts',f.attempts,'last_success_at',f.last_success_at,
        'last_error_code',f.last_error_code) order by f.provider,f.resource_kind)
      from control_plane.instance_infrastructure f
      where f.tenant_id = i.tenant_id and f.instance_id = i.id),'[]'::jsonb),
    'health',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'subject_key',h.subject_key,'signal',h.signal,'status',h.status,'error_code',h.error_code,
        'observed_at',h.observed_at))
      from (select distinct on (h.subject_key,h.signal) h.*
            from control_plane.health_observations h
            where h.subject_kind = 'instance' and h.instance_id = i.id
            order by h.subject_key,h.signal,h.observed_at desc) h),'[]'::jsonb),
    'domains',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',d.id,'hostname',d.hostname,'application',d.application,'kind',d.kind,
        'verification_status',d.verification_status,'active',d.active) order by d.hostname)
      from app.tenant_domains d where d.tenant_id = i.tenant_id and d.instance_id = i.id),'[]'::jsonb),
    'runs',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',r.id,'state',r.state,'slug',r.slug,'updated_at',r.updated_at))
      from control_plane.provisioning_runs r where r.instance_id = i.id),'[]'::jsonb))
  into v_doc
  from app.instances i join app.tenants t on t.id = i.tenant_id
  where i.id = p_instance_id;
  if v_doc is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  return v_doc;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Domains
-- ---------------------------------------------------------------------------
create or replace function control_plane.list_domains_v1(
  p_search text default null, p_status text default null,
  p_limit integer default 25, p_offset integer default 0)
returns table (domain_id uuid, hostname text, tenant_id uuid, tenant_name text, instance_id uuid,
  application text, kind text, verification_status text, verified_at timestamptz, active boolean,
  certificate_status text, certificate_observed_at timestamptz, pending_job_id uuid,
  created_at timestamptz, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  perform control_plane.require_operator_v1('viewer');
  return query
  select d.id, d.hostname, d.tenant_id, t.name, d.instance_id, d.application, d.kind,
    d.verification_status, d.verified_at, d.active,
    -- Only what a worker reported. Null renders as "Not reported".
    f.observed_state->>'certificate_status', f.observed_at,
    (select j.id from control_plane.jobs j where j.kind = 'verify_domain'
       and j.status in ('queued','running') and j.parameters->>'domain_id' = d.id::text
       order by j.created_at desc limit 1),
    d.created_at, pg_catalog.count(*) over ()
  from app.tenant_domains d
  join app.tenants t on t.id = d.tenant_id
  left join control_plane.instance_infrastructure f
    on f.provider = 'vercel' and f.resource_kind = 'domain' and f.tenant_id = d.tenant_id
   and f.observed_state->>'hostname' = d.hostname
  where (p_status is null or d.verification_status = p_status)
    and (coalesce(pg_catalog.btrim(p_search),'') = ''
      or pg_catalog.strpos(d.hostname, pg_catalog.lower(pg_catalog.btrim(p_search))) > 0
      or pg_catalog.strpos(pg_catalog.lower(t.name), pg_catalog.lower(pg_catalog.btrim(p_search))) > 0)
  order by d.hostname
  limit least(greatest(coalesce(p_limit,25),1),100) offset greatest(coalesce(p_offset,0),0);
end;
$function$;

create or replace function control_plane.request_domain_verification_v1(p_domain_id uuid)
returns table (job_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_domain app.tenant_domains%rowtype;
  v_existing uuid;
  v_attempt bigint;
begin
  v_operator := control_plane.require_operator_v1('operator');
  select * into v_domain from app.tenant_domains d where d.id = p_domain_id for update;
  if v_domain.id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  select j.id into v_existing from control_plane.jobs j
  where j.kind = 'verify_domain' and j.status in ('queued','running')
    and j.parameters->>'domain_id' = p_domain_id::text
  limit 1;
  if v_existing is not null then
    return query select v_existing;
    return;
  end if;
  select pg_catalog.count(*) + 1 into v_attempt from control_plane.jobs j
  where j.kind = 'verify_domain' and j.parameters->>'domain_id' = p_domain_id::text;
  return query select control_plane.enqueue_operator_job_v1(v_operator,'verify_domain',
    v_domain.tenant_id,v_domain.instance_id,
    pg_catalog.jsonb_build_object('domain_id',p_domain_id,'hostname',v_domain.hostname),
    'verify_domain:' || p_domain_id::text || ':' || v_attempt::text);
end;
$function$;

create or replace function control_plane.add_tenant_domain_v1(
  p_tenant_id uuid, p_instance_id uuid, p_hostname text, p_application text, p_idempotency_key text)
returns table (domain_id uuid, job_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_prior jsonb;
  v_hostname text := pg_catalog.lower(pg_catalog.btrim(p_hostname));
  v_id uuid := pg_catalog.gen_random_uuid();
  v_job uuid;
begin
  v_operator := control_plane.require_operator_v1('operator');
  v_prior := control_plane.replay_request_v1(p_idempotency_key,'domain.add');
  if v_prior is not null then
    return query select (v_prior->>'domain_id')::uuid,(v_prior->>'job_id')::uuid;
    return;
  end if;
  if v_hostname is null or pg_catalog.char_length(v_hostname) not between 4 and 253
     or v_hostname !~ '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$' then
    raise exception using errcode='22023',message='hostname_invalid';
  end if;
  if p_application not in ('client','dashboard') then
    raise exception using errcode='22023',message='settings_invalid';
  end if;
  if not exists (select 1 from app.instances i where i.tenant_id = p_tenant_id and i.id = p_instance_id) then
    raise exception using errcode='P0002',message='not_found';
  end if;
  if exists (select 1 from app.tenant_domains d where d.hostname = v_hostname) then
    raise exception using errcode='23505',message='domain_taken';
  end if;

  insert into app.tenant_domains(id,tenant_id,instance_id,hostname,application,kind,verification_status,active)
  values (v_id,p_tenant_id,p_instance_id,v_hostname,p_application,'production','pending',false);
  v_job := control_plane.enqueue_operator_job_v1(v_operator,'verify_domain',p_tenant_id,p_instance_id,
    pg_catalog.jsonb_build_object('domain_id',v_id,'hostname',v_hostname),
    'verify_domain:' || v_id::text || ':1');
  perform control_plane.write_audit_v1(v_operator,'domain.added',p_tenant_id,p_instance_id,'domain',
    v_id::text,null,pg_catalog.jsonb_build_object('hostname',v_hostname,'application',p_application));
  perform control_plane.remember_request_v1(p_idempotency_key,'domain.add',
    pg_catalog.jsonb_build_object('domain_id',v_id,'job_id',v_job));
  return query select v_id, v_job;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6. api_v1 pass-throughs and grants
-- ---------------------------------------------------------------------------
create or replace function api_v1.list_jobs_v1(p_status text default null, p_kind text default null,
  p_tenant_id uuid default null, p_limit integer default 25, p_offset integer default 0)
returns table (job_id uuid, kind text, status text, tenant_id uuid, tenant_name text,
  instance_id uuid, attempts integer, last_error_code text, requested_by_email text,
  approved_by_email text, needs_approval boolean, created_at timestamptz,
  updated_at timestamptz, completed_at timestamptz, total_count bigint)
language sql security definer set search_path to ''
as $$ select * from control_plane.list_jobs_v1(p_status,p_kind,p_tenant_id,p_limit,p_offset); $$;

create or replace function api_v1.get_job_v1(p_job_id uuid) returns jsonb
language sql security definer set search_path to ''
as $$ select control_plane.get_job_v1(p_job_id); $$;

create or replace function api_v1.cancel_job_v1(p_job_id uuid, p_reason text)
returns table (job_id uuid, status text)
language sql security definer set search_path to ''
as $$ select * from control_plane.cancel_job_v1(p_job_id,p_reason); $$;

create or replace function api_v1.retry_job_v1(p_job_id uuid, p_reason text)
returns table (job_id uuid, status text)
language sql security definer set search_path to ''
as $$ select * from control_plane.retry_job_v1(p_job_id,p_reason); $$;

create or replace function api_v1.approve_operator_job_v1(p_job_id uuid)
returns table (job_id uuid, status text)
language sql security definer set search_path to ''
as $$ select * from control_plane.approve_operator_job_v1(p_job_id); $$;

create or replace function api_v1.claim_job_v1(p_kinds text[] default null, p_lock_seconds integer default 300)
returns table (job_id uuid, kind text, tenant_id uuid, instance_id uuid, parameters jsonb, attempt integer)
language sql security definer set search_path to '' set statement_timeout to '20s'
as $$ select * from control_plane.claim_job_v1(p_kinds,p_lock_seconds); $$;

create or replace function api_v1.complete_job_v1(p_job_id uuid, p_outcome text, p_error_code text default null)
returns table (job_id uuid, status text)
language sql security definer set search_path to ''
as $$ select * from control_plane.complete_job_v1(p_job_id,p_outcome,p_error_code); $$;

create or replace function api_v1.list_provisioning_runs_v1(p_state text default null, p_tenant_id uuid default null,
  p_search text default null, p_limit integer default 25, p_offset integer default 0)
returns table (run_id uuid, tenant_id uuid, tenant_name text, instance_id uuid, slug text,
  plan_key text, state text, waiting_reason text, last_error_code text, desired_release text,
  steps_total bigint, steps_succeeded bigint, steps_failed bigint,
  created_at timestamptz, updated_at timestamptz, total_count bigint)
language sql security definer set search_path to ''
as $$ select * from control_plane.list_provisioning_runs_v1(p_state,p_tenant_id,p_search,p_limit,p_offset); $$;

create or replace function api_v1.get_provisioning_run_detail_v1(p_run_id uuid) returns jsonb
language sql security definer set search_path to ''
as $$ select control_plane.get_provisioning_run_detail_v1(p_run_id); $$;

create or replace function api_v1.retry_provisioning_run_v1(p_run_id uuid)
returns table (run_state text, steps_reset integer)
language sql security definer set search_path to ''
as $$ select * from control_plane.retry_provisioning_run_v1(p_run_id); $$;

create or replace function api_v1.activate_provisioned_instance_v1(p_run_id uuid)
returns table (activated boolean, run_state text, blocked text[])
language sql security definer set search_path to ''
as $$ select * from control_plane.activate_provisioned_instance_v1(p_run_id); $$;

create or replace function api_v1.deactivate_provisioned_instance_v1(p_run_id uuid, p_reason text)
returns table (run_state text, resources_deactivated integer)
language sql security definer set search_path to ''
as $$ select * from control_plane.deactivate_provisioned_instance_v1(p_run_id,p_reason); $$;

create or replace function api_v1.list_instances_v1(p_search text default null, p_state text default null,
  p_ring text default null, p_drift boolean default null, p_limit integer default 25, p_offset integer default 0)
returns table (instance_id uuid, tenant_id uuid, tenant_name text, tenant_status text,
  deployment_state text, rollout_ring text, desired_release text, current_release text,
  release_drifted boolean, infrastructure_total bigint, infrastructure_failing bigint,
  infrastructure_drifted bigint, health_status text, health_observed_at timestamptz,
  created_at timestamptz, total_count bigint)
language sql security definer set search_path to ''
as $$ select * from control_plane.list_instances_v1(p_search,p_state,p_ring,p_drift,p_limit,p_offset); $$;

create or replace function api_v1.get_instance_v1(p_instance_id uuid) returns jsonb
language sql security definer set search_path to ''
as $$ select control_plane.get_instance_v1(p_instance_id); $$;

create or replace function api_v1.list_domains_v1(p_search text default null, p_status text default null,
  p_limit integer default 25, p_offset integer default 0)
returns table (domain_id uuid, hostname text, tenant_id uuid, tenant_name text, instance_id uuid,
  application text, kind text, verification_status text, verified_at timestamptz, active boolean,
  certificate_status text, certificate_observed_at timestamptz, pending_job_id uuid,
  created_at timestamptz, total_count bigint)
language sql security definer set search_path to ''
as $$ select * from control_plane.list_domains_v1(p_search,p_status,p_limit,p_offset); $$;

create or replace function api_v1.add_tenant_domain_v1(p_tenant_id uuid, p_instance_id uuid,
  p_hostname text, p_application text, p_idempotency_key text)
returns table (domain_id uuid, job_id uuid)
language sql security definer set search_path to ''
as $$ select * from control_plane.add_tenant_domain_v1(p_tenant_id,p_instance_id,p_hostname,p_application,p_idempotency_key); $$;

create or replace function api_v1.request_domain_verification_v1(p_domain_id uuid)
returns table (job_id uuid)
language sql security definer set search_path to ''
as $$ select * from control_plane.request_domain_verification_v1(p_domain_id); $$;

create or replace function api_v1.record_health_observation_v1(p_subject_kind text, p_tenant_id uuid,
  p_instance_id uuid, p_subject_key text, p_signal text, p_status text, p_error_code text,
  p_detail jsonb, p_observed_at timestamptz)
returns bigint
language sql security definer set search_path to ''
as $$ select control_plane.record_health_observation_v1(p_subject_kind,p_tenant_id,p_instance_id,p_subject_key,p_signal,p_status,p_error_code,p_detail,p_observed_at); $$;

revoke all on all functions in schema control_plane from public,anon,authenticated;
grant execute on function control_plane.contains_no_secret_v1(jsonb) to service_role;

revoke all on function
  api_v1.list_jobs_v1(text,text,uuid,integer,integer),
  api_v1.get_job_v1(uuid),
  api_v1.cancel_job_v1(uuid,text),
  api_v1.retry_job_v1(uuid,text),
  api_v1.approve_operator_job_v1(uuid),
  api_v1.claim_job_v1(text[],integer),
  api_v1.complete_job_v1(uuid,text,text),
  api_v1.list_provisioning_runs_v1(text,uuid,text,integer,integer),
  api_v1.get_provisioning_run_detail_v1(uuid),
  api_v1.retry_provisioning_run_v1(uuid),
  api_v1.activate_provisioned_instance_v1(uuid),
  api_v1.deactivate_provisioned_instance_v1(uuid,text),
  api_v1.list_instances_v1(text,text,text,boolean,integer,integer),
  api_v1.get_instance_v1(uuid),
  api_v1.list_domains_v1(text,text,integer,integer),
  api_v1.add_tenant_domain_v1(uuid,uuid,text,text,text),
  api_v1.request_domain_verification_v1(uuid),
  api_v1.record_health_observation_v1(text,uuid,uuid,text,text,text,text,jsonb,timestamptz)
from public, anon, authenticated;

grant execute on function
  api_v1.list_jobs_v1(text,text,uuid,integer,integer),
  api_v1.get_job_v1(uuid),
  api_v1.cancel_job_v1(uuid,text),
  api_v1.retry_job_v1(uuid,text),
  api_v1.approve_operator_job_v1(uuid),
  api_v1.list_provisioning_runs_v1(text,uuid,text,integer,integer),
  api_v1.get_provisioning_run_detail_v1(uuid),
  api_v1.retry_provisioning_run_v1(uuid),
  api_v1.activate_provisioned_instance_v1(uuid),
  api_v1.deactivate_provisioned_instance_v1(uuid,text),
  api_v1.list_instances_v1(text,text,text,boolean,integer,integer),
  api_v1.get_instance_v1(uuid),
  api_v1.list_domains_v1(text,text,integer,integer),
  api_v1.add_tenant_domain_v1(uuid,uuid,text,text,text),
  api_v1.request_domain_verification_v1(uuid)
to authenticated;

grant execute on function
  api_v1.claim_job_v1(text[],integer),
  api_v1.complete_job_v1(uuid,text,text),
  api_v1.record_health_observation_v1(text,uuid,uuid,text,text,text,text,jsonb,timestamptz)
to service_role;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `rtk node scripts/platform-admin-local.mjs replay && rtk node scripts/platform-admin-local.mjs test 2>&1 | tail -40`
Expected: `platform_admin_operations_test.sql .. ok`; `provisioning_test.sql` and `control_plane_test.sql` still ok (they rely on the job kinds and approval rule, which are preserved).

- [ ] **Step 5: Commit**

```bash
rtk git add supabase/migrations/20261006140000_platform_admin_operations.sql supabase/tests/database/platform_admin_operations_test.sql
rtk git commit -m "Expose jobs, provisioning, instances and domains to operators"
```

---

### Task 5: Commercial — plans, subscriptions, entitlement overrides

**Files:**
- Create: `supabase/migrations/20261006150000_platform_admin_commercial.sql`
- Create: `supabase/tests/database/platform_admin_commercial_test.sql`

**Interfaces:**
- Produces: internal `control_plane.project_plan_entitlements_v1(uuid,text) -> integer`; api_v1 `list_plans_v1`, `save_plan_v1`, `list_subscriptions_v1`, `assign_subscription_v1`, `update_subscription_v1`, `set_entitlement_override_v1`, `clear_entitlement_override_v1`.

- [ ] **Step 1: Write the failing test**

`supabase/tests/database/platform_admin_commercial_test.sql` (begin/no_plan, helper block, then):
```sql
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000a','admin',30);
select set_config('test.t',(select tenant_id::text from control_plane.create_tenant_v2('Plan Tenant','plan-tenant','plan-tenant-create-01')),true);

set local role authenticated;
-- Plans
select throws_ok($$ select * from api_v1.save_plan_v1('Bad Key','Bad',array['booking.online'],true,true) $$,
  '22023','plan_invalid','a malformed key is refused');
select throws_ok($$ select * from api_v1.save_plan_v1('studio','Studio',array['NOT VALID'],true,true) $$,
  '22023','entitlement_invalid','a malformed feature key is refused');
select is((select key from api_v1.save_plan_v1('studio','Studio',array['booking.online','reports.operational','booking.online'],true,true)),
  'studio','a recent admin creates a plan');
select is((select entitlements from api_v1.list_plans_v1() where key='studio'),array['booking.online','reports.operational'],
  'feature keys are de-duplicated and sorted');
select throws_ok($$ select * from api_v1.save_plan_v1('studio','Studio',array['booking.online'],true,true) $$,
  '23505','plan_exists','creating an existing key is refused');

-- Subscription assignment projects entitlements.
select lives_ok(format($$ select * from api_v1.assign_subscription_v1(%L,'studio','canary','Pilot customer onboarding') $$,current_setting('test.t')),
  'an admin assigns a plan');
reset role;
select is((select array_agg(feature_key order by feature_key) from app.tenant_entitlements
  where tenant_id=current_setting('test.t')::uuid and granted),array['booking.online','reports.operational'],
  'the plan''s features are granted');

-- Editing a plan re-projects to subscribers, removal included.
set local role authenticated;
select lives_ok($$ select * from api_v1.save_plan_v1('studio','Studio',array['booking.online','payments.deposits'],true,false) $$,
  'an admin edits the plan');
reset role;
select is((select array_agg(feature_key order by feature_key) from app.tenant_entitlements
  where tenant_id=current_setting('test.t')::uuid and granted),array['booking.online','payments.deposits'],
  'subscribers gain and lose features with the plan');

-- Overrides survive plan edits; clearing returns to plan truth.
set local role authenticated;
select lives_ok(format($$ select * from api_v1.set_entitlement_override_v1(%L,'brand.custom_domain',true,null,'Contractual add-on') $$,current_setting('test.t')),
  'an admin grants an override');
select lives_ok($$ select * from api_v1.save_plan_v1('studio','Studio',array['booking.online'],true,false) $$,'the plan changes again');
reset role;
select ok((select granted and source='override' from app.tenant_entitlements
  where tenant_id=current_setting('test.t')::uuid and feature_key='brand.custom_domain'),'the override is untouched');
set local role authenticated;
select lives_ok(format($$ select * from api_v1.clear_entitlement_override_v1(%L,'brand.custom_domain','Add-on contract ended') $$,current_setting('test.t')),
  'an admin clears the override');
reset role;
select ok((select not granted from app.tenant_entitlements
  where tenant_id=current_setting('test.t')::uuid and feature_key='brand.custom_domain'),'a feature outside the plan is no longer granted');

-- Subscription lifecycle with concurrency.
set local role authenticated;
select throws_ok(format($$ select * from api_v1.update_subscription_v1(%L,'cancelled',null,'canary','Customer left',
  (select updated_at from api_v1.list_subscriptions_v1(null,null,'plan tenant',10,0))) $$,current_setting('test.t')),
  '22023','ends_at_required','cancelling needs an end date');
select throws_ok(format($$ select * from api_v1.update_subscription_v1(%L,'past_due',null,'canary','Card declined','2000-01-01') $$,current_setting('test.t')),
  '40001','stale_revision','a stale edit is refused');
select is((select state from api_v1.update_subscription_v1(current_setting('test.t')::uuid,'cancelled',now()+interval '7 days','canary','Customer left',
  (select updated_at from api_v1.list_subscriptions_v1(null,null,'plan tenant',10,0)))),'cancelled','cancellation with an end date works');
reset role;
select ok((select bool_and(expires_at is not null) from app.tenant_entitlements
  where tenant_id=current_setting('test.t')::uuid and source='plan' and granted),'plan features now expire at the end date');

-- Roles and step-up.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000c','operator');
set local role authenticated;
select throws_ok($$ select * from api_v1.save_plan_v1('x2','X',array[]::text[],true,true) $$,'42501','policy_denied','an operator cannot edit plans');
select ok((select count(*) from api_v1.list_plans_v1()) >= 2,'but can read them');
reset role;
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000a','admin',3600);
set local role authenticated;
select throws_ok($$ select * from api_v1.save_plan_v1('x3','X',array[]::text[],true,true) $$,'42501','recent_authentication_required',
  'plan edits need step-up');
reset role;

select is((select count(*)::int from control_plane.audit_events where action like 'plan.%' or action like 'subscription.%'
  or action like 'entitlement.%'),7,'every commercial change is audited');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to verify it fails**

Run: `rtk node scripts/platform-admin-local.mjs test 2>&1 | grep -A5 platform_admin_commercial`
Expected: FAIL — `function api_v1.save_plan_v1(...) does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261006150000_platform_admin_commercial.sql`:
```sql
-- Platform Admin completion, part 4: plans, subscriptions, entitlements.
--
-- Subscriptions here are administrative records. There is no SaaS billing
-- provider integration (ADR-0003: Stripe in this product is the tenant's own
-- payments), so nothing in this file claims a payment happened; the UI labels
-- these states accordingly.
--
-- Cancelling with a future end date stamps that date as expires_at on the
-- plan-sourced entitlements, which the product already honours
-- (20260921120000: expires_at > now()). Re-activating clears it. Overrides
-- (source = 'override') are never touched by plan changes.

create or replace function control_plane.project_plan_entitlements_v1(p_tenant_id uuid, p_plan_key text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_features text[];
  v_count integer;
begin
  select p.entitlements into v_features from control_plane.plans p where p.key = p_plan_key;
  update app.tenant_entitlements e set granted = false, expires_at = null,
    updated_at = pg_catalog.statement_timestamp()
  where e.tenant_id = p_tenant_id and e.source = 'plan' and not (e.feature_key = any(coalesce(v_features,'{}')));
  insert into app.tenant_entitlements(tenant_id,feature_key,granted,source)
  select p_tenant_id, k, true, 'plan' from pg_catalog.unnest(coalesce(v_features,'{}')) k
  on conflict (tenant_id,feature_key) do update
    set granted = true, expires_at = null, updated_at = pg_catalog.statement_timestamp()
    where app.tenant_entitlements.source = 'plan';
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

create or replace function control_plane.list_plans_v1()
returns table (key text, name text, entitlements text[], active boolean,
  created_at timestamptz, subscriber_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  perform control_plane.require_operator_v1('viewer');
  return query
  select p.key, p.name, p.entitlements, p.active, p.created_at,
    (select pg_catalog.count(*) from control_plane.subscriptions s
      where s.plan_key = p.key and s.state <> 'cancelled')
  from control_plane.plans p order by p.active desc, p.name;
end;
$function$;

create or replace function control_plane.save_plan_v1(
  p_key text, p_name text, p_entitlements text[], p_active boolean, p_create boolean)
returns table (key text, subscribers_updated integer)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_before control_plane.plans%rowtype;
  v_features text[];
  v_name text := pg_catalog.btrim(p_name);
  v_tenant uuid;
  v_updated integer := 0;
begin
  v_operator := control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  if p_key is null or p_key !~ '^[a-z][a-z0-9_-]{1,40}$' then
    raise exception using errcode='22023',message='plan_invalid';
  end if;
  if v_name is null or pg_catalog.char_length(v_name) not between 1 and 80 then
    raise exception using errcode='22023',message='name_invalid';
  end if;
  if exists (select 1 from pg_catalog.unnest(coalesce(p_entitlements,'{}')) k
             where k is null or k !~ '^[a-z][a-z0-9_.]{1,60}$') then
    raise exception using errcode='22023',message='entitlement_invalid';
  end if;
  select coalesce(pg_catalog.array_agg(distinct k order by k),'{}') into v_features
  from pg_catalog.unnest(coalesce(p_entitlements,'{}')) k;

  select * into v_before from control_plane.plans p where p.key = p_key for update;
  if p_create then
    if v_before.key is not null then
      raise exception using errcode='23505',message='plan_exists';
    end if;
    insert into control_plane.plans(key,name,entitlements,active)
    values (p_key,v_name,v_features,coalesce(p_active,true));
  else
    if v_before.key is null then
      raise exception using errcode='P0002',message='not_found';
    end if;
    update control_plane.plans p set name = v_name, entitlements = v_features,
      active = coalesce(p_active,p.active)
    where p.key = p_key;
    if v_before.entitlements is distinct from v_features then
      for v_tenant in select s.tenant_id from control_plane.subscriptions s
                      where s.plan_key = p_key and s.state <> 'cancelled' loop
        perform control_plane.project_plan_entitlements_v1(v_tenant,p_key);
        v_updated := v_updated + 1;
      end loop;
    end if;
  end if;

  perform control_plane.write_audit_v1(v_operator,
    case when p_create then 'plan.created' else 'plan.updated' end,null,null,'plan',p_key,null,
    pg_catalog.jsonb_build_object('plan',p_key,
      'added',(select coalesce(pg_catalog.jsonb_agg(k),'[]'::jsonb) from pg_catalog.unnest(v_features) k
               where not (k = any(coalesce(v_before.entitlements,'{}')))),
      'removed',(select coalesce(pg_catalog.jsonb_agg(k),'[]'::jsonb) from pg_catalog.unnest(coalesce(v_before.entitlements,'{}')) k
               where not (k = any(v_features))),
      'enabled',coalesce(p_active,true),'rows',v_updated));
  return query select p_key, v_updated;
end;
$function$;

create or replace function control_plane.list_subscriptions_v1(
  p_state text default null, p_plan_key text default null, p_search text default null,
  p_limit integer default 25, p_offset integer default 0)
returns table (tenant_id uuid, tenant_name text, tenant_status text, plan_key text, plan_name text,
  state text, rollout_ring text, started_at timestamptz, ends_at timestamptz,
  updated_at timestamptz, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  perform control_plane.require_operator_v1('viewer');
  return query
  select t.id, t.name, t.status, s.plan_key, p.name, coalesce(s.state,'none'), s.rollout_ring,
    s.started_at, s.ends_at, s.updated_at, pg_catalog.count(*) over ()
  from app.tenants t
  left join control_plane.subscriptions s on s.tenant_id = t.id
  left join control_plane.plans p on p.key = s.plan_key
  where (p_state is null or coalesce(s.state,'none') = p_state)
    and (p_plan_key is null or s.plan_key = p_plan_key)
    and (coalesce(pg_catalog.btrim(p_search),'') = ''
      or pg_catalog.strpos(pg_catalog.lower(t.name), pg_catalog.lower(pg_catalog.btrim(p_search))) > 0)
  order by t.name, t.id
  limit least(greatest(coalesce(p_limit,25),1),100) offset greatest(coalesce(p_offset,0),0);
end;
$function$;

create or replace function control_plane.assign_subscription_v1(
  p_tenant_id uuid, p_plan_key text, p_rollout_ring text, p_reason text)
returns table (tenant_id uuid, plan_key text, granted integer)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_before control_plane.subscriptions%rowtype;
  v_granted integer;
begin
  v_operator := control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 5 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  if coalesce(p_rollout_ring,'') not in ('canary','early','general') then
    raise exception using errcode='22023',message='settings_invalid';
  end if;
  if not exists (select 1 from control_plane.plans p where p.key = p_plan_key and p.active) then
    raise exception using errcode='22023',message='plan_unknown';
  end if;
  if not exists (select 1 from app.tenants t where t.id = p_tenant_id) then
    raise exception using errcode='P0002',message='not_found';
  end if;
  select * into v_before from control_plane.subscriptions s where s.tenant_id = p_tenant_id for update;

  insert into control_plane.subscriptions(tenant_id,plan_key,rollout_ring,state)
  values (p_tenant_id,p_plan_key,p_rollout_ring,'active')
  on conflict (tenant_id) do update
    set plan_key = excluded.plan_key, rollout_ring = excluded.rollout_ring,
        state = case when control_plane.subscriptions.state = 'cancelled' then 'active'
                     else control_plane.subscriptions.state end,
        ends_at = case when control_plane.subscriptions.state = 'cancelled' then null
                       else control_plane.subscriptions.ends_at end,
        updated_at = pg_catalog.statement_timestamp();
  v_granted := control_plane.project_plan_entitlements_v1(p_tenant_id,p_plan_key);

  perform control_plane.write_audit_v1(v_operator,'subscription.plan_assigned',p_tenant_id,null,
    'subscription',p_tenant_id::text,p_reason,
    pg_catalog.jsonb_build_object('from',v_before.plan_key,'to',p_plan_key,'ring',p_rollout_ring));
  return query select p_tenant_id, p_plan_key, v_granted;
end;
$function$;

create or replace function control_plane.update_subscription_v1(
  p_tenant_id uuid, p_state text, p_ends_at timestamptz, p_rollout_ring text,
  p_reason text, p_expected_updated_at timestamptz)
returns table (tenant_id uuid, state text, updated_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_sub control_plane.subscriptions%rowtype;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  v_operator := control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 5 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  if p_state not in ('trialing','active','past_due','cancelled')
     or coalesce(p_rollout_ring,'') not in ('canary','early','general') then
    raise exception using errcode='22023',message='settings_invalid';
  end if;
  if p_state in ('trialing','cancelled') and p_ends_at is null then
    raise exception using errcode='22023',message='ends_at_required';
  end if;
  if p_state = 'trialing' and p_ends_at <= v_now then
    raise exception using errcode='22023',message='expiry_invalid';
  end if;
  select * into v_sub from control_plane.subscriptions s where s.tenant_id = p_tenant_id for update;
  if v_sub.tenant_id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  if v_sub.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode='40001',message='stale_revision';
  end if;

  update control_plane.subscriptions s set state = p_state, rollout_ring = p_rollout_ring,
    ends_at = case when p_state in ('trialing','cancelled') then p_ends_at else null end,
    updated_at = v_now
  where s.tenant_id = p_tenant_id;

  if p_state = 'cancelled' then
    update app.tenant_entitlements e set expires_at = p_ends_at, updated_at = v_now,
      granted = case when p_ends_at <= v_now then false else e.granted end
    where e.tenant_id = p_tenant_id and e.source = 'plan';
  elsif v_sub.state = 'cancelled' then
    perform control_plane.project_plan_entitlements_v1(p_tenant_id,v_sub.plan_key);
  end if;

  perform control_plane.write_audit_v1(v_operator,'subscription.updated',p_tenant_id,null,
    'subscription',p_tenant_id::text,p_reason,
    pg_catalog.jsonb_build_object('from',v_sub.state,'to',p_state,'ring',p_rollout_ring,
      'expires_at',p_ends_at));
  return query select p_tenant_id, p_state, v_now;
end;
$function$;

create or replace function control_plane.set_entitlement_override_v1(
  p_tenant_id uuid, p_feature_key text, p_granted boolean, p_expires_at timestamptz, p_reason text)
returns table (tenant_id uuid, feature_key text, granted boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
begin
  v_operator := control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 5 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  if p_feature_key is null or p_feature_key !~ '^[a-z][a-z0-9_.]{1,60}$' or p_granted is null then
    raise exception using errcode='22023',message='entitlement_invalid';
  end if;
  if p_expires_at is not null and p_expires_at <= pg_catalog.statement_timestamp() then
    raise exception using errcode='22023',message='expiry_invalid';
  end if;
  if not exists (select 1 from app.tenants t where t.id = p_tenant_id) then
    raise exception using errcode='P0002',message='not_found';
  end if;
  insert into app.tenant_entitlements(tenant_id,feature_key,granted,source,expires_at)
  values (p_tenant_id,p_feature_key,p_granted,'override',p_expires_at)
  on conflict (tenant_id,feature_key) do update
    set granted = excluded.granted, source = 'override', expires_at = excluded.expires_at,
        updated_at = pg_catalog.statement_timestamp();
  perform control_plane.write_audit_v1(v_operator,'entitlement.overridden',p_tenant_id,null,
    'entitlement',p_feature_key,p_reason,
    pg_catalog.jsonb_build_object('feature_key',p_feature_key,'granted',p_granted,'expires_at',p_expires_at));
  return query select p_tenant_id, p_feature_key, p_granted;
end;
$function$;

create or replace function control_plane.clear_entitlement_override_v1(
  p_tenant_id uuid, p_feature_key text, p_reason text)
returns table (tenant_id uuid, feature_key text, granted boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_in_plan boolean;
begin
  v_operator := control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 5 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  if not exists (select 1 from app.tenant_entitlements e where e.tenant_id = p_tenant_id
                 and e.feature_key = p_feature_key and e.source = 'override') then
    raise exception using errcode='P0002',message='not_found';
  end if;
  select exists (select 1 from control_plane.subscriptions s join control_plane.plans p on p.key = s.plan_key
    where s.tenant_id = p_tenant_id and s.state <> 'cancelled' and p_feature_key = any(p.entitlements))
  into v_in_plan;
  update app.tenant_entitlements e set source = 'plan', granted = v_in_plan, expires_at = null,
    updated_at = pg_catalog.statement_timestamp()
  where e.tenant_id = p_tenant_id and e.feature_key = p_feature_key;
  perform control_plane.write_audit_v1(v_operator,'entitlement.override_cleared',p_tenant_id,null,
    'entitlement',p_feature_key,p_reason,
    pg_catalog.jsonb_build_object('feature_key',p_feature_key,'granted',v_in_plan));
  return query select p_tenant_id, p_feature_key, v_in_plan;
end;
$function$;

-- api_v1 pass-throughs
create or replace function api_v1.list_plans_v1()
returns table (key text, name text, entitlements text[], active boolean, created_at timestamptz, subscriber_count bigint)
language sql security definer set search_path to ''
as $$ select * from control_plane.list_plans_v1(); $$;

create or replace function api_v1.save_plan_v1(p_key text, p_name text, p_entitlements text[], p_active boolean, p_create boolean)
returns table (key text, subscribers_updated integer)
language sql security definer set search_path to ''
as $$ select * from control_plane.save_plan_v1(p_key,p_name,p_entitlements,p_active,p_create); $$;

create or replace function api_v1.list_subscriptions_v1(p_state text default null, p_plan_key text default null,
  p_search text default null, p_limit integer default 25, p_offset integer default 0)
returns table (tenant_id uuid, tenant_name text, tenant_status text, plan_key text, plan_name text,
  state text, rollout_ring text, started_at timestamptz, ends_at timestamptz,
  updated_at timestamptz, total_count bigint)
language sql security definer set search_path to ''
as $$ select * from control_plane.list_subscriptions_v1(p_state,p_plan_key,p_search,p_limit,p_offset); $$;

create or replace function api_v1.assign_subscription_v1(p_tenant_id uuid, p_plan_key text, p_rollout_ring text, p_reason text)
returns table (tenant_id uuid, plan_key text, granted integer)
language sql security definer set search_path to ''
as $$ select * from control_plane.assign_subscription_v1(p_tenant_id,p_plan_key,p_rollout_ring,p_reason); $$;

create or replace function api_v1.update_subscription_v1(p_tenant_id uuid, p_state text, p_ends_at timestamptz,
  p_rollout_ring text, p_reason text, p_expected_updated_at timestamptz)
returns table (tenant_id uuid, state text, updated_at timestamptz)
language sql security definer set search_path to ''
as $$ select * from control_plane.update_subscription_v1(p_tenant_id,p_state,p_ends_at,p_rollout_ring,p_reason,p_expected_updated_at); $$;

create or replace function api_v1.set_entitlement_override_v1(p_tenant_id uuid, p_feature_key text,
  p_granted boolean, p_expires_at timestamptz, p_reason text)
returns table (tenant_id uuid, feature_key text, granted boolean)
language sql security definer set search_path to ''
as $$ select * from control_plane.set_entitlement_override_v1(p_tenant_id,p_feature_key,p_granted,p_expires_at,p_reason); $$;

create or replace function api_v1.clear_entitlement_override_v1(p_tenant_id uuid, p_feature_key text, p_reason text)
returns table (tenant_id uuid, feature_key text, granted boolean)
language sql security definer set search_path to ''
as $$ select * from control_plane.clear_entitlement_override_v1(p_tenant_id,p_feature_key,p_reason); $$;

revoke all on all functions in schema control_plane from public,anon,authenticated;
grant execute on function control_plane.contains_no_secret_v1(jsonb) to service_role;

revoke all on function
  api_v1.list_plans_v1(),
  api_v1.save_plan_v1(text,text,text[],boolean,boolean),
  api_v1.list_subscriptions_v1(text,text,text,integer,integer),
  api_v1.assign_subscription_v1(uuid,text,text,text),
  api_v1.update_subscription_v1(uuid,text,timestamptz,text,text,timestamptz),
  api_v1.set_entitlement_override_v1(uuid,text,boolean,timestamptz,text),
  api_v1.clear_entitlement_override_v1(uuid,text,text)
from public, anon;
grant execute on function
  api_v1.list_plans_v1(),
  api_v1.save_plan_v1(text,text,text[],boolean,boolean),
  api_v1.list_subscriptions_v1(text,text,text,integer,integer),
  api_v1.assign_subscription_v1(uuid,text,text,text),
  api_v1.update_subscription_v1(uuid,text,timestamptz,text,text,timestamptz),
  api_v1.set_entitlement_override_v1(uuid,text,boolean,timestamptz,text),
  api_v1.clear_entitlement_override_v1(uuid,text,text)
to authenticated;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `rtk node scripts/platform-admin-local.mjs replay && rtk node scripts/platform-admin-local.mjs test 2>&1 | tail -40`
Expected: `platform_admin_commercial_test.sql .. ok`; `settings_entitlements_test.sql` and `control_plane_test.sql` still ok. The audit count is 7 successful writes: `plan.created` ×1, `plan.updated` ×2, `subscription.plan_assigned` ×1, `entitlement.overridden` ×1, `entitlement.override_cleared` ×1, `subscription.updated` ×1. Refused calls roll back and are recorded by the app (Task 11), not by the database.

- [ ] **Step 5: Commit**

```bash
rtk git add supabase/migrations/20261006150000_platform_admin_commercial.sql supabase/tests/database/platform_admin_commercial_test.sql
rtk git commit -m "Let admins manage plans, subscriptions and entitlement overrides"
```

---

### Task 6: Releases and rollouts

**Files:**
- Create: `supabase/migrations/20261006160000_platform_admin_releases.sql`
- Create: `supabase/tests/database/platform_admin_releases_test.sql`

**Interfaces:**
- Consumes: `enqueue_operator_job_v1`, `complete_job_v1` (Task 4).
- Produces: tables `control_plane.releases`, `rollouts`, `rollout_targets`; internal `release_prerequisites_v1(uuid) -> text[]`; api_v1 `register_release_v1`, `set_release_status_v1`, `list_releases_v1`, `get_release_v1`, `create_rollout_v1`, `start_rollout_v1`, `pause_rollout_v1`, `cancel_rollout_v1`, `retry_rollout_targets_v1`, `rollback_rollout_v1`, `list_rollouts_v1`, `get_rollout_v1`, `report_rollout_target_v1`*.

Target statuses: `pending → queued → succeeded | failed`; `skipped`, `cancelled`; rollback: `rollback_queued → rolled_back | failed`. Rollout statuses: `draft → running ⇄ paused → completed | failed | cancelled | rolled_back`. A target failure auto-pauses a running rollout (spec §21.5).

- [ ] **Step 1: Write the failing test**

`supabase/tests/database/platform_admin_releases_test.sql` (begin/no_plan, helper block, then):
```sql
-- Fixture: two active instances on known releases, in canary and general rings.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000a','admin',30);
select set_config('test.ta',(select tenant_id::text from control_plane.create_tenant_v2('Ring Canary','ring-canary','ring-canary-create-001')),true);
select set_config('test.tb',(select tenant_id::text from control_plane.create_tenant_v2('Ring General','ring-general','ring-general-create-01')),true);
select control_plane.assign_subscription_v1(current_setting('test.ta')::uuid,'launch','canary','Fixture assignment');
select control_plane.assign_subscription_v1(current_setting('test.tb')::uuid,'launch','general','Fixture assignment');
-- Activation needs a published brand revision. Copy seed tenant A's, so the
-- config, content and content_hash columns stay mutually consistent.
insert into app.brand_revisions(id,tenant_id,brand_id,revision,state,config_version,created_at,published_at,config,content,content_hash)
select gen_random_uuid(),b.tenant_id,b.id,1,'published',r.config_version,now(),now(),r.config,r.content,r.content_hash
from app.brands b cross join app.brand_revisions r
where r.id='a4100000-0000-0000-0000-000000000001'
  and b.tenant_id in (current_setting('test.ta')::uuid,current_setting('test.tb')::uuid);
update app.instances i set deployment_state='active',
  published_brand_revision_id=(select r.id from app.brand_revisions r where r.tenant_id=i.tenant_id)
where i.tenant_id in (current_setting('test.ta')::uuid,current_setting('test.tb')::uuid);
insert into control_plane.instance_release_state(tenant_id,instance_id,desired_release,current_release,config_schema_version)
select i.tenant_id,i.id,'0.1.0','0.1.0',3 from app.instances i
where i.tenant_id in (current_setting('test.ta')::uuid,current_setting('test.tb')::uuid);

set local role authenticated;
-- Registration validates like release-contracts.mjs.
select throws_ok($$ select * from api_v1.register_release_v1('1.0','stable',repeat('a',40),3,1,1,'{}',array['n'],array['n'],true,'release-bad-000000001') $$,
  '22023','release_invalid','a non-semver version is refused');
select throws_ok($$ select * from api_v1.register_release_v1('0.2.0','stable','abc',3,1,1,'{}',array['n'],array['n'],true,'release-bad-000000002') $$,
  '22023','release_invalid','a short commit is refused');
select set_config('test.r0',(select release_id::text from api_v1.register_release_v1('0.1.0','stable',repeat('b',40),3,1,1,
  '{}',array['Initial'],array['None'],true,'release-010-000000001')),true);
select set_config('test.r',(select release_id::text from api_v1.register_release_v1('0.2.0','candidate',repeat('c',40),3,1,1,
  array['20260922120000_control_plane_registry'],array['Faster calendar'],array['No action'],true,'release-020-000000001')),true);
select is((select release_id::text from api_v1.register_release_v1('0.2.0','candidate',repeat('c',40),3,1,1,
  array['20260922120000_control_plane_registry'],array['Faster calendar'],array['No action'],true,'release-020-000000001')),
  current_setting('test.r'),'registration is idempotent');
select throws_ok($$ select * from api_v1.register_release_v1('0.2.0','stable',repeat('d',40),3,1,1,'{}',array['n'],array['n'],true,'release-dup-000000001') $$,
  '23505','release_exists','a version is registered once');
select is((select prerequisites from api_v1.list_releases_v1(null,null,10,0) where version='0.2.0'),'{}'::text[],
  'an applied migration and a compatible backend leave no blockers');

-- A release needing an unapplied migration is blocked.
select set_config('test.rx',(select release_id::text from api_v1.register_release_v1('0.3.0','candidate',repeat('e',40),3,1,1,
  array['29990101000000_future_change'],array['Later'],array['Later'],true,'release-030-000000001')),true);
select is((select prerequisites from api_v1.list_releases_v1(null,null,10,0) where version='0.3.0'),array['migrations_missing'],
  'an unapplied migration is a blocker');

-- Rollout targeting by ring.
select throws_ok(format($$ select * from api_v1.create_rollout_v1(%L,array['early'],null,'Canary first','rollout-none-00000001') $$,current_setting('test.r')),
  '22023','no_targets','a ring with no instances has no targets');
select set_config('test.ro',(select rollout_id::text from api_v1.create_rollout_v1(current_setting('test.r')::uuid,array['canary'],null,
  'Canary first','rollout-020-canary-001')),true);
select is((select get_rollout_v1->'counts'->>'pending' from api_v1.get_rollout_v1(current_setting('test.ro')::uuid)),'1',
  'only the canary instance is targeted');
select is((select status from api_v1.start_rollout_v1(current_setting('test.ro')::uuid)),'running','starting queues work');
reset role;
select is((select count(*)::int from control_plane.jobs where kind='publish_release'
  and parameters->>'rollout_id'=current_setting('test.ro')),1,'one publish job per target');
select is((select desired_release from control_plane.instance_release_state where tenant_id=current_setting('test.ta')::uuid),'0.2.0',
  'the target''s desired release moved');

-- The worker reports failure: rollout auto-pauses; retry re-queues; success completes.
select pg_temp.as_worker();
select set_config('test.job',(select job_id::text from control_plane.claim_job_v1(array['publish_release'],60)),true);
select is((select target_status from control_plane.report_rollout_target_v1(current_setting('test.job')::uuid,'failed','smoke_failed',null)),
  'failed','the worker records a failed target');
select is((select status from control_plane.rollouts where id=current_setting('test.ro')::uuid),'paused','a failure pauses the rollout');
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000c','operator');
set local role authenticated;
select is((select retried from api_v1.retry_rollout_targets_v1(current_setting('test.ro')::uuid)),1,'an operator retries failed targets');
reset role;
select pg_temp.as_worker();
select set_config('test.job',(select job_id::text from control_plane.claim_job_v1(array['publish_release'],60)),true);
select is((select target_status from control_plane.report_rollout_target_v1(current_setting('test.job')::uuid,'succeeded',null,'0.2.0')),
  'succeeded','the worker records success with the observed release');
select is((select status from control_plane.rollouts where id=current_setting('test.ro')::uuid),'completed','all targets done completes the rollout');
select is((select current_release from control_plane.instance_release_state where tenant_id=current_setting('test.ta')::uuid),'0.2.0',
  'and the observed release is recorded');

-- Rollback: step-up, previous release must be known and compatible.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000a','admin',3600);
set local role authenticated;
select throws_ok(format($$ select * from api_v1.rollback_rollout_v1(%L,'Calendar regression found') $$,current_setting('test.ro')),
  '42501','recent_authentication_required','rollback needs step-up');
reset role;
select pg_temp.claims('c0000000-0000-0000-0000-00000000000a','aal2',30);
set local role authenticated;
select is((select status from api_v1.rollback_rollout_v1(current_setting('test.ro')::uuid,'Calendar regression found')),'rolled_back',
  'a recent admin rolls back');
reset role;
select is((select desired_release from control_plane.instance_release_state where tenant_id=current_setting('test.ta')::uuid),'0.1.0',
  'desired release returns to the previous one');
select is((select status from control_plane.rollout_targets where rollout_id=current_setting('test.ro')::uuid),'rollback_queued',
  'and the target waits for the worker to apply it');

-- An irreversible release cannot be rolled back.
select pg_temp.claims('c0000000-0000-0000-0000-00000000000a','aal2',30);
set local role authenticated;
select set_config('test.r4',(select release_id::text from api_v1.register_release_v1('0.4.0','stable',repeat('f',40),3,1,1,
  '{}',array['Contract change'],array['Irreversible'],false,'release-040-000000001')),true);
select set_config('test.ro4',(select rollout_id::text from api_v1.create_rollout_v1(current_setting('test.r4')::uuid,array['general'],null,
  'General wave','rollout-040-general-01')),true);
select throws_ok(format($$ select * from api_v1.rollback_rollout_v1(%L,'Trying anyway now') $$,current_setting('test.ro4')),
  '22023','rollback_not_supported','an irreversible release refuses rollback');
select is((select status from api_v1.cancel_rollout_v1(current_setting('test.ro4')::uuid,'Not needed after all')),'cancelled','a draft is cancellable');
reset role;

-- Viewers read, cannot act; worker reports are worker-only.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000d','viewer');
set local role authenticated;
select ok((select count(*) from api_v1.list_rollouts_v1(null,null,10,0)) >= 2,'a viewer lists rollouts');
select throws_ok(format($$ select * from api_v1.pause_rollout_v1(%L,'viewer tries') $$,current_setting('test.ro')),'42501','policy_denied',
  'a viewer cannot pause');
reset role;
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000a','admin');
select throws_ok(format($$ select * from control_plane.report_rollout_target_v1(%L,'succeeded',null,'0.2.0') $$,current_setting('test.job')),
  '42501','policy_denied','an operator cannot report deployment success');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to verify it fails**

Run: `rtk node scripts/platform-admin-local.mjs test 2>&1 | grep -A5 platform_admin_releases`
Expected: FAIL — `function api_v1.register_release_v1(...) does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261006160000_platform_admin_releases.sql`:
```sql
-- Platform Admin completion, part 5: releases and rollouts.
--
-- A release is a registered manifest (the same fields release-contracts.mjs
-- validates). A rollout is an intent to move a set of instances to it; starting
-- one changes desired_release and queues one publish_release job per target.
-- Only a worker reporting through report_rollout_target_v1 can say a target
-- succeeded, and only that report changes current_release. A failure pauses the
-- rollout (spec §21.5). Rollback re-targets the previous release and is refused
-- for releases registered as irreversible: code rollback does not undo a
-- destructive migration.

create table control_plane.releases (
  id uuid not null default pg_catalog.gen_random_uuid() primary key,
  version text not null unique check (version ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'),
  channel text not null check (channel in ('internal','candidate','stable')),
  git_commit text not null check (git_commit ~ '^([0-9a-f]{40}|[0-9a-f]{64})$'),
  config_schema_version integer not null check (config_schema_version > 0),
  backend_contract_min integer not null check (backend_contract_min > 0),
  backend_contract_max integer not null check (backend_contract_max >= backend_contract_min),
  migration_ids text[] not null default '{}',
  feature_notes text[] not null check (pg_catalog.cardinality(feature_notes) > 0),
  upgrade_notes text[] not null check (pg_catalog.cardinality(upgrade_notes) > 0),
  reversible boolean not null default true,
  status text not null default 'available' check (status in ('available','withdrawn')),
  registered_by uuid not null,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  updated_at timestamptz not null default pg_catalog.statement_timestamp()
);

create table control_plane.rollouts (
  id uuid not null default pg_catalog.gen_random_uuid() primary key,
  release_id uuid not null references control_plane.releases(id) on delete restrict,
  status text not null default 'draft' check (status in (
    'draft','running','paused','completed','failed','cancelled','rolled_back')),
  target_rings text[] not null default '{}',
  reason text not null check (pg_catalog.char_length(reason) between 5 and 500),
  created_by uuid not null,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  updated_at timestamptz not null default pg_catalog.statement_timestamp()
);

create table control_plane.rollout_targets (
  rollout_id uuid not null references control_plane.rollouts(id) on delete restrict,
  tenant_id uuid not null,
  instance_id uuid not null,
  ring text,
  from_release text,
  status text not null default 'pending' check (status in (
    'pending','queued','succeeded','failed','skipped','cancelled','rollback_queued','rolled_back')),
  job_id uuid references control_plane.jobs(id) on delete restrict,
  attempts integer not null default 0,
  error_code text check (error_code is null or error_code ~ '^[a-z][a-z0-9_]{2,60}$'),
  updated_at timestamptz not null default pg_catalog.statement_timestamp(),
  primary key (rollout_id, instance_id),
  foreign key (tenant_id,instance_id) references app.instances(tenant_id,id) on delete restrict
);
create index rollout_targets_job_idx on control_plane.rollout_targets (job_id);

do $rls$
declare t text;
begin
  foreach t in array array['releases','rollouts','rollout_targets'] loop
    execute format('alter table control_plane.%I enable row level security',t);
    execute format('create policy %I on control_plane.%I for all to anon,authenticated using (false) with check (false)',t||'_no_application_access',t);
    execute format('revoke all on control_plane.%I from public,anon,authenticated',t);
  end loop;
end;
$rls$;

-- Fleet-level blockers for a release, read now rather than remembered.
create or replace function control_plane.release_prerequisites_v1(p_release_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_release control_plane.releases%rowtype;
  v_blocked text[] := '{}'::text[];
  v_missing boolean;
begin
  select * into v_release from control_plane.releases r where r.id = p_release_id;
  if v_release.status = 'withdrawn' then
    v_blocked := v_blocked || 'release_withdrawn'::text;
  end if;
  if control_plane.backend_contract_version_v1()
     not between v_release.backend_contract_min and v_release.backend_contract_max then
    v_blocked := v_blocked || 'backend_contract_incompatible'::text;
  end if;
  if pg_catalog.cardinality(v_release.migration_ids) > 0 then
    if pg_catalog.to_regclass('supabase_migrations.schema_migrations') is null then
      v_blocked := v_blocked || 'migration_state_unknown'::text;
    else
      execute 'select exists (select 1 from pg_catalog.unnest($1) m
               where not exists (select 1 from supabase_migrations.schema_migrations s
                                 where s.version = pg_catalog.left(m,14)))'
      into v_missing using v_release.migration_ids;
      if v_missing then
        v_blocked := v_blocked || 'migrations_missing'::text;
      end if;
    end if;
  end if;
  return v_blocked;
end;
$function$;

create or replace function control_plane.register_release_v1(
  p_version text, p_channel text, p_git_commit text, p_config_schema_version integer,
  p_backend_min integer, p_backend_max integer, p_migration_ids text[],
  p_feature_notes text[], p_upgrade_notes text[], p_reversible boolean, p_idempotency_key text)
returns table (release_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_prior jsonb;
  v_id uuid;
begin
  v_operator := control_plane.require_operator_v1('admin');
  v_prior := control_plane.replay_request_v1(p_idempotency_key,'release.register');
  if v_prior is not null then
    return query select (v_prior->>'release_id')::uuid;
    return;
  end if;
  if p_version is null or p_version !~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'
     or p_channel is null or p_channel not in ('internal','candidate','stable')
     or p_git_commit is null or p_git_commit !~ '^([0-9a-f]{40}|[0-9a-f]{64})$'
     or coalesce(p_config_schema_version,0) <= 0
     or coalesce(p_backend_min,0) <= 0 or coalesce(p_backend_max,0) < coalesce(p_backend_min,1)
     or exists (select 1 from pg_catalog.unnest(coalesce(p_migration_ids,'{}')) m
                where m is null or m !~ '^[0-9]{14}_[a-z0-9]+(_[a-z0-9]+)*$')
     or pg_catalog.cardinality(coalesce(p_feature_notes,'{}')) = 0
     or pg_catalog.cardinality(coalesce(p_upgrade_notes,'{}')) = 0
     or exists (select 1 from pg_catalog.unnest(p_feature_notes || p_upgrade_notes) n
                where n is null or pg_catalog.btrim(n) = '' or pg_catalog.char_length(n) > 500) then
    raise exception using errcode='22023',message='release_invalid';
  end if;
  if exists (select 1 from control_plane.releases r where r.version = p_version) then
    raise exception using errcode='23505',message='release_exists';
  end if;
  insert into control_plane.releases(version,channel,git_commit,config_schema_version,
    backend_contract_min,backend_contract_max,migration_ids,feature_notes,upgrade_notes,
    reversible,registered_by)
  values (p_version,p_channel,p_git_commit,p_config_schema_version,p_backend_min,p_backend_max,
    coalesce(p_migration_ids,'{}'),p_feature_notes,p_upgrade_notes,coalesce(p_reversible,true),v_operator)
  returning id into v_id;
  perform control_plane.write_audit_v1(v_operator,'release.registered',null,null,'release',v_id::text,null,
    pg_catalog.jsonb_build_object('version',p_version,'channel',p_channel));
  perform control_plane.remember_request_v1(p_idempotency_key,'release.register',
    pg_catalog.jsonb_build_object('release_id',v_id));
  return query select v_id;
end;
$function$;

create or replace function control_plane.set_release_status_v1(p_release_id uuid, p_status text, p_reason text)
returns table (release_id uuid, status text)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_release control_plane.releases%rowtype;
begin
  v_operator := control_plane.require_operator_v1('admin');
  if p_status not in ('available','withdrawn') then
    raise exception using errcode='22023',message='settings_invalid';
  end if;
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 5 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  select * into v_release from control_plane.releases r where r.id = p_release_id for update;
  if v_release.id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  update control_plane.releases r set status = p_status, updated_at = pg_catalog.statement_timestamp()
  where r.id = p_release_id;
  perform control_plane.write_audit_v1(v_operator,'release.status_changed',null,null,'release',
    p_release_id::text,p_reason,pg_catalog.jsonb_build_object('version',v_release.version,
      'from',v_release.status,'to',p_status));
  return query select p_release_id, p_status;
end;
$function$;

create or replace function control_plane.list_releases_v1(
  p_channel text default null, p_status text default null,
  p_limit integer default 25, p_offset integer default 0)
returns table (release_id uuid, version text, channel text, git_commit text, config_schema_version integer,
  backend_contract_min integer, backend_contract_max integer, migration_ids text[], reversible boolean,
  status text, instances_desired bigint, instances_current bigint, rollouts bigint,
  prerequisites text[], created_at timestamptz, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  perform control_plane.require_operator_v1('viewer');
  return query
  select r.id, r.version, r.channel, r.git_commit, r.config_schema_version, r.backend_contract_min,
    r.backend_contract_max, r.migration_ids, r.reversible, r.status,
    (select pg_catalog.count(*) from control_plane.instance_release_state s where s.desired_release = r.version),
    (select pg_catalog.count(*) from control_plane.instance_release_state s where s.current_release = r.version),
    (select pg_catalog.count(*) from control_plane.rollouts o where o.release_id = r.id),
    control_plane.release_prerequisites_v1(r.id), r.created_at, pg_catalog.count(*) over ()
  from control_plane.releases r
  where (p_channel is null or r.channel = p_channel) and (p_status is null or r.status = p_status)
  order by pg_catalog.string_to_array(r.version,'.')::int[] desc
  limit least(greatest(coalesce(p_limit,25),1),100) offset greatest(coalesce(p_offset,0),0);
end;
$function$;

create or replace function control_plane.get_release_v1(p_release_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_doc jsonb;
begin
  perform control_plane.require_operator_v1('viewer');
  select pg_catalog.to_jsonb(r) - 'registered_by'
    || pg_catalog.jsonb_build_object(
      'registered_by_email',o.email,
      'prerequisites',pg_catalog.to_jsonb(control_plane.release_prerequisites_v1(r.id)),
      'backend_contract_version',control_plane.backend_contract_version_v1(),
      'versions',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'instance_id',s.instance_id,'tenant_id',s.tenant_id,'tenant_name',t.name,
          'desired_release',s.desired_release,'current_release',s.current_release,
          'config_schema_version',s.config_schema_version,'reported_at',s.reported_at) order by t.name)
        from control_plane.instance_release_state s join app.tenants t on t.id = s.tenant_id
        where s.desired_release = r.version or s.current_release = r.version),'[]'::jsonb),
      'rollouts',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'id',x.id,'status',x.status,'target_rings',x.target_rings,'created_at',x.created_at)
          order by x.created_at desc)
        from control_plane.rollouts x where x.release_id = r.id),'[]'::jsonb))
  into v_doc
  from control_plane.releases r
  left join control_plane.operators o on o.auth_user_id = r.registered_by
  where r.id = p_release_id;
  if v_doc is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  return v_doc;
end;
$function$;

create or replace function control_plane.create_rollout_v1(
  p_release_id uuid, p_rings text[], p_instance_ids uuid[], p_reason text, p_idempotency_key text)
returns table (rollout_id uuid, targets integer, skipped integer)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_prior jsonb;
  v_release control_plane.releases%rowtype;
  v_id uuid;
  v_targets integer;
  v_skipped integer;
begin
  v_operator := control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  v_prior := control_plane.replay_request_v1(p_idempotency_key,'rollout.create');
  if v_prior is not null then
    return query select (v_prior->>'rollout_id')::uuid,(v_prior->>'targets')::integer,(v_prior->>'skipped')::integer;
    return;
  end if;
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 5 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  if exists (select 1 from pg_catalog.unnest(coalesce(p_rings,'{}')) g where g not in ('canary','early','general')) then
    raise exception using errcode='22023',message='settings_invalid';
  end if;
  select * into v_release from control_plane.releases r where r.id = p_release_id;
  if v_release.id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;

  insert into control_plane.rollouts(release_id,target_rings,reason,created_by)
  values (p_release_id,coalesce(p_rings,'{}'),pg_catalog.btrim(p_reason),v_operator)
  returning id into v_id;

  -- Active instances in the chosen rings or explicitly named, not already on
  -- this release. Ineligible ones are recorded as skipped with a reason, so the
  -- operator sees why an instance was left out rather than not seeing it.
  insert into control_plane.rollout_targets(rollout_id,tenant_id,instance_id,ring,from_release,status,error_code)
  select v_id, i.tenant_id, i.id, s.rollout_ring, rs.current_release,
    case when rs.config_schema_version > v_release.config_schema_version then 'skipped'
         when exists (select 1 from control_plane.rollout_targets ot
                      join control_plane.rollouts o on o.id = ot.rollout_id
                      where ot.instance_id = i.id and o.status in ('running','paused')
                        and ot.status in ('pending','queued')) then 'skipped'
         else 'pending' end,
    case when rs.config_schema_version > v_release.config_schema_version then 'config_schema_regression'
         when exists (select 1 from control_plane.rollout_targets ot
                      join control_plane.rollouts o on o.id = ot.rollout_id
                      where ot.instance_id = i.id and o.status in ('running','paused')
                        and ot.status in ('pending','queued')) then 'rollout_in_progress' end
  from app.instances i
  left join control_plane.subscriptions s on s.tenant_id = i.tenant_id
  left join control_plane.instance_release_state rs on rs.tenant_id = i.tenant_id and rs.instance_id = i.id
  where i.deployment_state = 'active'
    and rs.current_release is distinct from v_release.version
    and (s.rollout_ring = any(coalesce(p_rings,'{}')) or i.id = any(coalesce(p_instance_ids,'{}')));

  select pg_catalog.count(*) filter (where t.status = 'pending'),
         pg_catalog.count(*) filter (where t.status = 'skipped')
  into v_targets, v_skipped
  from control_plane.rollout_targets t where t.rollout_id = v_id;
  if v_targets = 0 then
    raise exception using errcode='22023',message='no_targets';
  end if;

  perform control_plane.write_audit_v1(v_operator,'rollout.created',null,null,'rollout',v_id::text,p_reason,
    pg_catalog.jsonb_build_object('version',v_release.version,'targets',v_targets,'rows',v_skipped));
  perform control_plane.remember_request_v1(p_idempotency_key,'rollout.create',
    pg_catalog.jsonb_build_object('rollout_id',v_id,'targets',v_targets,'skipped',v_skipped));
  return query select v_id, v_targets, v_skipped;
end;
$function$;

-- Queues every pending target. Shared by start, resume and retry.
create or replace function control_plane.queue_rollout_targets_v1(p_rollout_id uuid, p_operator uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_release control_plane.releases%rowtype;
  v_target record;
  v_job uuid;
  v_count integer := 0;
begin
  select r.* into v_release from control_plane.releases r
  join control_plane.rollouts o on o.release_id = r.id where o.id = p_rollout_id;
  for v_target in
    select t.* from control_plane.rollout_targets t
    where t.rollout_id = p_rollout_id and t.status = 'pending' for update
  loop
    insert into control_plane.instance_release_state(tenant_id,instance_id,desired_release,config_schema_version)
    values (v_target.tenant_id,v_target.instance_id,v_release.version,v_release.config_schema_version)
    on conflict (tenant_id,instance_id) do update
      set desired_release = excluded.desired_release, updated_at = pg_catalog.statement_timestamp();
    v_job := control_plane.enqueue_operator_job_v1(p_operator,'publish_release',v_target.tenant_id,
      v_target.instance_id,pg_catalog.jsonb_build_object('rollout_id',p_rollout_id,
        'release',v_release.version,'git_commit',v_release.git_commit),
      'rollout:' || p_rollout_id::text || ':' || v_target.instance_id::text || ':' || (v_target.attempts + 1)::text);
    update control_plane.rollout_targets t set status = 'queued', job_id = v_job,
      attempts = t.attempts + 1, error_code = null, updated_at = pg_catalog.statement_timestamp()
    where t.rollout_id = p_rollout_id and t.instance_id = v_target.instance_id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$;

-- Un-queues targets whose job no worker has claimed yet; claimed work finishes.
create or replace function control_plane.unqueue_rollout_targets_v1(
  p_rollout_id uuid, p_operator uuid, p_target_status text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_target record;
  v_count integer := 0;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  for v_target in
    select t.* from control_plane.rollout_targets t
    join control_plane.jobs j on j.id = t.job_id
    where t.rollout_id = p_rollout_id and t.status = 'queued' and j.status = 'queued'
    for update of t
  loop
    update control_plane.jobs j set status = 'cancelled', cancelled_by = p_operator,
      cancelled_at = v_now, updated_at = v_now where j.id = v_target.job_id;
    insert into control_plane.job_events(job_id,event,actor_id) values (v_target.job_id,'cancelled',p_operator);
    update control_plane.instance_release_state s set desired_release = v_target.from_release, updated_at = v_now
    where s.tenant_id = v_target.tenant_id and s.instance_id = v_target.instance_id;
    update control_plane.rollout_targets t set status = p_target_status, updated_at = v_now
    where t.rollout_id = p_rollout_id and t.instance_id = v_target.instance_id;
    v_count := v_count + 1;
  end loop;
  if p_target_status = 'cancelled' then
    update control_plane.rollout_targets t set status = 'cancelled', updated_at = v_now
    where t.rollout_id = p_rollout_id and t.status = 'pending';
  end if;
  return v_count;
end;
$function$;

create or replace function control_plane.start_rollout_v1(p_rollout_id uuid)
returns table (rollout_id uuid, status text, blocked text[], queued integer)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_rollout control_plane.rollouts%rowtype;
  v_blocked text[];
  v_queued integer;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  v_operator := control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  select * into v_rollout from control_plane.rollouts o where o.id = p_rollout_id for update;
  if v_rollout.id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  if v_rollout.status not in ('draft','paused') then
    raise exception using errcode='22023',message='transition_not_allowed';
  end if;
  v_blocked := control_plane.release_prerequisites_v1(v_rollout.release_id);
  if pg_catalog.cardinality(v_blocked) > 0 then
    perform control_plane.write_audit_v1(v_operator,'rollout.started',null,null,'rollout',
      p_rollout_id::text,null,pg_catalog.jsonb_build_object('blocked',pg_catalog.to_jsonb(v_blocked)),'failed');
    return query select p_rollout_id, v_rollout.status, v_blocked, 0;
    return;
  end if;
  update control_plane.rollouts o set status = 'running', started_at = coalesce(o.started_at,v_now),
    updated_at = v_now where o.id = p_rollout_id;
  v_queued := control_plane.queue_rollout_targets_v1(p_rollout_id,v_operator);
  perform control_plane.write_audit_v1(v_operator,
    case when v_rollout.status = 'draft' then 'rollout.started' else 'rollout.resumed' end,
    null,null,'rollout',p_rollout_id::text,null,pg_catalog.jsonb_build_object('targets',v_queued));
  return query select p_rollout_id,'running'::text,'{}'::text[],v_queued;
end;
$function$;

create or replace function control_plane.pause_rollout_v1(p_rollout_id uuid, p_reason text)
returns table (rollout_id uuid, status text, unqueued integer)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_rollout control_plane.rollouts%rowtype;
  v_count integer;
begin
  v_operator := control_plane.require_operator_v1('operator');
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 5 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  select * into v_rollout from control_plane.rollouts o where o.id = p_rollout_id for update;
  if v_rollout.id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  if v_rollout.status <> 'running' then
    raise exception using errcode='22023',message='transition_not_allowed';
  end if;
  v_count := control_plane.unqueue_rollout_targets_v1(p_rollout_id,v_operator,'pending');
  update control_plane.rollouts o set status = 'paused', updated_at = pg_catalog.statement_timestamp()
  where o.id = p_rollout_id;
  perform control_plane.write_audit_v1(v_operator,'rollout.paused',null,null,'rollout',
    p_rollout_id::text,p_reason,pg_catalog.jsonb_build_object('targets',v_count));
  return query select p_rollout_id,'paused'::text,v_count;
end;
$function$;

create or replace function control_plane.cancel_rollout_v1(p_rollout_id uuid, p_reason text)
returns table (rollout_id uuid, status text)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_rollout control_plane.rollouts%rowtype;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  v_operator := control_plane.require_operator_v1('admin');
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 5 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  select * into v_rollout from control_plane.rollouts o where o.id = p_rollout_id for update;
  if v_rollout.id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  if v_rollout.status not in ('draft','running','paused') then
    raise exception using errcode='22023',message='transition_not_allowed';
  end if;
  perform control_plane.unqueue_rollout_targets_v1(p_rollout_id,v_operator,'cancelled');
  update control_plane.rollouts o set status = 'cancelled', finished_at = v_now, updated_at = v_now
  where o.id = p_rollout_id;
  perform control_plane.write_audit_v1(v_operator,'rollout.cancelled',null,null,'rollout',
    p_rollout_id::text,p_reason,pg_catalog.jsonb_build_object('from',v_rollout.status));
  return query select p_rollout_id,'cancelled'::text;
end;
$function$;

create or replace function control_plane.retry_rollout_targets_v1(p_rollout_id uuid)
returns table (rollout_id uuid, retried integer)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_rollout control_plane.rollouts%rowtype;
  v_count integer;
begin
  v_operator := control_plane.require_operator_v1('operator');
  select * into v_rollout from control_plane.rollouts o where o.id = p_rollout_id for update;
  if v_rollout.id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  if v_rollout.status not in ('running','paused','failed')
     or not exists (select 1 from control_plane.rollout_targets t
                    where t.rollout_id = p_rollout_id and t.status = 'failed') then
    raise exception using errcode='22023',message='transition_not_allowed';
  end if;
  update control_plane.rollout_targets t set status = 'pending', updated_at = pg_catalog.statement_timestamp()
  where t.rollout_id = p_rollout_id and t.status = 'failed';
  update control_plane.rollouts o set status = 'running', updated_at = pg_catalog.statement_timestamp()
  where o.id = p_rollout_id;
  v_count := control_plane.queue_rollout_targets_v1(p_rollout_id,v_operator);
  perform control_plane.write_audit_v1(v_operator,'rollout.retried',null,null,'rollout',
    p_rollout_id::text,null,pg_catalog.jsonb_build_object('targets',v_count));
  return query select p_rollout_id, v_count;
end;
$function$;

create or replace function control_plane.rollback_rollout_v1(p_rollout_id uuid, p_reason text)
returns table (rollout_id uuid, status text, targets integer)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_rollout control_plane.rollouts%rowtype;
  v_release control_plane.releases%rowtype;
  v_target record;
  v_previous control_plane.releases%rowtype;
  v_job uuid;
  v_count integer := 0;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  v_operator := control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 10 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  select * into v_rollout from control_plane.rollouts o where o.id = p_rollout_id for update;
  if v_rollout.id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  select * into v_release from control_plane.releases r where r.id = v_rollout.release_id;
  if not v_release.reversible then
    raise exception using errcode='22023',message='rollback_not_supported';
  end if;
  if v_rollout.status not in ('running','paused','completed','failed') then
    raise exception using errcode='22023',message='transition_not_allowed';
  end if;

  perform control_plane.unqueue_rollout_targets_v1(p_rollout_id,v_operator,'cancelled');
  for v_target in
    select t.* from control_plane.rollout_targets t
    where t.rollout_id = p_rollout_id and t.status in ('succeeded','failed') for update
  loop
    select * into v_previous from control_plane.releases r where r.version = v_target.from_release;
    if v_previous.id is null
       or control_plane.backend_contract_version_v1()
          not between v_previous.backend_contract_min and v_previous.backend_contract_max then
      update control_plane.rollout_targets t set error_code = 'previous_release_unknown', updated_at = v_now
      where t.rollout_id = p_rollout_id and t.instance_id = v_target.instance_id;
      continue;
    end if;
    update control_plane.instance_release_state s set desired_release = v_previous.version, updated_at = v_now
    where s.tenant_id = v_target.tenant_id and s.instance_id = v_target.instance_id;
    v_job := control_plane.enqueue_operator_job_v1(v_operator,'publish_release',v_target.tenant_id,
      v_target.instance_id,pg_catalog.jsonb_build_object('rollout_id',p_rollout_id,
        'release',v_previous.version,'git_commit',v_previous.git_commit,'rollback',true),
      'rollback:' || p_rollout_id::text || ':' || v_target.instance_id::text);
    update control_plane.rollout_targets t set status = 'rollback_queued', job_id = v_job, updated_at = v_now
    where t.rollout_id = p_rollout_id and t.instance_id = v_target.instance_id;
    v_count := v_count + 1;
  end loop;

  update control_plane.rollouts o set status = 'rolled_back', finished_at = v_now, updated_at = v_now
  where o.id = p_rollout_id;
  perform control_plane.write_audit_v1(v_operator,'rollout.rolled_back',null,null,'rollout',
    p_rollout_id::text,p_reason,pg_catalog.jsonb_build_object('version',v_release.version,'targets',v_count));
  return query select p_rollout_id,'rolled_back'::text,v_count;
end;
$function$;

-- The worker's report. The only path that sets current_release.
create or replace function control_plane.report_rollout_target_v1(
  p_job_id uuid, p_outcome text, p_error_code text, p_observed_release text)
returns table (target_status text, rollout_status text)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_target control_plane.rollout_targets%rowtype;
  v_rollout control_plane.rollouts%rowtype;
  v_status text;
  v_rollout_status text;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  if not control_plane.is_worker_v1() then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  select * into v_target from control_plane.rollout_targets t where t.job_id = p_job_id for update;
  if v_target.rollout_id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  perform control_plane.complete_job_v1(p_job_id,p_outcome,p_error_code);
  select * into v_rollout from control_plane.rollouts o where o.id = v_target.rollout_id for update;

  v_status := case
    when p_outcome = 'succeeded' and v_target.status = 'rollback_queued' then 'rolled_back'
    when p_outcome = 'succeeded' then 'succeeded'
    else 'failed' end;
  update control_plane.rollout_targets t set status = v_status,
    error_code = case when p_outcome = 'failed' then coalesce(p_error_code,'unknown_error') end,
    updated_at = v_now
  where t.rollout_id = v_target.rollout_id and t.instance_id = v_target.instance_id;
  if p_outcome = 'succeeded' and p_observed_release is not null then
    update control_plane.instance_release_state s set current_release = p_observed_release,
      reported_at = v_now, updated_at = v_now
    where s.tenant_id = v_target.tenant_id and s.instance_id = v_target.instance_id;
  end if;

  v_rollout_status := v_rollout.status;
  if v_rollout.status = 'running' and v_status = 'failed' then
    perform control_plane.unqueue_rollout_targets_v1(v_rollout.id,null,'pending');
    v_rollout_status := 'paused';
  elsif v_rollout.status = 'running' and not exists (
      select 1 from control_plane.rollout_targets t
      where t.rollout_id = v_rollout.id and t.status in ('pending','queued','failed')) then
    v_rollout_status := 'completed';
  end if;
  update control_plane.rollouts o set status = v_rollout_status,
    finished_at = case when v_rollout_status = 'completed' then v_now else o.finished_at end,
    updated_at = v_now
  where o.id = v_rollout.id;
  return query select v_status, v_rollout_status;
end;
$function$;

create or replace function control_plane.list_rollouts_v1(
  p_status text default null, p_release_id uuid default null,
  p_limit integer default 25, p_offset integer default 0)
returns table (rollout_id uuid, release_id uuid, version text, status text, target_rings text[],
  reason text, created_by_email text, targets_total bigint, targets_succeeded bigint,
  targets_failed bigint, targets_queued bigint, targets_skipped bigint,
  started_at timestamptz, finished_at timestamptz, created_at timestamptz, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  perform control_plane.require_operator_v1('viewer');
  return query
  select o.id, o.release_id, r.version, o.status, o.target_rings, o.reason, op.email,
    (select pg_catalog.count(*) from control_plane.rollout_targets t where t.rollout_id = o.id),
    (select pg_catalog.count(*) from control_plane.rollout_targets t where t.rollout_id = o.id and t.status in ('succeeded','rolled_back')),
    (select pg_catalog.count(*) from control_plane.rollout_targets t where t.rollout_id = o.id and t.status = 'failed'),
    (select pg_catalog.count(*) from control_plane.rollout_targets t where t.rollout_id = o.id and t.status in ('queued','rollback_queued')),
    (select pg_catalog.count(*) from control_plane.rollout_targets t where t.rollout_id = o.id and t.status in ('skipped','cancelled')),
    o.started_at, o.finished_at, o.created_at, pg_catalog.count(*) over ()
  from control_plane.rollouts o
  join control_plane.releases r on r.id = o.release_id
  left join control_plane.operators op on op.auth_user_id = o.created_by
  where (p_status is null or o.status = p_status) and (p_release_id is null or o.release_id = p_release_id)
  order by o.created_at desc, o.id
  limit least(greatest(coalesce(p_limit,25),1),100) offset greatest(coalesce(p_offset,0),0);
end;
$function$;

create or replace function control_plane.get_rollout_v1(p_rollout_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_doc jsonb;
begin
  perform control_plane.require_operator_v1('viewer');
  select pg_catalog.jsonb_build_object(
    'id',o.id,'status',o.status,'target_rings',o.target_rings,'reason',o.reason,
    'created_by_email',op.email,'started_at',o.started_at,'finished_at',o.finished_at,
    'created_at',o.created_at,'updated_at',o.updated_at,
    'release',pg_catalog.jsonb_build_object('id',r.id,'version',r.version,'channel',r.channel,
      'reversible',r.reversible,'status',r.status),
    'blocked',pg_catalog.to_jsonb(control_plane.release_prerequisites_v1(r.id)),
    'counts',(select coalesce(pg_catalog.jsonb_object_agg(c.status,c.n),'{}'::jsonb)
      from (select t.status, pg_catalog.count(*) n from control_plane.rollout_targets t
            where t.rollout_id = o.id group by t.status) c),
    'targets',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'instance_id',t.instance_id,'tenant_id',t.tenant_id,'tenant_name',tn.name,'ring',t.ring,
        'from_release',t.from_release,'status',t.status,'attempts',t.attempts,'error_code',t.error_code,
        'job_id',t.job_id,'job_status',j.status,'current_release',s.current_release,
        'reported_at',s.reported_at,'updated_at',t.updated_at) order by tn.name)
      from control_plane.rollout_targets t
      join app.tenants tn on tn.id = t.tenant_id
      left join control_plane.jobs j on j.id = t.job_id
      left join control_plane.instance_release_state s on s.tenant_id = t.tenant_id and s.instance_id = t.instance_id
      where t.rollout_id = o.id),'[]'::jsonb),
    'history',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) - 'total_count')
      from (select * from control_plane.audit_rows_v1(null,'rollout',null,null,null,null,null,100,0) x
            where x.target_id = o.id::text) a),'[]'::jsonb))
  into v_doc
  from control_plane.rollouts o
  join control_plane.releases r on r.id = o.release_id
  left join control_plane.operators op on op.auth_user_id = o.created_by
  where o.id = p_rollout_id;
  if v_doc is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  return v_doc;
end;
$function$;

-- api_v1 pass-throughs
create or replace function api_v1.register_release_v1(p_version text, p_channel text, p_git_commit text,
  p_config_schema_version integer, p_backend_min integer, p_backend_max integer, p_migration_ids text[],
  p_feature_notes text[], p_upgrade_notes text[], p_reversible boolean, p_idempotency_key text)
returns table (release_id uuid)
language sql security definer set search_path to ''
as $$ select * from control_plane.register_release_v1(p_version,p_channel,p_git_commit,p_config_schema_version,p_backend_min,p_backend_max,p_migration_ids,p_feature_notes,p_upgrade_notes,p_reversible,p_idempotency_key); $$;

create or replace function api_v1.set_release_status_v1(p_release_id uuid, p_status text, p_reason text)
returns table (release_id uuid, status text)
language sql security definer set search_path to ''
as $$ select * from control_plane.set_release_status_v1(p_release_id,p_status,p_reason); $$;

create or replace function api_v1.list_releases_v1(p_channel text default null, p_status text default null,
  p_limit integer default 25, p_offset integer default 0)
returns table (release_id uuid, version text, channel text, git_commit text, config_schema_version integer,
  backend_contract_min integer, backend_contract_max integer, migration_ids text[], reversible boolean,
  status text, instances_desired bigint, instances_current bigint, rollouts bigint,
  prerequisites text[], created_at timestamptz, total_count bigint)
language sql security definer set search_path to ''
as $$ select * from control_plane.list_releases_v1(p_channel,p_status,p_limit,p_offset); $$;

create or replace function api_v1.get_release_v1(p_release_id uuid) returns jsonb
language sql security definer set search_path to ''
as $$ select control_plane.get_release_v1(p_release_id); $$;

create or replace function api_v1.create_rollout_v1(p_release_id uuid, p_rings text[], p_instance_ids uuid[],
  p_reason text, p_idempotency_key text)
returns table (rollout_id uuid, targets integer, skipped integer)
language sql security definer set search_path to ''
as $$ select * from control_plane.create_rollout_v1(p_release_id,p_rings,p_instance_ids,p_reason,p_idempotency_key); $$;

create or replace function api_v1.start_rollout_v1(p_rollout_id uuid)
returns table (rollout_id uuid, status text, blocked text[], queued integer)
language sql security definer set search_path to ''
as $$ select * from control_plane.start_rollout_v1(p_rollout_id); $$;

create or replace function api_v1.pause_rollout_v1(p_rollout_id uuid, p_reason text)
returns table (rollout_id uuid, status text, unqueued integer)
language sql security definer set search_path to ''
as $$ select * from control_plane.pause_rollout_v1(p_rollout_id,p_reason); $$;

create or replace function api_v1.cancel_rollout_v1(p_rollout_id uuid, p_reason text)
returns table (rollout_id uuid, status text)
language sql security definer set search_path to ''
as $$ select * from control_plane.cancel_rollout_v1(p_rollout_id,p_reason); $$;

create or replace function api_v1.retry_rollout_targets_v1(p_rollout_id uuid)
returns table (rollout_id uuid, retried integer)
language sql security definer set search_path to ''
as $$ select * from control_plane.retry_rollout_targets_v1(p_rollout_id); $$;

create or replace function api_v1.rollback_rollout_v1(p_rollout_id uuid, p_reason text)
returns table (rollout_id uuid, status text, targets integer)
language sql security definer set search_path to ''
as $$ select * from control_plane.rollback_rollout_v1(p_rollout_id,p_reason); $$;

create or replace function api_v1.list_rollouts_v1(p_status text default null, p_release_id uuid default null,
  p_limit integer default 25, p_offset integer default 0)
returns table (rollout_id uuid, release_id uuid, version text, status text, target_rings text[],
  reason text, created_by_email text, targets_total bigint, targets_succeeded bigint,
  targets_failed bigint, targets_queued bigint, targets_skipped bigint,
  started_at timestamptz, finished_at timestamptz, created_at timestamptz, total_count bigint)
language sql security definer set search_path to ''
as $$ select * from control_plane.list_rollouts_v1(p_status,p_release_id,p_limit,p_offset); $$;

create or replace function api_v1.get_rollout_v1(p_rollout_id uuid) returns jsonb
language sql security definer set search_path to ''
as $$ select control_plane.get_rollout_v1(p_rollout_id); $$;

create or replace function api_v1.report_rollout_target_v1(p_job_id uuid, p_outcome text,
  p_error_code text, p_observed_release text)
returns table (target_status text, rollout_status text)
language sql security definer set search_path to ''
as $$ select * from control_plane.report_rollout_target_v1(p_job_id,p_outcome,p_error_code,p_observed_release); $$;

revoke all on all functions in schema control_plane from public,anon,authenticated;
grant execute on function control_plane.contains_no_secret_v1(jsonb) to service_role;

revoke all on function
  api_v1.register_release_v1(text,text,text,integer,integer,integer,text[],text[],text[],boolean,text),
  api_v1.set_release_status_v1(uuid,text,text),
  api_v1.list_releases_v1(text,text,integer,integer),
  api_v1.get_release_v1(uuid),
  api_v1.create_rollout_v1(uuid,text[],uuid[],text,text),
  api_v1.start_rollout_v1(uuid),
  api_v1.pause_rollout_v1(uuid,text),
  api_v1.cancel_rollout_v1(uuid,text),
  api_v1.retry_rollout_targets_v1(uuid),
  api_v1.rollback_rollout_v1(uuid,text),
  api_v1.list_rollouts_v1(text,uuid,integer,integer),
  api_v1.get_rollout_v1(uuid),
  api_v1.report_rollout_target_v1(uuid,text,text,text)
from public, anon, authenticated;
grant execute on function
  api_v1.register_release_v1(text,text,text,integer,integer,integer,text[],text[],text[],boolean,text),
  api_v1.set_release_status_v1(uuid,text,text),
  api_v1.list_releases_v1(text,text,integer,integer),
  api_v1.get_release_v1(uuid),
  api_v1.create_rollout_v1(uuid,text[],uuid[],text,text),
  api_v1.start_rollout_v1(uuid),
  api_v1.pause_rollout_v1(uuid,text),
  api_v1.cancel_rollout_v1(uuid,text),
  api_v1.retry_rollout_targets_v1(uuid),
  api_v1.rollback_rollout_v1(uuid,text),
  api_v1.list_rollouts_v1(text,uuid,integer,integer),
  api_v1.get_rollout_v1(uuid)
to authenticated;
grant execute on function api_v1.report_rollout_target_v1(uuid,text,text,text) to service_role;
```

Note on `unqueue_rollout_targets_v1(…, null, 'pending')` from the worker path: `cancelled_by` and `job_events.actor_id` accept null, which correctly records "the system paused this", not an operator.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `rtk node scripts/platform-admin-local.mjs replay && rtk node scripts/platform-admin-local.mjs test 2>&1 | tail -40`
Expected: `platform_admin_releases_test.sql .. ok`.

- [ ] **Step 5: Commit**

```bash
rtk git add supabase/migrations/20261006160000_platform_admin_releases.sql supabase/tests/database/platform_admin_releases_test.sql
rtk git commit -m "Model releases and rollouts with worker-reported progress"
```

---

### Task 7: Operators, support access, health reads, integrations, platform flags, alerts, overview

**Files:**
- Create: `supabase/migrations/20261006170000_platform_admin_security_health.sql`
- Create: `supabase/tests/database/platform_admin_security_health_test.sql`

**Interfaces:**
- Produces: table `control_plane.integrations`; internal `assert_usable_admin_remains_v1()`; api_v1 `list_operators_v1`, `add_operator_v1`, `set_operator_role_v1`, `disable_operator_v1`, `enable_operator_v1`, `list_support_grants_v2`, `request_support_grant_v1`, `approve_support_access_v1`, `revoke_support_grant_v1`, `list_health_v1`, `list_alerts_v1`, `list_integrations_v1`, `save_integration_references_v1`, `request_integration_check_v1`, `record_integration_status_v1`*, `list_platform_flags_v1`, `save_platform_flag_v1`, `get_overview_v1`.

- [ ] **Step 1: Write the failing test**

`supabase/tests/database/platform_admin_security_health_test.sql` (begin/no_plan, helper block, then):
```sql
-- Exactly one usable admin to start (others from earlier fixtures are absent in this file).
update control_plane.operators set disabled_at = now() where role in ('admin','break_glass');
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000a','admin',30);
select pg_temp.verified_factor('c0000000-0000-0000-0000-00000000000a');
select pg_temp.user('c0000000-0000-0000-0000-00000000000b','admin-b@example.invalid');
select pg_temp.user('c0000000-0000-0000-0000-00000000000f','new-person@example.invalid');

set local role authenticated;
-- Operator directory.
select ok((select mfa_verified from api_v1.list_operators_v1() where operator_id='c0000000-0000-0000-0000-00000000000a'),
  'the directory shows verified MFA');
select throws_ok($$ select * from api_v1.add_operator_v1('nobody@example.invalid','viewer',null,'Hire onboarding') $$,
  'P0002','account_not_found','only an existing account can be added');
select lives_ok($$ select * from api_v1.add_operator_v1('NEW-PERSON@example.invalid','viewer',null,'Hire onboarding') $$,
  'an admin adds an operator by email, case-insensitively');
select throws_ok($$ select * from api_v1.add_operator_v1('new-person@example.invalid','viewer',null,'Hire onboarding') $$,
  '23505','operator_exists','adding twice is refused');

-- Last usable admin is protected.
select throws_ok($$ select * from api_v1.set_operator_role_v1('c0000000-0000-0000-0000-00000000000a','operator',null,'Stepping back now') $$,
  '42501','last_admin_protected','the only admin cannot demote themselves');
select throws_ok($$ select * from api_v1.disable_operator_v1('c0000000-0000-0000-0000-00000000000a','Leaving the company') $$,
  '42501','last_admin_protected','or be disabled');

-- An admin without verified MFA does not count as usable.
select lives_ok($$ select * from api_v1.add_operator_v1('admin-b@example.invalid','admin',null,'Second admin') $$,'a second admin is added');
select throws_ok($$ select * from api_v1.disable_operator_v1('c0000000-0000-0000-0000-00000000000a','Leaving the company') $$,
  '42501','last_admin_protected','an admin with no verified factor is not a usable admin');
reset role;
select pg_temp.verified_factor('c0000000-0000-0000-0000-00000000000b');
set local role authenticated;
select lives_ok($$ select * from api_v1.set_operator_role_v1('c0000000-0000-0000-0000-00000000000a','operator',null,'Stepping back now') $$,
  'with a second usable admin, demotion works');
reset role;

-- Break-glass: bounded, never self-granted, step-up.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000b','admin',30);
set local role authenticated;
select throws_ok($$ select * from api_v1.set_operator_role_v1('c0000000-0000-0000-0000-00000000000b','break_glass',now()+interval '1 hour','Incident 42 response') $$,
  '42501','self_grant_denied','nobody grants themselves break-glass');
select throws_ok($$ select * from api_v1.set_operator_role_v1('c0000000-0000-0000-0000-00000000000a','break_glass',now()+interval '9 hours','Incident 42 response') $$,
  '22023','expiry_invalid','break-glass longer than eight hours is refused');
select lives_ok($$ select * from api_v1.set_operator_role_v1('c0000000-0000-0000-0000-00000000000a','break_glass',now()+interval '1 hour','Incident 42 response') $$,
  'a bounded grant to someone else works');
reset role;
select is((select count(*)::int from control_plane.audit_events where action='operator.role_changed'
  and reason='Incident 42 response'),1,'with its reason audited');

-- Support access: request (operator), approve (other admin, step-up), revoke.
select set_config('test.t',(select tenant_id::text from control_plane.create_tenant_v2('Support Tenant','support-tenant','support-tenant-create-1')),true);
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000c','operator');
set local role authenticated;
select set_config('test.g',(select grant_id::text from api_v1.request_support_grant_v1(current_setting('test.t')::uuid,
  'Customer cannot see Tuesday slots','TICKET-1042',null,60)),true);
select is((select status from api_v1.list_support_grants_v2('pending',null,10,0)),'pending','the request is pending');
reset role;
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000b','admin',3600);
set local role authenticated;
select throws_ok(format($$ select * from api_v1.approve_support_access_v1(%L,60) $$,current_setting('test.g')),
  '42501','recent_authentication_required','approval needs step-up');
reset role;
select pg_temp.claims('c0000000-0000-0000-0000-00000000000b','aal2',30);
set local role authenticated;
select is((select status from api_v1.approve_support_access_v1(current_setting('test.g')::uuid,60)),'active','a recent admin approves');
select is((select requested_by_email from api_v1.list_support_grants_v2('active',null,10,0)),
  'op-c0000000-0000-0000-0000-00000000000c@example.invalid','active access shows who holds it');
select is((select status from api_v1.revoke_support_grant_v1(current_setting('test.g')::uuid,'Issue resolved')),'revoked','and it can be ended');
reset role;

-- Health reads: unknown is explicit, stale is computed.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000d','viewer');
set local role authenticated;
select ok(exists (select 1 from api_v1.list_health_v1('unknown',null,50,0)
  where tenant_id=current_setting('test.t')::uuid),'an unobserved instance is listed as unknown');
reset role;
select pg_temp.as_worker();
select control_plane.record_health_observation_v1('instance',current_setting('test.t')::uuid,
  (select id from app.instances where tenant_id=current_setting('test.t')::uuid),'client','http_health','healthy',null,'{}',now()-interval '2 hours');
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000d','viewer');
set local role authenticated;
select is((select freshness from api_v1.list_health_v1(null,'instance',50,0) where tenant_id=current_setting('test.t')::uuid),
  'stale','a two-hour-old healthy observation is stale, not healthy-now');
select ok(exists (select 1 from api_v1.list_alerts_v1() where kind='stale_observation'),'and raises a stale alert');
select ok(exists (select 1 from api_v1.list_alerts_v1() where kind='break_glass_active'),'active break-glass is an alert');

-- Overview: real counts and explicit unknowns.
select ok((select (get_overview_v1->>'tenant_total')::int >= 1 from api_v1.get_overview_v1()),'overview counts tenants');
select ok((select (get_overview_v1->'health'->>'unobserved')::int >= 0 from api_v1.get_overview_v1()),'overview reports unobserved instances');
reset role;

-- Integrations: references only, connection checks are jobs.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000b','admin',30);
set local role authenticated;
select is((select status from api_v1.list_integrations_v1() where provider='github'),'not_configured',
  'an integration nobody has reported on is not configured');
select throws_ok($$ select * from api_v1.save_integration_references_v1('github',array['ghp_abcdefghijklmnop']) $$,
  '22023','reference_invalid','a token-shaped reference is refused');
select lives_ok($$ select * from api_v1.save_integration_references_v1('github',array['GITHUB_APP_ID','GITHUB_APP_PRIVATE_KEY']) $$,
  'environment variable names are accepted');
select is((select job_id from api_v1.request_integration_check_v1('github')),(select job_id from api_v1.request_integration_check_v1('github')),
  'a second check request reuses the queued job');
reset role;
select pg_temp.as_worker();
select control_plane.record_integration_status_v1('github',repeat('a',64),'reachable',null,false);
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000d','viewer');
set local role authenticated;
select is((select status from api_v1.list_integrations_v1() where provider='github'),'reachable',
  'reachable is distinct from verified');
reset role;

-- Platform flags.
select pg_temp.as_operator('c0000000-0000-0000-0000-00000000000b','admin',30);
set local role authenticated;
select throws_ok($$ select * from api_v1.save_platform_flag_v1('maintenance.oct','incident_banner',true,'Maintenance tonight',null,null,null,'Planned maintenance') $$,
  '22023','flag_invalid','a banner needs both languages');
select lives_ok($$ select * from api_v1.save_platform_flag_v1('maintenance.oct','incident_banner',true,'Maintenance tonight','صيانة الليلة',null,null,'Planned maintenance') $$,
  'a bilingual banner is saved');
reset role;
select is((select message_en from api_v1.get_platform_notice_v1()),'Maintenance tonight','and reaches tenants through the existing notice');

-- Tenant sessions see none of it.
select pg_temp.user('c0000000-0000-0000-0000-00000000000e','tenant-user@example.invalid');
select pg_temp.claims('c0000000-0000-0000-0000-00000000000e','aal2');
set local role authenticated;
select throws_ok($$ select * from api_v1.list_operators_v1() $$,'42501','policy_denied','tenant sessions cannot list operators');
select throws_ok($$ select api_v1.get_overview_v1() $$,'42501','policy_denied','or read the overview');
reset role;

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to verify it fails**

Run: `rtk node scripts/platform-admin-local.mjs test 2>&1 | grep -A5 platform_admin_security_health`
Expected: FAIL — `function api_v1.list_operators_v1() does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261006170000_platform_admin_security_health.sql`:
```sql
-- Platform Admin completion, part 6: operators, support, health, integrations,
-- flags, alerts and the overview.
--
-- Operators: a "usable" admin is listed, enabled, unexpired, role admin, and has
-- a verified second factor. No change may leave zero usable admins; the check
-- runs after the change inside the same transaction, under a table lock so two
-- simultaneous demotions cannot each believe the other admin remains.
-- Break-glass is bounded to eight hours and never self-granted.
--
-- Health and integrations show only what a worker reported. "Configured",
-- "reachable" and "verified" are three different facts with three different
-- sources, and an integration nobody reported on is "not_configured", never ok.

-- ---------------------------------------------------------------------------
-- 1. Operators
-- ---------------------------------------------------------------------------
create or replace function control_plane.assert_usable_admin_remains_v1()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not exists (
    select 1 from control_plane.operators o
    where o.role = 'admin' and o.disabled_at is null
      and (o.expires_at is null or o.expires_at > pg_catalog.statement_timestamp())
      and exists (select 1 from auth.mfa_factors f
                  where f.user_id = o.auth_user_id and f.status = 'verified')) then
    raise exception using errcode='42501',message='last_admin_protected';
  end if;
end;
$function$;

create or replace function control_plane.validate_operator_role_v1(
  p_operator uuid, p_target uuid, p_role text, p_expires_at timestamptz)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_role not in ('viewer','operator','admin','break_glass') then
    raise exception using errcode='22023',message='settings_invalid';
  end if;
  if p_role = 'break_glass' then
    if p_target = p_operator then
      raise exception using errcode='42501',message='self_grant_denied';
    end if;
    if p_expires_at is null or p_expires_at <= pg_catalog.statement_timestamp()
       or p_expires_at > pg_catalog.statement_timestamp() + interval '8 hours' then
      raise exception using errcode='22023',message='expiry_invalid';
    end if;
  elsif p_expires_at is not null and p_expires_at <= pg_catalog.statement_timestamp() then
    raise exception using errcode='22023',message='expiry_invalid';
  end if;
end;
$function$;

create or replace function control_plane.list_operators_v1()
returns table (operator_id uuid, email text, role text, expires_at timestamptz,
  disabled_at timestamptz, mfa_verified boolean, last_sign_in_at timestamptz,
  created_at timestamptz, updated_at timestamptz, usable_admin boolean)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  perform control_plane.require_operator_v1('viewer');
  return query
  select o.auth_user_id, o.email, o.role, o.expires_at, o.disabled_at,
    exists (select 1 from auth.mfa_factors f where f.user_id = o.auth_user_id and f.status = 'verified'),
    u.last_sign_in_at, o.created_at, o.updated_at,
    (o.role = 'admin' and o.disabled_at is null
      and (o.expires_at is null or o.expires_at > pg_catalog.statement_timestamp())
      and exists (select 1 from auth.mfa_factors f where f.user_id = o.auth_user_id and f.status = 'verified'))
  from control_plane.operators o
  left join auth.users u on u.id = o.auth_user_id
  order by o.disabled_at nulls first, o.role, o.email;
end;
$function$;

create or replace function control_plane.add_operator_v1(
  p_email text, p_role text, p_expires_at timestamptz, p_reason text)
returns table (operator_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_user uuid;
  v_email text := pg_catalog.lower(pg_catalog.btrim(p_email));
begin
  v_operator := control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 5 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  lock table control_plane.operators in share row exclusive mode;
  select u.id into v_user from auth.users u where pg_catalog.lower(u.email) = v_email;
  if v_user is null then
    raise exception using errcode='P0002',message='account_not_found';
  end if;
  perform control_plane.validate_operator_role_v1(v_operator,v_user,p_role,p_expires_at);
  if exists (select 1 from control_plane.operators o where o.auth_user_id = v_user) then
    raise exception using errcode='23505',message='operator_exists';
  end if;
  insert into control_plane.operators(auth_user_id,email,role,expires_at)
  values (v_user,v_email,p_role,p_expires_at);
  perform control_plane.write_audit_v1(v_operator,'operator.added',null,null,'operator',v_user::text,
    p_reason,pg_catalog.jsonb_build_object('role',p_role,'expires_at',p_expires_at));
  return query select v_user;
end;
$function$;

create or replace function control_plane.set_operator_role_v1(
  p_operator_id uuid, p_role text, p_expires_at timestamptz, p_reason text)
returns table (operator_id uuid, role text)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_before control_plane.operators%rowtype;
begin
  v_operator := control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 5 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  lock table control_plane.operators in share row exclusive mode;
  select * into v_before from control_plane.operators o where o.auth_user_id = p_operator_id;
  if v_before.auth_user_id is null then
    raise exception using errcode='P0002',message='not_found';
  end if;
  perform control_plane.validate_operator_role_v1(v_operator,p_operator_id,p_role,p_expires_at);
  update control_plane.operators o set role = p_role, expires_at = p_expires_at,
    updated_at = pg_catalog.statement_timestamp()
  where o.auth_user_id = p_operator_id;
  perform control_plane.assert_usable_admin_remains_v1();
  perform control_plane.write_audit_v1(v_operator,'operator.role_changed',null,null,'operator',
    p_operator_id::text,p_reason,pg_catalog.jsonb_build_object('from',v_before.role,'to',p_role,
      'expires_at',p_expires_at));
  return query select p_operator_id, p_role;
end;
$function$;

create or replace function control_plane.disable_operator_v1(p_operator_id uuid, p_reason text)
returns table (operator_id uuid, disabled_at timestamptz, grants_revoked integer)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_revoked integer;
begin
  v_operator := control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 5 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  lock table control_plane.operators in share row exclusive mode;
  update control_plane.operators o set disabled_at = v_now, updated_at = v_now
  where o.auth_user_id = p_operator_id and o.disabled_at is null;
  if not found then
    raise exception using errcode='22023',message='transition_not_allowed';
  end if;
  perform control_plane.assert_usable_admin_remains_v1();
  -- Access already ends on the next statement; this makes the list say so too.
  update control_plane.support_grants g set status = 'revoked', revoked_at = v_now, revoked_by = v_operator
  where g.operator_id = p_operator_id and g.status in ('pending','active');
  get diagnostics v_revoked = row_count;
  perform control_plane.write_audit_v1(v_operator,'operator.disabled',null,null,'operator',
    p_operator_id::text,p_reason,pg_catalog.jsonb_build_object('rows',v_revoked));
  return query select p_operator_id, v_now, v_revoked;
end;
$function$;

create or replace function control_plane.enable_operator_v1(p_operator_id uuid, p_reason text)
returns table (operator_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
begin
  v_operator := control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 5 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  update control_plane.operators o set disabled_at = null, updated_at = pg_catalog.statement_timestamp()
  where o.auth_user_id = p_operator_id and o.disabled_at is not null
    -- An expired break-glass row stays expired; re-enabling is not re-granting.
    and (o.expires_at is null or o.expires_at > pg_catalog.statement_timestamp());
  if not found then
    raise exception using errcode='22023',message='transition_not_allowed';
  end if;
  perform control_plane.write_audit_v1(v_operator,'operator.enabled',null,null,'operator',
    p_operator_id::text,p_reason,'{}'::jsonb);
  return query select p_operator_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Support access
-- ---------------------------------------------------------------------------
create or replace function control_plane.list_support_grants_v2(
  p_status text default null, p_tenant_id uuid default null,
  p_limit integer default 25, p_offset integer default 0)
returns table (grant_id uuid, tenant_id uuid, tenant_name text, requested_by_email text,
  approved_by_email text, revoked_by_email text, ticket_reference text, reason text, scope text,
  location_id uuid, status text, requested_at timestamptz, approved_at timestamptz,
  expires_at timestamptz, revoked_at timestamptz, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  perform control_plane.require_operator_v1('viewer');
  return query
  with g as (
    select g.*, case when g.status = 'active' and g.expires_at <= pg_catalog.statement_timestamp()
                     then 'expired' else g.status end as effective
    from control_plane.support_grants g)
  select g.id, g.tenant_id, t.name, ro.email, ao.email, vo.email, g.ticket_reference, g.reason,
    g.scope, g.location_id, g.effective, g.requested_at, g.approved_at, g.expires_at, g.revoked_at,
    pg_catalog.count(*) over ()
  from g
  join app.tenants t on t.id = g.tenant_id
  left join control_plane.operators ro on ro.auth_user_id = g.operator_id
  left join control_plane.operators ao on ao.auth_user_id = g.approved_by
  left join control_plane.operators vo on vo.auth_user_id = g.revoked_by
  where (p_status is null or g.effective = p_status) and (p_tenant_id is null or g.tenant_id = p_tenant_id)
  order by case g.effective when 'active' then 1 when 'pending' then 2 else 3 end, g.requested_at desc
  limit least(greatest(coalesce(p_limit,25),1),100) offset greatest(coalesce(p_offset,0),0);
end;
$function$;

create or replace function control_plane.approve_support_access_v1(p_grant_id uuid, p_minutes integer)
returns table (grant_id uuid, status text, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  perform control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  return query select * from control_plane.approve_support_grant_v1(p_grant_id,p_minutes);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Health reads and alerts
-- ---------------------------------------------------------------------------
create or replace function control_plane.list_health_v1(
  p_status text default null, p_subject_kind text default null,
  p_limit integer default 50, p_offset integer default 0)
returns table (subject_kind text, tenant_id uuid, tenant_name text, instance_id uuid,
  subject_key text, signal text, status text, freshness text, error_code text,
  observed_at timestamptz, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  perform control_plane.require_operator_v1('viewer');
  return query
  with latest as (
    select distinct on (h.subject_kind,h.instance_id,h.subject_key,h.signal)
      h.subject_kind, h.tenant_id, h.instance_id, h.subject_key, h.signal, h.status,
      h.error_code, h.observed_at
    from control_plane.health_observations h
    order by h.subject_kind,h.instance_id,h.subject_key,h.signal,h.observed_at desc),
  rows as (
    select l.subject_kind, l.tenant_id, l.instance_id, l.subject_key, l.signal, l.status,
      case when l.observed_at < pg_catalog.statement_timestamp() - interval '30 minutes'
           then 'stale' else 'fresh' end as freshness, l.error_code, l.observed_at
    from latest l
    union all
    -- Instances that should be observed and are not: an explicit unknown.
    select 'instance', i.tenant_id, i.id, 'instance', 'any', 'unknown', 'never', null, null
    from app.instances i
    where i.deployment_state in ('provisioning','active')
      and not exists (select 1 from control_plane.health_observations h
                      where h.subject_kind = 'instance' and h.instance_id = i.id))
  select r.subject_kind, r.tenant_id, t.name, r.instance_id, r.subject_key, r.signal, r.status,
    r.freshness, r.error_code, r.observed_at, pg_catalog.count(*) over ()
  from rows r left join app.tenants t on t.id = r.tenant_id
  where (p_status is null or r.status = p_status or (p_status = 'stale' and r.freshness = 'stale'))
    and (p_subject_kind is null or r.subject_kind = p_subject_kind)
  order by case r.status when 'failing' then 1 when 'unknown' then 2 when 'degraded' then 3 else 4 end,
    r.observed_at nulls first, t.name
  limit least(greatest(coalesce(p_limit,50),1),100) offset greatest(coalesce(p_offset,0),0);
end;
$function$;

-- Every row is derived from stored evidence; no thresholds on invented metrics.
create or replace function control_plane.list_alerts_v1()
returns table (severity text, kind text, tenant_id uuid, tenant_name text, subject_id text,
  code text, observed_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  perform control_plane.require_operator_v1('viewer');
  return query
  select * from (
    select 'critical'::text, 'provisioning_failed'::text, r.tenant_id, t.name, r.id::text, r.last_error_code, r.updated_at
    from control_plane.provisioning_runs r join app.tenants t on t.id = r.tenant_id where r.state = 'failed'
    union all
    select 'critical', 'job_failed', j.tenant_id, t.name, j.id::text, j.last_error_code, j.updated_at
    from control_plane.jobs j left join app.tenants t on t.id = j.tenant_id where j.status = 'failed'
    union all
    select 'critical', 'health_failing', h.tenant_id, t.name, h.instance_id::text, h.error_code, h.observed_at
    from (select distinct on (x.instance_id,x.subject_key,x.signal) x.* from control_plane.health_observations x
          where x.subject_kind = 'instance' order by x.instance_id,x.subject_key,x.signal,x.observed_at desc) h
    left join app.tenants t on t.id = h.tenant_id where h.status = 'failing'
    union all
    select 'warning', 'rollout_paused', null, null, o.id::text,
      (select pg_catalog.min(rt.error_code) from control_plane.rollout_targets rt where rt.rollout_id = o.id and rt.status = 'failed'),
      o.updated_at
    from control_plane.rollouts o where o.status = 'paused'
    union all
    select 'warning', 'stale_observation', h.tenant_id, t.name, h.instance_id::text, h.signal, h.observed_at
    from (select distinct on (x.instance_id,x.subject_key,x.signal) x.* from control_plane.health_observations x
          where x.subject_kind = 'instance' order by x.instance_id,x.subject_key,x.signal,x.observed_at desc) h
    left join app.tenants t on t.id = h.tenant_id where h.observed_at < v_now - interval '30 minutes'
    union all
    select 'warning', 'drift', f.tenant_id, t.name, f.instance_id::text, f.provider || ':' || f.resource_kind, f.observed_at
    from control_plane.instance_infrastructure f join app.tenants t on t.id = f.tenant_id
    where exists (select 1 from pg_catalog.jsonb_each(f.desired_state) d where f.observed_state -> d.key is distinct from d.value)
    union all
    select 'warning', 'approval_pending', j.tenant_id, t.name, j.id::text, j.kind, j.created_at
    from control_plane.jobs j left join app.tenants t on t.id = j.tenant_id
    where j.kind in ('close_instance','rotate_secret') and j.approved_by is null and j.status = 'queued'
    union all
    select 'warning', 'support_pending', g.tenant_id, t.name, g.id::text, g.ticket_reference, g.requested_at
    from control_plane.support_grants g join app.tenants t on t.id = g.tenant_id where g.status = 'pending'
    union all
    select 'critical', 'break_glass_active', null, null, o.auth_user_id::text, o.email, o.expires_at
    from control_plane.operators o
    where o.role = 'break_glass' and o.disabled_at is null and o.expires_at > v_now
  ) a(severity,kind,tenant_id,tenant_name,subject_id,code,observed_at)
  order by case a.severity when 'critical' then 1 else 2 end, a.observed_at desc nulls last;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Integrations
-- ---------------------------------------------------------------------------
-- Names of secrets in the worker's environment, never their values. A check
-- constraint cannot hold a subquery, so the per-element rule is a function.
create or replace function control_plane.valid_secret_references_v1(p_refs text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(r ~ '^[A-Z][A-Z0-9_]{2,80}$'
    and control_plane.contains_no_secret_v1(pg_catalog.jsonb_build_object('r',r))), true)
  from pg_catalog.unnest(coalesce(p_refs,'{}')) r;
$$;

create table control_plane.integrations (
  provider text not null primary key check (provider in ('github','vercel','resend','stripe','supabase')),
  secret_references text[] not null default '{}' check (control_plane.valid_secret_references_v1(secret_references)),
  configured_fingerprint text check (configured_fingerprint is null or configured_fingerprint ~ '^[a-f0-9]{64}$'),
  configured_reported_at timestamptz,
  last_check_at timestamptz,
  last_check_outcome text check (last_check_outcome is null
    or last_check_outcome in ('reachable','unreachable','unauthorized')),
  last_check_error_code text check (last_check_error_code is null or last_check_error_code ~ '^[a-z][a-z0-9_]{2,60}$'),
  verified_at timestamptz,
  updated_at timestamptz not null default pg_catalog.statement_timestamp()
);
alter table control_plane.integrations enable row level security;
create policy integrations_no_application_access on control_plane.integrations
  for all to anon,authenticated using (false) with check (false);
revoke all on control_plane.integrations from public,anon,authenticated;

insert into control_plane.integrations(provider,secret_references) values
  ('github',array['GITHUB_APP_ID','GITHUB_APP_PRIVATE_KEY','GITHUB_APP_INSTALLATION_ID','GITHUB_APP_WEBHOOK_SECRET']),
  ('vercel',array['VERCEL_API_TOKEN','VERCEL_TEAM_ID']),
  ('resend',array['RESEND_API_KEY','RESEND_WEBHOOK_SECRET']),
  ('stripe',array['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET']),
  ('supabase',array['SUPABASE_SERVICE_ROLE_KEY'])
on conflict do nothing;

create or replace function control_plane.list_integrations_v1()
returns table (provider text, secret_references text[], status text, configured_reported_at timestamptz,
  last_check_at timestamptz, last_check_outcome text, last_check_error_code text,
  verified_at timestamptz, pending_check_job_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  perform control_plane.require_operator_v1('viewer');
  return query
  select i.provider, i.secret_references,
    case when i.verified_at is not null and (i.last_check_outcome is null or i.last_check_outcome = 'reachable') then 'verified'
         when i.last_check_outcome = 'reachable' then 'reachable'
         when i.last_check_outcome in ('unreachable','unauthorized') then 'failing'
         when i.configured_fingerprint is not null then 'configured'
         else 'not_configured' end,
    i.configured_reported_at, i.last_check_at, i.last_check_outcome, i.last_check_error_code, i.verified_at,
    (select j.id from control_plane.jobs j where j.kind = 'check_integration'
       and j.status in ('queued','running') and j.parameters->>'provider' = i.provider limit 1)
  from control_plane.integrations i order by i.provider;
end;
$function$;

create or replace function control_plane.save_integration_references_v1(p_provider text, p_secret_references text[])
returns table (provider text)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
begin
  v_operator := control_plane.require_operator_v1('admin');
  if not control_plane.valid_secret_references_v1(p_secret_references) then
    raise exception using errcode='22023',message='reference_invalid';
  end if;
  update control_plane.integrations i set secret_references = coalesce(p_secret_references,'{}'),
    updated_at = pg_catalog.statement_timestamp()
  where i.provider = p_provider;
  if not found then
    raise exception using errcode='P0002',message='not_found';
  end if;
  perform control_plane.write_audit_v1(v_operator,'integration.references_saved',null,null,'integration',
    p_provider,null,pg_catalog.jsonb_build_object('provider',p_provider,'rows',pg_catalog.cardinality(p_secret_references)));
  return query select p_provider;
end;
$function$;

create or replace function control_plane.request_integration_check_v1(p_provider text)
returns table (job_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_existing uuid;
  v_attempt bigint;
begin
  v_operator := control_plane.require_operator_v1('operator');
  if not exists (select 1 from control_plane.integrations i where i.provider = p_provider) then
    raise exception using errcode='P0002',message='not_found';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('check_integration:' || p_provider,0));
  select j.id into v_existing from control_plane.jobs j where j.kind = 'check_integration'
    and j.status in ('queued','running') and j.parameters->>'provider' = p_provider limit 1;
  if v_existing is not null then
    return query select v_existing;
    return;
  end if;
  select pg_catalog.count(*) + 1 into v_attempt from control_plane.jobs j
  where j.kind = 'check_integration' and j.parameters->>'provider' = p_provider;
  return query select control_plane.enqueue_operator_job_v1(v_operator,'check_integration',null,null,
    pg_catalog.jsonb_build_object('provider',p_provider),
    'check_integration:' || p_provider || ':' || v_attempt::text);
end;
$function$;

create or replace function control_plane.record_integration_status_v1(
  p_provider text, p_fingerprint text, p_check_outcome text, p_error_code text, p_verified boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  if not control_plane.is_worker_v1() then
    raise exception using errcode='42501',message='policy_denied';
  end if;
  update control_plane.integrations i set
    configured_fingerprint = coalesce(p_fingerprint,i.configured_fingerprint),
    configured_reported_at = case when p_fingerprint is not null then v_now else i.configured_reported_at end,
    last_check_at = case when p_check_outcome is not null then v_now else i.last_check_at end,
    last_check_outcome = coalesce(p_check_outcome,i.last_check_outcome),
    last_check_error_code = case when p_check_outcome is not null then p_error_code else i.last_check_error_code end,
    verified_at = case when p_verified then v_now else i.verified_at end,
    updated_at = v_now
  where i.provider = p_provider;
  if not found then
    raise exception using errcode='P0002',message='not_found';
  end if;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Platform flags
-- ---------------------------------------------------------------------------
create or replace function control_plane.list_platform_flags_v1()
returns table (key text, enabled boolean, kind text, message_en text, message_ar text,
  starts_at timestamptz, ends_at timestamptz, updated_by_email text, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  perform control_plane.require_operator_v1('viewer');
  return query
  select f.key, f.enabled, f.kind, f.message_en, f.message_ar, f.starts_at, f.ends_at, o.email, f.updated_at
  from control_plane.platform_flags f
  left join control_plane.operators o on o.auth_user_id = f.updated_by
  order by f.kind, f.key;
end;
$function$;

create or replace function control_plane.save_platform_flag_v1(
  p_key text, p_kind text, p_enabled boolean, p_message_en text, p_message_ar text,
  p_starts_at timestamptz, p_ends_at timestamptz, p_reason text)
returns table (key text, enabled boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_operator uuid;
  v_before control_plane.platform_flags%rowtype;
  v_en text := nullif(pg_catalog.btrim(p_message_en),'');
  v_ar text := nullif(pg_catalog.btrim(p_message_ar),'');
begin
  v_operator := control_plane.require_operator_v1('admin',control_plane.step_up_seconds_v1());
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason,''))) < 5 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  if p_key is null or p_key !~ '^[a-z][a-z0-9_.]{1,60}$'
     or p_kind not in ('feature','incident_banner','maintenance_window','kill_switch')
     or (v_en is null) <> (v_ar is null)
     or (p_kind = 'incident_banner' and v_en is null)
     or pg_catalog.char_length(coalesce(v_en,'')) > 500 or pg_catalog.char_length(coalesce(v_ar,'')) > 500
     or (p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at) then
    raise exception using errcode='22023',message='flag_invalid';
  end if;
  select * into v_before from control_plane.platform_flags f where f.key = p_key for update;
  insert into control_plane.platform_flags(key,enabled,kind,message_en,message_ar,starts_at,ends_at,updated_by)
  values (p_key,coalesce(p_enabled,false),p_kind,v_en,v_ar,p_starts_at,p_ends_at,v_operator)
  on conflict (key) do update set enabled = excluded.enabled, kind = excluded.kind,
    message_en = excluded.message_en, message_ar = excluded.message_ar,
    starts_at = excluded.starts_at, ends_at = excluded.ends_at,
    updated_by = excluded.updated_by, updated_at = pg_catalog.statement_timestamp();
  perform control_plane.write_audit_v1(v_operator,'platform_flag.saved',null,null,'platform_flag',p_key,
    p_reason,pg_catalog.jsonb_build_object('flag_key',p_key,'kind',p_kind,
      'from',v_before.enabled,'enabled',coalesce(p_enabled,false)));
  return query select p_key, coalesce(p_enabled,false);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Overview
-- ---------------------------------------------------------------------------
create or replace function control_plane.get_overview_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  perform control_plane.require_operator_v1('viewer');
  return pg_catalog.jsonb_build_object(
    'generated_at',v_now,
    'tenant_total',(select pg_catalog.count(*) from app.tenants),
    'tenants',coalesce((select pg_catalog.jsonb_object_agg(x.status,x.n) from
      (select t.status, pg_catalog.count(*) n from app.tenants t group by t.status) x),'{}'::jsonb),
    'instance_total',(select pg_catalog.count(*) from app.instances),
    'instances',coalesce((select pg_catalog.jsonb_object_agg(x.deployment_state,x.n) from
      (select i.deployment_state, pg_catalog.count(*) n from app.instances i group by i.deployment_state) x),'{}'::jsonb),
    'subscriptions',coalesce((select pg_catalog.jsonb_object_agg(x.state,x.n) from
      (select coalesce(s.state,'none') state, pg_catalog.count(*) n from app.tenants t
       left join control_plane.subscriptions s on s.tenant_id = t.id group by coalesce(s.state,'none')) x),'{}'::jsonb),
    'provisioning',pg_catalog.jsonb_build_object(
      'in_progress',(select pg_catalog.count(*) from control_plane.provisioning_runs r
                     where r.state not in ('active','failed','deactivated') and r.waiting_reason is null),
      'waiting',(select pg_catalog.count(*) from control_plane.provisioning_runs r where r.waiting_reason is not null),
      'failed',(select pg_catalog.count(*) from control_plane.provisioning_runs r where r.state = 'failed'),
      'active',(select pg_catalog.count(*) from control_plane.provisioning_runs r where r.state = 'active')),
    'jobs',coalesce((select pg_catalog.jsonb_object_agg(x.status,x.n) from
      (select j.status, pg_catalog.count(*) n from control_plane.jobs j group by j.status) x),'{}'::jsonb),
    'health',(select pg_catalog.jsonb_build_object(
        'failing',pg_catalog.count(*) filter (where h.status = 'failing'),
        'degraded',pg_catalog.count(*) filter (where h.status = 'degraded'),
        'healthy',pg_catalog.count(*) filter (where h.status = 'healthy' and h.observed_at >= v_now - interval '30 minutes'),
        'stale',pg_catalog.count(*) filter (where h.status is not null and h.observed_at < v_now - interval '30 minutes'),
        'unobserved',pg_catalog.count(*) filter (where h.status is null),
        'stale_after_minutes',30)
      from app.instances i
      left join lateral control_plane.instance_health_v1(i.id) h on true
      where i.deployment_state in ('provisioning','active')),
    'pending',pg_catalog.jsonb_build_object(
      'job_approvals',(select pg_catalog.count(*) from control_plane.jobs j
        where j.kind in ('close_instance','rotate_secret') and j.approved_by is null and j.status = 'queued'),
      'support_requests',(select pg_catalog.count(*) from control_plane.support_grants g where g.status = 'pending'),
      'support_active',(select pg_catalog.count(*) from control_plane.support_grants g
        where g.status = 'active' and g.expires_at > v_now),
      'rollouts_paused',(select pg_catalog.count(*) from control_plane.rollouts o where o.status = 'paused'),
      'rollouts_running',(select pg_catalog.count(*) from control_plane.rollouts o where o.status = 'running'),
      'domains_pending',(select pg_catalog.count(*) from app.tenant_domains d where d.verification_status = 'pending'),
      'break_glass_active',(select pg_catalog.count(*) from control_plane.operators o
        where o.role = 'break_glass' and o.disabled_at is null and o.expires_at > v_now)),
    'recent_activity',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) - 'total_count')
      from control_plane.audit_rows_v1(null,null,null,null,null,null,null,8,0) a),'[]'::jsonb));
end;
$function$;

-- ---------------------------------------------------------------------------
-- 7. api_v1 pass-throughs and grants
-- ---------------------------------------------------------------------------
create or replace function api_v1.list_operators_v1()
returns table (operator_id uuid, email text, role text, expires_at timestamptz,
  disabled_at timestamptz, mfa_verified boolean, last_sign_in_at timestamptz,
  created_at timestamptz, updated_at timestamptz, usable_admin boolean)
language sql security definer set search_path to ''
as $$ select * from control_plane.list_operators_v1(); $$;

create or replace function api_v1.add_operator_v1(p_email text, p_role text, p_expires_at timestamptz, p_reason text)
returns table (operator_id uuid)
language sql security definer set search_path to ''
as $$ select * from control_plane.add_operator_v1(p_email,p_role,p_expires_at,p_reason); $$;

create or replace function api_v1.set_operator_role_v1(p_operator_id uuid, p_role text, p_expires_at timestamptz, p_reason text)
returns table (operator_id uuid, role text)
language sql security definer set search_path to ''
as $$ select * from control_plane.set_operator_role_v1(p_operator_id,p_role,p_expires_at,p_reason); $$;

create or replace function api_v1.disable_operator_v1(p_operator_id uuid, p_reason text)
returns table (operator_id uuid, disabled_at timestamptz, grants_revoked integer)
language sql security definer set search_path to ''
as $$ select * from control_plane.disable_operator_v1(p_operator_id,p_reason); $$;

create or replace function api_v1.enable_operator_v1(p_operator_id uuid, p_reason text)
returns table (operator_id uuid)
language sql security definer set search_path to ''
as $$ select * from control_plane.enable_operator_v1(p_operator_id,p_reason); $$;

create or replace function api_v1.list_support_grants_v2(p_status text default null, p_tenant_id uuid default null,
  p_limit integer default 25, p_offset integer default 0)
returns table (grant_id uuid, tenant_id uuid, tenant_name text, requested_by_email text,
  approved_by_email text, revoked_by_email text, ticket_reference text, reason text, scope text,
  location_id uuid, status text, requested_at timestamptz, approved_at timestamptz,
  expires_at timestamptz, revoked_at timestamptz, total_count bigint)
language sql security definer set search_path to ''
as $$ select * from control_plane.list_support_grants_v2(p_status,p_tenant_id,p_limit,p_offset); $$;

create or replace function api_v1.request_support_grant_v1(p_tenant_id uuid, p_reason text,
  p_ticket_reference text, p_location_id uuid default null, p_minutes integer default 60)
returns table (grant_id uuid, status text)
language sql security definer set search_path to ''
as $$ select * from control_plane.request_support_grant_v1(p_tenant_id,p_reason,p_ticket_reference,p_location_id,p_minutes); $$;

create or replace function api_v1.approve_support_access_v1(p_grant_id uuid, p_minutes integer)
returns table (grant_id uuid, status text, expires_at timestamptz)
language sql security definer set search_path to ''
as $$ select * from control_plane.approve_support_access_v1(p_grant_id,p_minutes); $$;

create or replace function api_v1.revoke_support_grant_v1(p_grant_id uuid, p_reason text default null)
returns table (grant_id uuid, status text)
language sql security definer set search_path to ''
as $$ select * from control_plane.revoke_support_grant_v1(p_grant_id,p_reason); $$;

create or replace function api_v1.list_health_v1(p_status text default null, p_subject_kind text default null,
  p_limit integer default 50, p_offset integer default 0)
returns table (subject_kind text, tenant_id uuid, tenant_name text, instance_id uuid,
  subject_key text, signal text, status text, freshness text, error_code text,
  observed_at timestamptz, total_count bigint)
language sql security definer set search_path to ''
as $$ select * from control_plane.list_health_v1(p_status,p_subject_kind,p_limit,p_offset); $$;

create or replace function api_v1.list_alerts_v1()
returns table (severity text, kind text, tenant_id uuid, tenant_name text, subject_id text,
  code text, observed_at timestamptz)
language sql security definer set search_path to ''
as $$ select * from control_plane.list_alerts_v1(); $$;

create or replace function api_v1.list_integrations_v1()
returns table (provider text, secret_references text[], status text, configured_reported_at timestamptz,
  last_check_at timestamptz, last_check_outcome text, last_check_error_code text,
  verified_at timestamptz, pending_check_job_id uuid)
language sql security definer set search_path to ''
as $$ select * from control_plane.list_integrations_v1(); $$;

create or replace function api_v1.save_integration_references_v1(p_provider text, p_secret_references text[])
returns table (provider text)
language sql security definer set search_path to ''
as $$ select * from control_plane.save_integration_references_v1(p_provider,p_secret_references); $$;

create or replace function api_v1.request_integration_check_v1(p_provider text)
returns table (job_id uuid)
language sql security definer set search_path to ''
as $$ select * from control_plane.request_integration_check_v1(p_provider); $$;

create or replace function api_v1.record_integration_status_v1(p_provider text, p_fingerprint text,
  p_check_outcome text, p_error_code text, p_verified boolean)
returns void
language sql security definer set search_path to ''
as $$ select control_plane.record_integration_status_v1(p_provider,p_fingerprint,p_check_outcome,p_error_code,p_verified); $$;

create or replace function api_v1.list_platform_flags_v1()
returns table (key text, enabled boolean, kind text, message_en text, message_ar text,
  starts_at timestamptz, ends_at timestamptz, updated_by_email text, updated_at timestamptz)
language sql security definer set search_path to ''
as $$ select * from control_plane.list_platform_flags_v1(); $$;

create or replace function api_v1.save_platform_flag_v1(p_key text, p_kind text, p_enabled boolean,
  p_message_en text, p_message_ar text, p_starts_at timestamptz, p_ends_at timestamptz, p_reason text)
returns table (key text, enabled boolean)
language sql security definer set search_path to ''
as $$ select * from control_plane.save_platform_flag_v1(p_key,p_kind,p_enabled,p_message_en,p_message_ar,p_starts_at,p_ends_at,p_reason); $$;

create or replace function api_v1.get_overview_v1() returns jsonb
language sql security definer set search_path to ''
as $$ select control_plane.get_overview_v1(); $$;

revoke all on all functions in schema control_plane from public,anon,authenticated;
grant execute on function control_plane.contains_no_secret_v1(jsonb) to service_role;

revoke all on function
  api_v1.list_operators_v1(), api_v1.add_operator_v1(text,text,timestamptz,text),
  api_v1.set_operator_role_v1(uuid,text,timestamptz,text), api_v1.disable_operator_v1(uuid,text),
  api_v1.enable_operator_v1(uuid,text), api_v1.list_support_grants_v2(text,uuid,integer,integer),
  api_v1.request_support_grant_v1(uuid,text,text,uuid,integer), api_v1.approve_support_access_v1(uuid,integer),
  api_v1.revoke_support_grant_v1(uuid,text), api_v1.list_health_v1(text,text,integer,integer),
  api_v1.list_alerts_v1(), api_v1.list_integrations_v1(), api_v1.save_integration_references_v1(text,text[]),
  api_v1.request_integration_check_v1(text), api_v1.record_integration_status_v1(text,text,text,text,boolean),
  api_v1.list_platform_flags_v1(),
  api_v1.save_platform_flag_v1(text,text,boolean,text,text,timestamptz,timestamptz,text),
  api_v1.get_overview_v1()
from public, anon, authenticated;
grant execute on function
  api_v1.list_operators_v1(), api_v1.add_operator_v1(text,text,timestamptz,text),
  api_v1.set_operator_role_v1(uuid,text,timestamptz,text), api_v1.disable_operator_v1(uuid,text),
  api_v1.enable_operator_v1(uuid,text), api_v1.list_support_grants_v2(text,uuid,integer,integer),
  api_v1.request_support_grant_v1(uuid,text,text,uuid,integer), api_v1.approve_support_access_v1(uuid,integer),
  api_v1.revoke_support_grant_v1(uuid,text), api_v1.list_health_v1(text,text,integer,integer),
  api_v1.list_alerts_v1(), api_v1.list_integrations_v1(), api_v1.save_integration_references_v1(text,text[]),
  api_v1.request_integration_check_v1(text), api_v1.list_platform_flags_v1(),
  api_v1.save_platform_flag_v1(text,text,boolean,text,text,timestamptz,timestamptz,text),
  api_v1.get_overview_v1()
to authenticated;
grant execute on function api_v1.record_integration_status_v1(text,text,text,text,boolean) to service_role;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `rtk node scripts/platform-admin-local.mjs replay && rtk node scripts/platform-admin-local.mjs test 2>&1 | tail -40`
Expected: `platform_admin_security_health_test.sql .. ok`; `support_access_test.sql` still ok.

- [ ] **Step 5: Commit**

```bash
rtk git add supabase/migrations/20261006170000_platform_admin_security_health.sql supabase/tests/database/platform_admin_security_health_test.sql
rtk git commit -m "Add operator management, health, integrations, flags and the overview"
```

---

### Task 8: Database gates and generated types

**Files:**
- Modify: `packages/supabase-client/src/database.types.ts` (regenerated)

- [ ] **Step 1: Full replay, lint, tests**

Run:
```bash
export WLBP_SUPABASE_WORKDIR="$PWD/.artifacts/platform-admin/isolated"
rtk node scripts/platform-admin-local.mjs replay
rtk pnpm db:lint
rtk node scripts/platform-admin-local.mjs test
```
Expected: replay clean; `db:lint` reports no errors; all 39 test files pass (33 existing + 6 new), with only Task 1 baseline failures (if any) remaining and explained.

- [ ] **Step 2: Regenerate and check types**

Run:
```bash
rtk pnpm db:types
rtk pnpm check:db-types
rtk git diff --stat packages/supabase-client/src/database.types.ts
```
Expected: types now include every `api_v1` function in the master plan's table; `check:db-types` passes.

- [ ] **Step 3: Confirm the boundary from outside**

Run (uses the isolated anon key from `supabase status`, never printed):
```bash
rtk node -e '
const {execFileSync}=require("node:child_process");
const env=Object.fromEntries(execFileSync("pnpm",["exec","supabase","status","--output","env","--workdir",process.env.WLBP_SUPABASE_WORKDIR],{encoding:"utf8"}).trim().split("\n").map(l=>l.split("=").map(s=>s.replace(/^"|"$/g,""))));
fetch(env.API_URL+"/rest/v1/rpc/list_tenants_v1",{method:"POST",headers:{apikey:env.ANON_KEY,"content-profile":"api_v1","content-type":"application/json"},body:"{}"}).then(async r=>console.log(r.status,(await r.text()).slice(0,120)));
'
```
Expected: `401` or `403` with a `permission denied` body — anon cannot call an operator RPC over PostgREST.

- [ ] **Step 4: Commit**

```bash
rtk git add packages/supabase-client/src/database.types.ts
rtk git commit -m "Regenerate api_v1 types for the Platform Admin contract"
```
(`database.types.ts` carries uncommitted dashboard edits; regeneration includes them because they come from the same migrations. Confirm with `git diff` that every hunk is generated, then commit the whole file.)
