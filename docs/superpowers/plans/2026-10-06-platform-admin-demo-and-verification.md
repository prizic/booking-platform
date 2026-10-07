# Platform Admin Completion — Part C: Demo Data, Verification, Delivery

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Global Constraints: [`2026-10-06-platform-admin-completion.md`](2026-10-06-platform-admin-completion.md). Depends on Parts A and B (Tasks 1–21).

**Goal:** A repeatable, clearly synthetic demo on the isolated stack; browser tests for the critical journeys; every gate run and honestly reported; Platform Admin left running with login instructions and a checkpoint.

---

### Task 22: Demo operators with TOTP, and the `seed` command

**Files:**
- Create: `scripts/totp.mjs`, `scripts/totp.test.mjs`
- Modify: `scripts/platform-admin-local.mjs` (add `seed`), `scripts/platform-admin-local.test.mjs`
- Modify: `package.json` (`test:config` list only)

**Interfaces:**
- Produces:
  ```js
  // scripts/totp.mjs
  export function totp(base32Secret: string, unixSeconds?: number): string; // RFC 6238, SHA-1, 30 s, 6 digits
  // scripts/platform-admin-local.mjs
  export function isolatedEnvironment(): { apiUrl: string; dbUrl: string; anonKey: string; publishableKey: string; serviceRoleKey: string }; // refuses non-565xx
  export const demoOperators: readonly { key: "admin" | "admin2" | "operator" | "viewer"; email: string; role: string }[];
  // node scripts/platform-admin-local.mjs seed
  //   → creates/updates 4 auth users with confirmed email + password, enrolls one verified TOTP factor each,
  //     applies supabase/demo/platform-admin-demo.sql (Task 23), writes .artifacts/platform-admin/credentials.json (0600)
  ```
- Credentials file shape (never committed; `.artifacts/` is git-ignored):
  ```json
  { "project": "platform-admin-20261006", "url": "http://localhost:3002",
    "operators": { "admin": { "email": "...", "password": "...", "totpSecret": "...", "factorId": "..." }, "...": {} } }
  ```

- [ ] **Step 1: Write the failing TOTP test**

`scripts/totp.test.mjs` (RFC 6238 Appendix B vector, SHA-1, secret `12345678901234567890` = base32 `GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ`):
```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { totp } from "./totp.mjs";

const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

test("matches the RFC 6238 SHA-1 vectors (last six digits)", () => {
  assert.equal(totp(secret, 59), "287082");
  assert.equal(totp(secret, 1111111109), "081804");
  assert.equal(totp(secret, 2000000000), "279037");
});

test("tolerates lowercase, spaces and padding", () => {
  assert.equal(totp("gezd gnbv gy3t qojq gezd gnbv gy3t qojq==", 59), "287082");
});
```

Run: `rtk node --test scripts/totp.test.mjs`
Expected: FAIL — cannot find `./totp.mjs`.

- [ ] **Step 2: Implement TOTP**

`scripts/totp.mjs`:
```js
import { createHmac } from "node:crypto";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function decodeBase32(input) {
  const clean = input.toUpperCase().replace(/[\s=]/gu, "");
  let bits = "";
  for (const character of clean) {
    const value = alphabet.indexOf(character);
    if (value < 0) throw new Error("invalid base32 secret");
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

/** RFC 6238 TOTP (SHA-1, 30-second step, 6 digits), as authenticator apps compute it. */
export function totp(base32Secret, unixSeconds = Math.floor(Date.now() / 1000)) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(unixSeconds / 30)));
  const digest = createHmac("sha1", decodeBase32(base32Secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, "0");
}
```

Run: `rtk node --test scripts/totp.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 3: Add the failing environment-guard test**

Append to `scripts/platform-admin-local.test.mjs`:
```js
import { parseIsolatedStatus } from "./platform-admin-local.mjs";

test("reads the isolated stack's status and refuses any other port", () => {
  const ok = 'API_URL="http://127.0.0.1:56521"\nDB_URL="postgresql://postgres:postgres@127.0.0.1:56522/postgres"\nANON_KEY="a"\nPUBLISHABLE_KEY="p"\nSERVICE_ROLE_KEY="s"\n';
  assert.deepEqual(parseIsolatedStatus(ok), {
    apiUrl: "http://127.0.0.1:56521", dbUrl: "postgresql://postgres:postgres@127.0.0.1:56522/postgres",
    anonKey: "a", publishableKey: "p", serviceRoleKey: "s",
  });
  assert.throws(() => parseIsolatedStatus(ok.replace("56521", "54321")), /not the isolated/u);
});
```

Run: `rtk node --test scripts/platform-admin-local.test.mjs`
Expected: FAIL — `parseIsolatedStatus` is not exported.

- [ ] **Step 4: Implement the guard, operators and `seed`**

Add to `scripts/platform-admin-local.mjs` (above `const commands`):
```js
import { execFileSync } from "node:child_process";
import { chmod, readFile as readText, writeFile as writeText } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { totp } from "./totp.mjs";

const credentialsPath = path.join(output, "credentials.json");

export function parseIsolatedStatus(text) {
  const env = Object.fromEntries(
    text.trim().split("\n").map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1).replace(/^"|"$/gu, "")];
    }),
  );
  const result = {
    apiUrl: env.API_URL, dbUrl: env.DB_URL, anonKey: env.ANON_KEY,
    publishableKey: env.PUBLISHABLE_KEY, serviceRoleKey: env.SERVICE_ROLE_KEY,
  };
  // Every write below uses the service key; it must only ever be this stack's.
  if (new URL(result.apiUrl).port !== "56521" || new URL(result.dbUrl).port !== "56522") {
    throw new Error("refusing: status is not the isolated platform-admin stack");
  }
  return result;
}

export function isolatedEnvironment() {
  return parseIsolatedStatus(execFileSync("pnpm", ["exec", "supabase", "status", "--output", "env", "--workdir", workdir], {
    cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }));
}

export const demoOperators = [
  { key: "admin", email: "demo-admin@platform-admin.example.invalid", role: "admin" },
  { key: "admin2", email: "demo-admin-2@platform-admin.example.invalid", role: "admin" },
  { key: "operator", email: "demo-operator@platform-admin.example.invalid", role: "operator" },
  { key: "viewer", email: "demo-viewer@platform-admin.example.invalid", role: "viewer" },
];

async function auth(env, route, { method = "GET", token, body } = {}) {
  const response = await fetch(`${env.apiUrl}/auth/v1${route}`, {
    method,
    headers: {
      apikey: token === env.serviceRoleKey ? env.serviceRoleKey : env.anonKey,
      authorization: `Bearer ${token ?? env.anonKey}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${route} → ${response.status}`); // body omitted: it may echo input
  return text ? JSON.parse(text) : null;
}

async function ensureOperatorAccount(env, operator, previous) {
  const password = previous?.password ?? randomBytes(18).toString("base64url");
  const users = await auth(env, `/admin/users?per_page=1000`, { token: env.serviceRoleKey });
  let user = users.users.find((candidate) => candidate.email === operator.email);
  if (!user) {
    user = await auth(env, "/admin/users", {
      method: "POST", token: env.serviceRoleKey,
      body: { email: operator.email, password, email_confirm: true, user_metadata: { synthetic: true } },
    });
  } else {
    await auth(env, `/admin/users/${user.id}`, { method: "PUT", token: env.serviceRoleKey, body: { password } });
  }

  // Reuse a verified factor we hold the secret for; otherwise remove every
  // factor and enroll exactly one, so the credentials file is always usable.
  const factors = (await auth(env, `/admin/users/${user.id}/factors`, { token: env.serviceRoleKey })) ?? [];
  const known = factors.find((factor) => factor.id === previous?.factorId && factor.status === "verified");
  if (known && previous?.totpSecret) {
    return { email: operator.email, password, totpSecret: previous.totpSecret, factorId: known.id, userId: user.id };
  }
  for (const factor of factors) {
    await auth(env, `/admin/users/${user.id}/factors/${factor.id}`, { method: "DELETE", token: env.serviceRoleKey });
  }
  const session = await auth(env, "/token?grant_type=password", { method: "POST", body: { email: operator.email, password } });
  const enrolled = await auth(env, "/factors", {
    method: "POST", token: session.access_token,
    body: { factor_type: "totp", friendly_name: "Demo authenticator", issuer: "Atlas Platform Admin (demo)" },
  });
  const challenge = await auth(env, `/factors/${enrolled.id}/challenge`, { method: "POST", token: session.access_token, body: {} });
  await auth(env, `/factors/${enrolled.id}/verify`, {
    method: "POST", token: session.access_token,
    body: { challenge_id: challenge.id, code: totp(enrolled.totp.secret) },
  });
  return { email: operator.email, password, totpSecret: enrolled.totp.secret, factorId: enrolled.id, userId: user.id };
}

async function seed() {
  await assertIsolated();
  const env = isolatedEnvironment();
  let previous = {};
  try {
    previous = JSON.parse(await readText(credentialsPath, "utf8")).operators ?? {};
  } catch {
    /* first seed */
  }
  const operators = {};
  for (const operator of demoOperators) {
    operators[operator.key] = await ensureOperatorAccount(env, operator, previous[operator.key]);
  }
  execFileSync("psql", [env.dbUrl, "-v", "ON_ERROR_STOP=1", "-q", "-f", path.join(root, "supabase/demo/platform-admin-demo.sql")], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  await writeText(credentialsPath, JSON.stringify({
    project: projectId, url: "http://localhost:3002",
    note: "Synthetic local demo accounts. Never reuse outside the isolated stack.",
    operators,
  }, null, 2) + "\n", { mode: 0o600 });
  await chmod(credentialsPath, 0o600);
  process.stdout.write(`Seeded ${demoOperators.length} demo operators and demo data into ${projectId}.\n`);
  process.stdout.write(`Credentials: ${path.relative(root, credentialsPath)} (owner-readable only).\n`);
}
```
Register it in `commands`: `seed,` (next to `sync`). Merge the new `node:child_process`/`node:fs/promises` imports into the existing import lines at the top of the file instead of adding duplicate import statements.

The GoTrue admin route for factors is `/admin/users/{id}/factors`; confirm against the running stack (`curl -s "$API_URL/auth/v1/admin/users/<id>/factors" -H "apikey: $SERVICE_ROLE_KEY" -H "authorization: Bearer $SERVICE_ROLE_KEY"` returns a JSON array) before relying on it. If this GoTrue version lacks it, read factors from `GET /admin/users/{id}` (`factors` array) instead — that is the only allowed substitution.

- [ ] **Step 5: Run the tests**

Run: `rtk node --test scripts/totp.test.mjs scripts/platform-admin-local.test.mjs`
Expected: PASS (6 tests). Add `scripts/totp.test.mjs` to the `test:config` list in `package.json`.

- [ ] **Step 6: Commit**

```bash
rtk git add scripts/totp.mjs scripts/totp.test.mjs scripts/platform-admin-local.mjs scripts/platform-admin-local.test.mjs
rtk git commit -m "Seed synthetic Platform Admin operators with real TOTP on the isolated stack"
```
(Stage only the `test:config` hunk of `package.json` with `git add -p` if committing it.)

### Task 23: Synthetic demo data

**Files:**
- Create: `supabase/demo/platform-admin-demo.sql`
- Create: `supabase/demo/README.md`

The file lives outside `supabase/migrations` and is never part of `seed.sql`, so no reset or deploy applies it. Only `platform-admin-local.mjs seed` runs it, and only against the isolated stack.

**What it demonstrates**

| Tenant (all named "Synthetic demo · …") | State shown |
| --- | --- |
| North Clinic | Active, canary ring, active run, fresh healthy observation, verified domain with reported certificate, one drifted Vercel resource, override feature, active support access, completed 0.1.0 rollout and a **paused 0.2.0 rollout with a failed target** |
| East Studio | Trialing, provisioning **failed** at `seed_repository` (attempts exhausted, `github_rate_limited`), failed job, pending support request |
| West Salon | **Suspended**, past due, **stale** observation (3 h), **close job awaiting second-admin approval**, revoked support history |
| Central Gym | Active subscription, run **waiting on customer DNS**, pending domain with a queued verification job, **no observation (unknown)** |
| South Spa | No subscription, instance provisioning, nothing else (empty states) |

Plus: releases 0.1.0 (stable) and 0.2.0 (candidate), GitHub integration "reachable" and Vercel "not configured", a disabled bilingual maintenance banner, and an audit history including a denied attempt.

- [ ] **Step 1: Write the demo SQL**

`supabase/demo/platform-admin-demo.sql`:
```sql
-- Synthetic Platform Admin demo data. Local isolated stack only.
-- Every name says "Synthetic demo"; every email ends in .example.invalid.
-- Repeatable: fixed IDs with ON CONFLICT, and time-relative values refreshed
-- on each run so "fresh", "stale" and "expires" stay meaningful.
\set ON_ERROR_STOP on
begin;

do $guard$
begin
  if not exists (select 1 from auth.users where email = 'demo-admin@platform-admin.example.invalid') then
    raise exception 'run through scripts/platform-admin-local.mjs seed (demo operators missing)';
  end if;
end
$guard$;

create temp table demo_ids as
select
  (select id from auth.users where email = 'demo-admin@platform-admin.example.invalid') as admin_id,
  (select id from auth.users where email = 'demo-admin-2@platform-admin.example.invalid') as admin2_id,
  (select id from auth.users where email = 'demo-operator@platform-admin.example.invalid') as operator_id,
  (select id from auth.users where email = 'demo-viewer@platform-admin.example.invalid') as viewer_id;

-- Operators ---------------------------------------------------------------
insert into control_plane.operators(auth_user_id,email,role)
select admin_id,'demo-admin@platform-admin.example.invalid','admin' from demo_ids
union all select admin2_id,'demo-admin-2@platform-admin.example.invalid','admin' from demo_ids
union all select operator_id,'demo-operator@platform-admin.example.invalid','operator' from demo_ids
union all select viewer_id,'demo-viewer@platform-admin.example.invalid','viewer' from demo_ids
on conflict (auth_user_id) do update set role = excluded.role, disabled_at = null, expires_at = null;

-- Tenants, brands, published revisions, instances ---------------------------
insert into app.tenants(id,name,status) values
  ('d1000000-0000-4000-8000-000000000001','Synthetic demo · North Clinic','active'),
  ('d1000000-0000-4000-8000-000000000002','Synthetic demo · East Studio','active'),
  ('d1000000-0000-4000-8000-000000000003','Synthetic demo · West Salon','suspended'),
  ('d1000000-0000-4000-8000-000000000004','Synthetic demo · Central Gym','active'),
  ('d1000000-0000-4000-8000-000000000005','Synthetic demo · South Spa','active')
on conflict (id) do nothing;

insert into app.brands(id,tenant_id,key,status)
select ('d2000000-0000-4000-8000-00000000000' || n)::uuid, ('d1000000-0000-4000-8000-00000000000' || n)::uuid,
  'demo-' || k, 'active'
from (values (1,'north'),(2,'east'),(3,'west'),(4,'central'),(5,'south')) v(n,k)
on conflict do nothing;

-- Published revisions copied verbatim from Synthetic Tenant A, so config,
-- content and content_hash stay mutually consistent without restating them.
insert into app.brand_revisions(id,tenant_id,brand_id,revision,state,config_version,created_at,published_at,config,content,content_hash)
select ('d4000000-0000-4000-8000-00000000000' || n)::uuid, ('d1000000-0000-4000-8000-00000000000' || n)::uuid,
  ('d2000000-0000-4000-8000-00000000000' || n)::uuid, 1, 'published', r.config_version, now(), now(),
  r.config, r.content, r.content_hash
from app.brand_revisions r cross join (values (1),(3)) v(n)
where r.id = 'a4100000-0000-0000-0000-000000000001'
on conflict do nothing;

insert into app.instances(id,tenant_id,brand_id,published_brand_revision_id,deployment_state)
values
  ('d3000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','active'),
  ('d3000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000002',null,'provisioning'),
  ('d3000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000003','d2000000-0000-4000-8000-000000000003','d4000000-0000-4000-8000-000000000003','suspended'),
  ('d3000000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000004','d2000000-0000-4000-8000-000000000004',null,'provisioning'),
  ('d3000000-0000-4000-8000-000000000005','d1000000-0000-4000-8000-000000000005','d2000000-0000-4000-8000-000000000005',null,'provisioning')
on conflict do nothing;

insert into app.tenant_domains(id,tenant_id,instance_id,hostname,application,kind,verification_status,verified_at,active)
values
  ('da000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','book.demo-north.example.invalid','client','production','verified',now() - interval '20 days',true),
  ('da000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000004','d3000000-0000-4000-8000-000000000004','book.demo-central.example.invalid','client','production','pending',null,false)
on conflict do nothing;

-- Subscriptions and entitlements ------------------------------------------
insert into control_plane.subscriptions(tenant_id,plan_key,state,rollout_ring,started_at,ends_at) values
  ('d1000000-0000-4000-8000-000000000001','launch','active','canary',now() - interval '60 days',null),
  ('d1000000-0000-4000-8000-000000000002','launch','trialing','early',now() - interval '3 days',now() + interval '11 days'),
  ('d1000000-0000-4000-8000-000000000003','launch','past_due','general',now() - interval '120 days',null),
  ('d1000000-0000-4000-8000-000000000004','launch','active','general',now() - interval '10 days',null)
on conflict (tenant_id) do update set state = excluded.state, rollout_ring = excluded.rollout_ring,
  ends_at = excluded.ends_at, updated_at = now();
select control_plane.project_plan_entitlements_v1(t, 'launch') from (values
  ('d1000000-0000-4000-8000-000000000001'::uuid),('d1000000-0000-4000-8000-000000000002'),
  ('d1000000-0000-4000-8000-000000000003'),('d1000000-0000-4000-8000-000000000004')) v(t);
insert into app.tenant_entitlements(tenant_id,feature_key,granted,source,expires_at)
values ('d1000000-0000-4000-8000-000000000001','reports.advanced',true,'override',now() + interval '30 days')
on conflict (tenant_id,feature_key) do update set granted = true, source = 'override', expires_at = excluded.expires_at;

-- Releases and instance release state ---------------------------------------
insert into control_plane.releases(id,version,channel,git_commit,config_schema_version,backend_contract_min,
  backend_contract_max,migration_ids,feature_notes,upgrade_notes,reversible,registered_by,created_at)
select 'd6000000-0000-4000-8000-000000000001','0.1.0','stable',repeat('1',40),3,1,1,'{}',
  array['Synthetic demo baseline release'],array['None'],true,admin_id,now() - interval '40 days' from demo_ids
union all
select 'd6000000-0000-4000-8000-000000000002','0.2.0','candidate',repeat('2',40),3,1,1,
  array['20261006120000_platform_admin_foundation'],array['Synthetic demo candidate'],array['No action required'],true,admin_id,now() - interval '2 days' from demo_ids
on conflict do nothing;

insert into control_plane.instance_release_state(tenant_id,instance_id,desired_release,current_release,
  config_schema_version,environment_fingerprint,reported_at) values
  ('d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','0.1.0','0.1.0',3,repeat('a',64),now() - interval '10 minutes'),
  ('d1000000-0000-4000-8000-000000000003','d3000000-0000-4000-8000-000000000003','0.1.0','0.1.0',3,repeat('b',64),now() - interval '3 hours'),
  ('d1000000-0000-4000-8000-000000000002','d3000000-0000-4000-8000-000000000002','0.1.0',null,3,null,null),
  ('d1000000-0000-4000-8000-000000000004','d3000000-0000-4000-8000-000000000004','0.1.0',null,3,null,null)
on conflict (tenant_id,instance_id) do update set desired_release = excluded.desired_release,
  current_release = excluded.current_release, reported_at = excluded.reported_at;

-- Infrastructure: one in sync, one drifted, one domain with a reported certificate.
insert into control_plane.instance_infrastructure(tenant_id,instance_id,provider,resource_kind,external_id,
  desired_state,observed_state,observed_at,attempts,last_success_at) values
  ('d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','github','app_installation','demo-install-north','{}','{}',now() - interval '1 day',1,now() - interval '1 day'),
  ('d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','github','repository','R_demo_north','{"active":true,"default_branch":"main"}','{"active":true,"default_branch":"main"}',now() - interval '10 minutes',1,now() - interval '10 minutes'),
  ('d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','vercel','project','prj_demonorthclient','{"active":true,"framework":"nextjs"}','{"active":true,"framework":"other"}',now() - interval '10 minutes',2,now() - interval '10 minutes'),
  ('d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','vercel','domain','dom_demo_north','{"active":true}','{"active":true,"hostname":"book.demo-north.example.invalid","certificate_status":"issued"}',now() - interval '10 minutes',1,now() - interval '10 minutes'),
  ('d1000000-0000-4000-8000-000000000002','d3000000-0000-4000-8000-000000000002','github','app_installation','demo-install-east','{}','{}',now() - interval '3 days',1,now() - interval '3 days'),
  ('d1000000-0000-4000-8000-000000000004','d3000000-0000-4000-8000-000000000004','github','app_installation','demo-install-central','{}','{}',now() - interval '10 days',1,now() - interval '10 days')
on conflict (provider,resource_kind,external_id) do update set observed_at = excluded.observed_at,
  last_success_at = excluded.last_success_at;

-- Provisioning runs and steps ------------------------------------------------
insert into control_plane.provisioning_runs(id,tenant_id,instance_id,slug,plan_key,state,waiting_reason,idempotency_key,
  request,desired_release,config_schema_version,backend_contract_min,backend_contract_max,last_error_code,requested_by,activated_at,created_at,updated_at)
select v.id::uuid, v.t::uuid, v.i::uuid, v.slug, 'launch', v.state, v.waiting, 'demo-run-' || v.slug,
  '{"default_locale":"en","timezone":"Asia/Riyadh","currency":"SAR"}', '0.1.0', 3, 1, 1, v.err, d.operator_id,
  case when v.state = 'active' then now() - interval '40 days' end, now() - v.age, now() - v.age + interval '1 hour'
from demo_ids d, (values
  ('d5000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','demo-north','active',null,null,interval '41 days'),
  ('d5000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000002','d3000000-0000-4000-8000-000000000002','demo-east','failed',null,'github_rate_limited',interval '3 days'),
  ('d5000000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000004','d3000000-0000-4000-8000-000000000004','demo-central','domain_pending','customer_dns',null,interval '2 days')
) v(id,t,i,slug,state,waiting,err,age)
on conflict do nothing;

-- Steps: north all succeeded; east failed at step 3; central waiting at step 10.
insert into control_plane.provisioning_steps(run_id,step_order,step_key,provider,resource_kind,required,resulting_state,
  waiting_state,status,attempts,max_attempts,idempotency_key,waiting_reason,last_error_code,retry_after,started_at,last_success_at)
select r.id, c.step_order, c.step_key, c.provider, c.resource_kind, c.required, c.resulting_state, c.waiting_state,
  case
    when r.slug = 'demo-north' then 'succeeded'
    when r.slug = 'demo-east' and c.step_order < 3 then 'succeeded'
    when r.slug = 'demo-east' and c.step_order = 3 then 'failed'
    when r.slug = 'demo-central' and c.step_order < 10 then 'succeeded'
    when r.slug = 'demo-central' and c.step_order = 10 then 'waiting'
    else 'pending' end,
  case when r.slug = 'demo-east' and c.step_order = 3 then 5 when c.step_order = 10 and r.slug = 'demo-central' then 0
       when (r.slug = 'demo-north') or (r.slug = 'demo-east' and c.step_order < 3) or (r.slug = 'demo-central' and c.step_order < 10) then 1
       else 0 end,
  case when c.step_order = 3 then 5 else c.max_attempts end,
  r.id::text || ':' || c.step_key,
  case when r.slug = 'demo-central' and c.step_order = 10 then 'customer_dns' end,
  case when r.slug = 'demo-east' and c.step_order = 3 then 'github_rate_limited' end,
  case when r.slug = 'demo-central' and c.step_order = 10 then now() + interval '15 minutes' end,
  case when (r.slug = 'demo-north') or (r.slug = 'demo-east' and c.step_order <= 3) or (r.slug = 'demo-central' and c.step_order <= 10)
       then r.created_at + make_interval(mins => c.step_order) end,
  case when (r.slug = 'demo-north') or (r.slug = 'demo-east' and c.step_order < 3) or (r.slug = 'demo-central' and c.step_order < 10)
       then r.created_at + make_interval(mins => c.step_order + 1) end
from control_plane.provisioning_runs r
cross join (values
  (1,'validate_request',null::text,null::text,true,'validated',null::text,3),
  (2,'create_tenant_records','supabase','database_project',true,'tenant_created',null,5),
  (3,'seed_repository','github','repository',true,'repository_seeded',null,5),
  (4,'commit_configuration','github','branch',true,'config_committed',null,5),
  (5,'protect_repository','github','ruleset',true,null,null,5),
  (6,'create_projects','vercel','project',true,'projects_created',null,5),
  (7,'configure_mail','resend','sending_domain',false,null,null,5),
  (8,'configure_environment','vercel','project',true,'environment_configured',null,5),
  (9,'deploy_applications','vercel','deployment',true,null,null,5),
  (10,'verify_domains','vercel','domain',true,'domain_deployed','domain_pending',60),
  (11,'health_check',null,null,true,'health_checked',null,10),
  (12,'generate_agent_pack',null,null,true,null,null,3)
) c(step_order,step_key,provider,resource_kind,required,resulting_state,waiting_state,max_attempts)
where r.slug in ('demo-north','demo-east','demo-central')
on conflict do nothing;

insert into control_plane.provisioning_events(run_id,step_key,event,attempt,error_code,occurred_at)
select r.id, e.step_key, e.event, e.attempt, e.error_code, r.created_at + e.offset_
from control_plane.provisioning_runs r
join (values
  ('demo-north',null,'requested',null,null,interval '0'),
  ('demo-north',null,'activated',null,null,interval '1 day'),
  ('demo-east',null,'requested',null,null,interval '0'),
  ('demo-east','seed_repository','failed',4,'github_rate_limited',interval '40 minutes'),
  ('demo-east','seed_repository','failed',5,'github_rate_limited',interval '2 hours'),
  ('demo-central',null,'requested',null,null,interval '0'),
  ('demo-central','verify_domains','waiting',0,null,interval '3 hours')
) e(slug,step_key,event,attempt,error_code,offset_) on e.slug = r.slug
where not exists (select 1 from control_plane.provisioning_events x where x.run_id = r.id);

-- Rollouts -------------------------------------------------------------------
insert into control_plane.rollouts(id,release_id,status,target_rings,reason,created_by,started_at,finished_at,created_at)
select 'd7000000-0000-4000-8000-000000000001','d6000000-0000-4000-8000-000000000001','completed',array['canary'],
  'Synthetic demo baseline rollout',admin_id,now() - interval '39 days',now() - interval '39 days',now() - interval '39 days' from demo_ids
union all
select 'd7000000-0000-4000-8000-000000000002','d6000000-0000-4000-8000-000000000002','paused',array['canary'],
  'Synthetic demo canary of 0.2.0',admin_id,now() - interval '1 day',null,now() - interval '1 day' from demo_ids
on conflict do nothing;

-- Jobs -------------------------------------------------------------------------
insert into control_plane.jobs(id,kind,status,tenant_id,instance_id,parameters,attempts,last_error_code,requested_by,
  approved_by,idempotency_key,created_at,updated_at,started_at,completed_at)
select v.id::uuid, v.kind, v.status, v.t::uuid, v.i::uuid, v.params::jsonb, v.attempts, v.err,
  case v.who when 'admin2' then d.admin2_id else d.operator_id end, null,
  'demo-job-' || right(v.id, 2), now() - v.age, now() - v.age, case when v.attempts > 0 then now() - v.age end,
  case when v.status = 'succeeded' then now() - v.age + interval '2 minutes' end
from demo_ids d, (values
  ('d8000000-0000-4000-8000-000000000001','provision_instance','succeeded','d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','{"slug":"demo-north"}',1,null,'operator',interval '41 days'),
  ('d8000000-0000-4000-8000-000000000002','provision_instance','failed','d1000000-0000-4000-8000-000000000002','d3000000-0000-4000-8000-000000000002','{"slug":"demo-east"}',5,'github_rate_limited','operator',interval '3 days'),
  ('d8000000-0000-4000-8000-000000000003','verify_domain','queued','d1000000-0000-4000-8000-000000000004','d3000000-0000-4000-8000-000000000004','{"domain_id":"da000000-0000-4000-8000-000000000002","hostname":"book.demo-central.example.invalid"}',0,null,'operator',interval '2 hours'),
  ('d8000000-0000-4000-8000-000000000004','close_instance','queued','d1000000-0000-4000-8000-000000000003','d3000000-0000-4000-8000-000000000003','{"reason_recorded":true}',0,null,'admin2',interval '5 hours'),
  ('d8000000-0000-4000-8000-000000000005','publish_release','failed','d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','{"release":"0.2.0","rollout_id":"d7000000-0000-4000-8000-000000000002"}',1,'smoke_failed','operator',interval '1 day'),
  ('d8000000-0000-4000-8000-000000000006','reconcile_drift','succeeded','d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','{"provider":"vercel"}',1,null,'operator',interval '6 hours')
) v(id,kind,status,t,i,params,attempts,err,who,age)
on conflict do nothing;

insert into control_plane.job_events(job_id,event,attempt,error_code,actor_id,occurred_at)
select j.id, e.event, e.attempt, e.err, case when e.event = 'enqueued' then j.requested_by end, j.created_at + e.offset_
from control_plane.jobs j
join (values
  ('enqueued',null,null,interval '0'),('claimed',1,null,interval '1 minute'),
  ('failed',1,'smoke_failed',interval '3 minutes')
) e(event,attempt,err,offset_) on (e.event = 'enqueued' or j.attempts > 0)
  and (e.event <> 'failed' or j.status = 'failed')
where j.id::text like 'd8000000-%'
  and not exists (select 1 from control_plane.job_events x where x.job_id = j.id);

insert into control_plane.rollout_targets(rollout_id,tenant_id,instance_id,ring,from_release,status,job_id,attempts,error_code)
values
  ('d7000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','canary',null,'succeeded',null,1,null),
  ('d7000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','canary','0.1.0','failed','d8000000-0000-4000-8000-000000000005',1,'smoke_failed')
on conflict do nothing;

-- Health observations (append-only: new fresh rows each run; stale row once) --
insert into control_plane.health_observations(subject_kind,tenant_id,instance_id,subject_key,signal,status,detail,observed_at)
values
  ('instance','d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','client','http_health','healthy','{"synthetic":true}',now() - interval '5 minutes'),
  ('instance','d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','dashboard','http_health','healthy','{"synthetic":true}',now() - interval '5 minutes'),
  ('integration',null,null,'github','api','healthy','{"synthetic":true}',now() - interval '20 minutes');
insert into control_plane.health_observations(subject_kind,tenant_id,instance_id,subject_key,signal,status,error_code,detail,observed_at)
select 'instance','d1000000-0000-4000-8000-000000000003','d3000000-0000-4000-8000-000000000003','client','http_health','degraded','http_slow','{"synthetic":true}',now() - interval '3 hours'
where not exists (select 1 from control_plane.health_observations h where h.instance_id = 'd3000000-0000-4000-8000-000000000003');

-- Integrations -----------------------------------------------------------------
update control_plane.integrations set configured_fingerprint = repeat('c',64), configured_reported_at = now() - interval '1 day',
  last_check_at = now() - interval '1 day', last_check_outcome = 'reachable', last_check_error_code = null, verified_at = null
where provider = 'github';

-- Support access ---------------------------------------------------------------
insert into control_plane.support_grants(id,tenant_id,operator_id,reason,ticket_reference,status,requested_at,approved_by,
  approved_at,starts_at,expires_at,revoked_at,revoked_by)
select 'd9000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001',operator_id,
  'Synthetic demo: customer reports missing Tuesday slots','DEMO-1042','active',now() - interval '20 minutes',
  admin_id,now() - interval '10 minutes',now() - interval '10 minutes',now() + interval '2 hours',null,null from demo_ids
union all
select 'd9000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000002',operator_id,
  'Synthetic demo: trial onboarding question about services','DEMO-1043','pending',now() - interval '1 hour',
  null,null,null,null,null,null from demo_ids
union all
select 'd9000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000003',operator_id,
  'Synthetic demo: billing dispute investigation','DEMO-0991','revoked',now() - interval '9 days',
  admin_id,now() - interval '9 days',now() - interval '9 days',now() - interval '8 days',now() - interval '9 days' + interval '30 minutes',admin_id from demo_ids
on conflict (id) do update set status = excluded.status, starts_at = excluded.starts_at,
  expires_at = excluded.expires_at, approved_at = excluded.approved_at, revoked_at = excluded.revoked_at,
  revoked_by = excluded.revoked_by;

-- Platform flag ----------------------------------------------------------------
insert into control_plane.platform_flags(key,enabled,kind,message_en,message_ar,updated_by)
select 'maintenance.demo',false,'incident_banner','Synthetic demo: scheduled maintenance tonight.',
  'عرض تجريبي: صيانة مجدولة الليلة.',admin_id from demo_ids
on conflict (key) do nothing;

-- Audit history ----------------------------------------------------------------
insert into control_plane.audit_events(id,operator_id,action,tenant_id,instance_id,target_kind,target_id,reason,detail,outcome,created_at)
select v.id::uuid, case v.who when 'admin' then d.admin_id when 'admin2' then d.admin2_id when 'viewer' then d.viewer_id else d.operator_id end,
  v.action, v.t::uuid, null, v.kind, v.target, v.reason, v.detail::jsonb, v.outcome, now() - v.age
from demo_ids d, (values
  ('db000000-0000-4000-8000-000000000001','admin','tenant.created','d1000000-0000-4000-8000-000000000001','tenant','d1000000-0000-4000-8000-000000000001',null,'{"name":"Synthetic demo · North Clinic"}','succeeded',interval '42 days'),
  ('db000000-0000-4000-8000-000000000002','admin','plan.assigned','d1000000-0000-4000-8000-000000000001','subscription','d1000000-0000-4000-8000-000000000001','Synthetic demo onboarding','{"plan":"launch","ring":"canary"}','succeeded',interval '41 days'),
  ('db000000-0000-4000-8000-000000000003','admin','rollout.started',null,'rollout','d7000000-0000-4000-8000-000000000002',null,'{"targets":1}','succeeded',interval '1 day'),
  ('db000000-0000-4000-8000-000000000004','admin','tenant.suspended','d1000000-0000-4000-8000-000000000003','tenant','d1000000-0000-4000-8000-000000000003','Synthetic demo: payment dispute','{"from":"active","to":"suspended"}','succeeded',interval '6 hours'),
  ('db000000-0000-4000-8000-000000000005','admin2','tenant.closure_requested','d1000000-0000-4000-8000-000000000003','tenant','d1000000-0000-4000-8000-000000000003','Synthetic demo: contract ended','{"job_ids":["d8000000-0000-4000-8000-000000000004"]}','succeeded',interval '5 hours'),
  ('db000000-0000-4000-8000-000000000006','viewer','tenant.suspend','d1000000-0000-4000-8000-000000000001','tenant','d1000000-0000-4000-8000-000000000001',null,'{"error_code":"policy_denied"}','denied',interval '4 hours'),
  ('db000000-0000-4000-8000-000000000007','admin','support.approved','d1000000-0000-4000-8000-000000000001','support_grant','d9000000-0000-4000-8000-000000000001',null,'{"grant_id":"d9000000-0000-4000-8000-000000000001"}','succeeded',interval '10 minutes')
) v(id,who,action,t,kind,target,reason,detail,outcome,age)
on conflict (id) do nothing;

commit;
```

- [ ] **Step 2: README for the demo directory**

`supabase/demo/README.md`:
```markdown
# Local demo data (synthetic)

`platform-admin-demo.sql` populates the control plane of the **isolated**
`platform-admin-20261006` stack with clearly synthetic tenants, runs, jobs,
releases, rollouts, health observations, support grants and audit history.

- Run only through `node scripts/platform-admin-local.mjs seed`, which creates the
  four demo operator accounts first and refuses any stack but the isolated one.
- Never part of `seed.sql` or any migration; never applied by `db reset` or a deploy.
- Re-running is safe: fixed IDs, `ON CONFLICT`, and time-relative values refreshed.
- Every name contains "Synthetic demo" and every email ends in `.example.invalid`.
```

- [ ] **Step 3: Seed and inspect**

Run:
```bash
rtk node scripts/platform-admin-local.mjs seed
rtk node scripts/platform-admin-local.mjs seed   # second run must also succeed
export DB_URL=$(pnpm exec supabase status --output env --workdir "$PWD/.artifacts/platform-admin/isolated" | sed -n 's/^DB_URL="\(.*\)"/\1/p')
rtk psql "$DB_URL" -c "select status, count(*) from app.tenants where name like 'Synthetic demo%' group by 1"
rtk psql "$DB_URL" -c "select state, count(*) from control_plane.provisioning_runs group by 1"
rtk stat -f '%Lp' .artifacts/platform-admin/credentials.json
```
Expected: both seeds succeed; tenants: 4 active, 1 suspended; runs: active 1, failed 1, domain_pending 1; credentials file mode `600`. If an insert fails on a check constraint, fix the demo row — never relax a constraint for demo data.

Then check the views as the demo viewer would see them (as postgres with viewer claims):
```bash
rtk psql "$DB_URL" -c "select set_config('request.jwt.claims', json_build_object('sub',(select id from auth.users where email='demo-viewer@platform-admin.example.invalid'),'role','authenticated','aal','aal2')::text, false); select kind, tenant_name, code from control_plane.list_alerts_v1();"
```
Expected alerts include `provisioning_failed` (East), `job_failed`, `rollout_paused`, `stale_observation` (West), `drift` (North), `approval_pending` (West), `support_pending` (East).

- [ ] **Step 4: Commit**

```bash
rtk git add supabase/demo/platform-admin-demo.sql supabase/demo/README.md
rtk git commit -m "Add a repeatable, clearly synthetic Platform Admin demo dataset"
```

### Task 24: Run Platform Admin against the isolated stack (`serve`)

**Files:**
- Modify: `scripts/platform-admin-local.mjs` (add `serve`), `scripts/platform-admin-local.test.mjs`
- Modify: `apps/platform-admin/next.config.ts` (`distDir` override, same as the dashboard's)

**Interfaces:**
- Produces: `node scripts/platform-admin-local.mjs serve [--port 3002] [--replace] [--foreground]`; exports `platformAdminEnvironment(env, port): Record<string, string>` and `isPlatformAdminCwd(cwd: string): boolean`.
  - Injects `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `WLBP_RUNTIME_ENV=local`, `PLATFORM_ADMIN_PORT`, `WLBP_NEXT_DIST_DIR=.next-platform-admin-local` as process environment. Next.js never lets `.env.local` override an existing process variable, so `.env.local` stays untouched and unused for these two keys.
  - If the port is taken: without `--replace` it refuses and prints the holder; with `--replace` it stops the holder **only** if that process's working directory is this repository's `apps/platform-admin` (the dev server started by `pnpm dev`). It never stops anything else.
  - Background mode writes `.artifacts/platform-admin/dev.log` and `.artifacts/platform-admin/dev.pid`.

- [ ] **Step 1: Write the failing test**

Append to `scripts/platform-admin-local.test.mjs`:
```js
import { isPlatformAdminCwd, platformAdminEnvironment } from "./platform-admin-local.mjs";
import path from "node:path";
import { root } from "./platform-admin-local.mjs";

test("injects the isolated stack as process environment", () => {
  const env = platformAdminEnvironment(
    { apiUrl: "http://127.0.0.1:56521", publishableKey: "p", anonKey: "a", dbUrl: "x", serviceRoleKey: "s" }, "3002");
  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, "http://127.0.0.1:56521");
  assert.equal(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, "p");
  assert.equal(env.PLATFORM_ADMIN_PORT, "3002");
  assert.ok(!Object.values(env).includes("s"), "the service key never reaches the app");
});

test("only this repository's Platform Admin may be replaced", () => {
  assert.equal(isPlatformAdminCwd(path.join(root, "apps/platform-admin")), true);
  assert.equal(isPlatformAdminCwd(path.join(root, "apps/dashboard")), false);
  assert.equal(isPlatformAdminCwd("/somewhere/else/apps/platform-admin"), false);
});
```

Run: `rtk node --test scripts/platform-admin-local.test.mjs`
Expected: FAIL — exports missing.

- [ ] **Step 2: Implement `serve`**

Add to `scripts/platform-admin-local.mjs` (merge imports with the existing ones: `spawn` from `node:child_process`, `openSync` from `node:fs`):
```js
export function platformAdminEnvironment(env, port) {
  return {
    NEXT_PUBLIC_SUPABASE_URL: env.apiUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.publishableKey,
    WLBP_RUNTIME_ENV: "local",
    PLATFORM_ADMIN_PORT: port,
    WLBP_NEXT_DIST_DIR: ".next-platform-admin-local",
  };
}

export function isPlatformAdminCwd(cwd) {
  return path.resolve(cwd) === path.join(root, "apps/platform-admin");
}

function listenerOn(port) {
  try {
    return execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" }).trim().split("\n")[0] || null;
  } catch {
    return null;
  }
}

function cwdOf(pid) {
  const out = execFileSync("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"], { encoding: "utf8" });
  return out.split("\n").find((line) => line.startsWith("n"))?.slice(1) ?? "";
}

async function serve() {
  await assertIsolated();
  const args = process.argv.slice(3);
  const port = args.includes("--port") ? args[args.indexOf("--port") + 1] : "3002";
  const env = isolatedEnvironment();
  const holder = listenerOn(port);
  if (holder) {
    const cwd = cwdOf(holder);
    if (!args.includes("--replace") || !isPlatformAdminCwd(cwd)) {
      throw new Error(`port ${port} is held by pid ${holder} (${cwd || "unknown cwd"}); ` +
        "rerun with --replace only if that is this repository's Platform Admin dev server");
    }
    process.kill(Number(holder), "SIGTERM");
    for (let tries = 0; listenerOn(port) && tries < 50; tries += 1) await new Promise((r) => setTimeout(r, 200));
    if (listenerOn(port)) throw new Error(`port ${port} did not free up`);
  }
  const childEnv = { ...process.env, ...platformAdminEnvironment(env, port) };
  const command = ["--filter", "@wlbp/platform-admin", "exec", "next", "dev", "--port", port];
  if (args.includes("--foreground")) {
    const child = spawn("pnpm", command, { cwd: root, env: childEnv, stdio: "inherit" });
    child.on("exit", (code) => process.exit(code ?? 0));
    return;
  }
  const log = openSync(path.join(output, "dev.log"), "a");
  const child = spawn("pnpm", command, { cwd: root, env: childEnv, stdio: ["ignore", log, log], detached: true });
  child.unref();
  await writeText(path.join(output, "dev.pid"), `${child.pid}\n`);
  process.stdout.write(`Platform Admin starting on http://localhost:${port} against ${projectId} (log: .artifacts/platform-admin/dev.log)\n`);
}
```
Register `serve` in `commands`.

In `apps/platform-admin/next.config.ts`, add to `nextConfig`:
```ts
  distDir: process.env.WLBP_NEXT_DIST_DIR ?? ".next",
```
`.next-*/` is already git-ignored.

- [ ] **Step 3: Run the tests**

Run: `rtk node --test scripts/platform-admin-local.test.mjs`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
rtk git add scripts/platform-admin-local.mjs scripts/platform-admin-local.test.mjs apps/platform-admin/next.config.ts
rtk git commit -m "Serve Platform Admin against the isolated stack without touching other apps"
```

### Task 25: Browser tests for the critical journeys

**Files:**
- Modify: `playwright.config.ts` (one project, one server branch)
- Create: `tests/e2e/platform-admin-fixtures.ts`
- Create: `tests/e2e/platform-admin.spec.ts`

**Interfaces:**
- Consumes: `isolatedEnvironment`, credentials file (Task 22), `totp` (Task 22), demo data (Task 23), `serve --foreground` (Task 24).
- Produces: `PLATFORM_ADMIN_E2E=1 pnpm exec playwright test --project=platform-admin`.

- [ ] **Step 1: Wire the project**

In `playwright.config.ts`, add after the `dashboard-completion` project:
```ts
    {
      name: "platform-admin",
      testMatch: /platform-admin\.spec\.ts$/u,
      use: { screenshot: "only-on-failure", trace: "retain-on-failure", video: "off", actionTimeout: 30_000, navigationTimeout: 60_000 },
    },
```
and replace the `webServer` selector's first branch so the new switch comes first:
```ts
  webServer: (process.env.PLATFORM_ADMIN_E2E === "1"
    ? [{ command: "node scripts/platform-admin-local.mjs serve --port 41742 --foreground", port: 41742, reuseExistingServer: false }]
    : process.env.DASHBOARD_COMPLETION_E2E === "1"
      ? completionServers
      : process.env.LIVE_BOOKING_E2E === "1"
        ? liveBookingServers
        : servers
  ).map(({ command, port, reuseExistingServer }) => ({
```
(The rest of the `.map(...)` stays as it is; raise its `timeout` to `180_000` only if the first Platform Admin compile exceeds 120 s.)

- [ ] **Step 2: Fixtures**

`tests/e2e/platform-admin-fixtures.ts`:
```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
// @ts-expect-error -- plain ESM helpers shared with the seed script
import { isolatedEnvironment } from "../../scripts/platform-admin-local.mjs";
// @ts-expect-error -- plain ESM helper
import { totp } from "../../scripts/totp.mjs";

export const adminOrigin = "http://localhost:41742";
export type DemoOperator = "admin" | "admin2" | "operator" | "viewer";
type Credential = { email: string; password: string; totpSecret: string; factorId: string };

const credentialFile = process.env.PLATFORM_ADMIN_CREDENTIAL_FILE
  ?? path.join(process.cwd(), ".artifacts/platform-admin/credentials.json");

export function credential(who: DemoOperator): Credential {
  return JSON.parse(readFileSync(credentialFile, "utf8")).operators[who];
}

export const env = isolatedEnvironment() as { apiUrl: string; anonKey: string; publishableKey: string };

const lastStep = new Map<string, number>();

/** A code for a 30-second step this operator has not used yet in this run. */
export async function freshCode(who: DemoOperator): Promise<string> {
  let step = Math.floor(Date.now() / 30000);
  if (lastStep.get(who) === step) {
    await new Promise((resolve) => setTimeout(resolve, (step + 1) * 30000 - Date.now() + 500));
    step = Math.floor(Date.now() / 30000);
  }
  lastStep.set(who, step);
  return totp(credential(who).totpSecret);
}

export async function signIn(page: Page, who: DemoOperator, locale: "en" | "ar" = "en") {
  const c = credential(who);
  await page.goto(`${adminOrigin}/${locale}/login`);
  await page.locator("#email").fill(c.email);
  await page.locator("#password").fill(c.password);
  await page.locator('form button[type="submit"]').click();
  await page.locator("#code").fill(await freshCode(who));
  await page.locator('form button[type="submit"]').click();
  await expect(page.locator(".console")).toBeVisible();
}

async function auth(route: string, init: RequestInit & { token?: string } = {}) {
  const response = await fetch(`${env.apiUrl}/auth/v1${route}`, {
    ...init,
    headers: { apikey: env.anonKey, authorization: `Bearer ${init.token ?? env.anonKey}`, "content-type": "application/json" },
  });
  return response.json() as Promise<Record<string, unknown>>;
}

/** An access token at aal1 (password only) or aal2 (password + TOTP). */
export async function apiToken(who: DemoOperator, aal: "aal1" | "aal2"): Promise<string> {
  const c = credential(who);
  const session = await auth("/token?grant_type=password", { method: "POST", body: JSON.stringify({ email: c.email, password: c.password }) });
  if (aal === "aal1") return session.access_token as string;
  const challenge = await auth(`/factors/${c.factorId}/challenge`, { method: "POST", token: session.access_token as string, body: "{}" });
  const verified = await auth(`/factors/${c.factorId}/verify`, {
    method: "POST", token: session.access_token as string,
    body: JSON.stringify({ challenge_id: challenge.id, code: await freshCode(who) }),
  });
  return verified.access_token as string;
}

export async function rpc(fn: string, body: object, token?: string) {
  const response = await fetch(`${env.apiUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: env.publishableKey, authorization: `Bearer ${token ?? env.publishableKey}`,
      "content-profile": "api_v1", "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.text() };
}

/** Fails on uncaught page errors and on hydration or React errors in the console. */
export function watchConsole(page: Page): () => string[] {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /hydrat|did not match|Warning: |Uncaught/iu.test(message.text())) problems.push(message.text());
  });
  return () => problems;
}
```
If `@ts-expect-error` is reported as unused because `allowJs` resolves the `.mjs` types, delete those two comment lines.

- [ ] **Step 3: The spec**

`tests/e2e/platform-admin.spec.ts`:
```ts
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { adminOrigin, apiToken, rpc, signIn, watchConsole } from "./platform-admin-fixtures";

test.describe.configure({ mode: "serial" });

const areas = ["", "tenants", "instances", "domains", "provisioning", "jobs", "plans", "subscriptions",
  "releases", "rollouts", "health", "support", "operators", "audit", "settings", "account"];

test("signed-out visitors are sent to sign in", async ({ page }) => {
  await page.goto(`${adminOrigin}/en/tenants`);
  await expect(page).toHaveURL(/\/en\/login$/u);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("an administrator signs in with TOTP and sees real overview data", async ({ page }) => {
  const problems = watchConsole(page);
  await signIn(page, "admin");
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
  await expect(page.getByText("Provisioning failed")).toBeVisible();
  await expect(page.getByText(/later M1|System ready/u)).toHaveCount(0);
  expect(problems()).toEqual([]);
});

test("every navigation item opens a working page without console errors", async ({ page }) => {
  const problems = watchConsole(page);
  await signIn(page, "admin");
  for (const area of areas) {
    const response = await page.goto(`${adminOrigin}/en${area ? `/${area}` : ""}`);
    expect(response?.status(), area).toBe(200);
    await expect(page.getByRole("heading", { level: 1 }), area).toBeVisible();
    await expect(page.getByText("This information could not be loaded"), area).toHaveCount(0);
  }
  expect(problems()).toEqual([]);
});

test("lists read persisted demo data and keep their filters in the URL", async ({ page }) => {
  await signIn(page, "viewer");
  await page.goto(`${adminOrigin}/en/tenants?status=suspended`);
  await expect(page.getByRole("link", { name: "Synthetic demo · West Salon" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Synthetic demo · North Clinic" })).toHaveCount(0);
  await page.goto(`${adminOrigin}/en/health?status=unknown`);
  await expect(page.getByText("Not observed").first()).toBeVisible();
  await page.goto(`${adminOrigin}/en/provisioning?state=failed`);
  await page.getByRole("link", { name: "demo-east" }).click();
  await expect(page.getByText("github_rate_limited").first()).toBeVisible();
});

test("a viewer gets a read-only interface", async ({ page }) => {
  await signIn(page, "viewer");
  await page.goto(`${adminOrigin}/en/tenants`);
  await expect(page.getByRole("link", { name: "Register tenant" })).toHaveCount(0);
  await page.goto(`${adminOrigin}/en/operators`);
  await expect(page.getByRole("button", { name: "Add operator" })).toHaveCount(0);
});

test("the server refuses unauthorized direct API calls", async () => {
  const anonymous = await rpc("list_tenants_v1", {});
  expect(anonymous.status).toBeGreaterThanOrEqual(400);

  const unverified = await rpc("list_tenants_v1", {}, await apiToken("viewer", "aal1"));
  expect(unverified.status).toBeGreaterThanOrEqual(400);
  expect(unverified.body).toContain("policy_denied");

  const viewer = await apiToken("viewer", "aal2");
  expect((await rpc("list_tenants_v1", {}, viewer)).status).toBe(200);
  const mutation = await rpc("set_tenant_status_v1", {
    p_tenant_id: "d1000000-0000-4000-8000-000000000001", p_status: "suspended",
    p_reason: "viewer should not be able to do this", p_expected_status: "active",
  }, viewer);
  expect(mutation.body).toContain("policy_denied");
});

test("an administrator registers, renames, suspends and reactivates a tenant, and the audit log records it", async ({ page }) => {
  const stamp = Date.now().toString(36);
  const name = `Synthetic demo · E2E ${stamp}`;
  await signIn(page, "admin");
  await page.goto(`${adminOrigin}/en/tenants/new`);
  await page.locator("#name").fill(name);
  await page.locator("#brandKey").fill(`e2e-${stamp}`);
  await page.getByRole("button", { name: "Register tenant" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(page.getByText("Tenant registered.")).toBeVisible();

  // Keyboard: open the dialog, Escape closes it, focus returns to the trigger.
  const suspend = page.getByRole("button", { name: "Suspend", exact: true });
  await suspend.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(suspend).toBeFocused();

  await suspend.click();
  await page.getByRole("dialog").getByLabel("Reason").fill("E2E: verifying the suspension workflow");
  await page.getByRole("dialog").getByRole("button", { name: "Suspend" }).click();
  await expect(page.getByText("Tenant suspended.")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Reactivate" }).click();
  await page.getByRole("dialog").getByLabel("Reason").fill("E2E: verifying reactivation works");
  await page.getByRole("dialog").getByRole("button", { name: "Reactivate" }).click();
  await expect(page.getByText("Tenant reactivated.")).toBeVisible();

  await page.goto(`${adminOrigin}/en/audit?q=${encodeURIComponent("E2E: verifying the suspension")}`);
  await expect(page.getByText("Suspended a tenant")).toBeVisible();
});

test("validation errors are explained, not raw", async ({ page }) => {
  await signIn(page, "admin");
  await page.goto(`${adminOrigin}/en/tenants/new`);
  await page.locator("#name").fill("Synthetic demo · Bad key");
  await page.locator("#brandKey").fill("Not A Key");
  await page.getByRole("button", { name: "Register tenant" }).click();
  await expect(page.getByRole("alert")).toContainText("lowercase letters");
});

test("two-person control: the requester cannot approve the close job", async ({ page }) => {
  await signIn(page, "admin2");
  await page.goto(`${adminOrigin}/en/jobs/d8000000-0000-4000-8000-000000000004`);
  await page.getByRole("button", { name: "Approve" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("A different administrator must approve this.");
});

test("Arabic is right-to-left and fully translated", async ({ page }) => {
  await signIn(page, "viewer", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { level: 1, name: "نظرة عامة" })).toBeVisible();
  await page.goto(`${adminOrigin}/ar/tenants`);
  await expect(page.getByRole("link", { name: "المستأجرون" }).first()).toBeVisible();
  await expect(page.getByText(/Unknown status/u)).toHaveCount(0);
});

test("mobile navigation is an explicit disclosure", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "viewer");
  const menu = page.getByRole("button", { name: "Menu" });
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toBeFocused();
});

for (const locale of ["en", "ar"] as const) {
  test(`key pages have no automated WCAG A/AA violations (${locale})`, async ({ page }) => {
    await signIn(page, "admin", locale);
    for (const area of ["", "tenants", "tenants/d1000000-0000-4000-8000-000000000001", "provisioning/d5000000-0000-4000-8000-000000000002", "audit"]) {
      await page.goto(`${adminOrigin}/${locale}${area ? `/${area}` : ""}`);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      expect(results.violations, area).toEqual([]);
    }
  });
}
```

- [ ] **Step 4: Run it**

Run:
```bash
rtk node scripts/platform-admin-local.mjs seed
PLATFORM_ADMIN_E2E=1 rtk pnpm exec playwright test --project=platform-admin
```
Expected: all tests pass. Each sign-in may wait up to 30 s for a fresh TOTP step; the suite is serial on purpose. On failure, fix the product (or a wrong selector), never weaken an assertion about authorization, unknown states or console errors.

- [ ] **Step 5: Commit**

```bash
rtk git add tests/e2e/platform-admin-fixtures.ts tests/e2e/platform-admin.spec.ts
rtk git add -p playwright.config.ts   # only the platform-admin project and server branch
rtk git commit -m "Cover Platform Admin's critical journeys in the browser"
```

### Task 26: Full verification and evidence

**Files:**
- Create: `docs/platform-admin-verification.md`
- Logs: `.artifacts/platform-admin/gates/*.log` (ignored)

- [ ] **Step 1: Run every gate and keep its log**

Run each command and save its output with `| tee .artifacts/platform-admin/gates/<name>.log`:
```bash
mkdir -p .artifacts/platform-admin/gates
export WLBP_SUPABASE_WORKDIR="$PWD/.artifacts/platform-admin/isolated"
rtk pnpm format:check
rtk pnpm lint
rtk pnpm typecheck
rtk pnpm test:unit
rtk pnpm test:config
rtk node scripts/platform-admin-local.mjs replay
rtk pnpm db:lint
rtk node scripts/platform-admin-local.mjs test
rtk pnpm check:db-types
rtk node scripts/platform-admin-local.mjs seed
rtk pnpm --filter @wlbp/platform-admin build
rtk pnpm check:boundaries
rtk pnpm check:distribution
rtk pnpm check:secrets
rtk pnpm check:bundles
rtk pnpm check:docs
PLATFORM_ADMIN_E2E=1 rtk pnpm exec playwright test --project=platform-admin
rtk pnpm exec playwright test --project=e2e --project=a11y --grep "platform-admin"
```
Expected: all pass. `format:check` and `lint` cover the whole repository; failures in files this plan did not touch are pre-existing — record them with the file names, do not fix unrelated files, and do not count them as passes.

- [ ] **Step 2: Prove no secret reaches the browser, logs or audit**

Run (the values are read into shell variables and never printed):
```bash
SERVICE=$(pnpm exec supabase status --output env --workdir "$WLBP_SUPABASE_WORKDIR" | sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"/\1/p')
SECRETS=$(node -e 'const c=require("./.artifacts/platform-admin/credentials.json");console.log(Object.values(c.operators).flatMap(o=>[o.password,o.totpSecret]).join("\n"))')
for value in "$SERVICE" $SECRETS; do
  grep -rlF "$value" apps/platform-admin/.next apps/platform-admin/.next-platform-admin-local .artifacts/platform-admin/dev.log .artifacts/platform-admin/gates 2>/dev/null && echo "LEAK FOUND" || true
done
DB_URL=$(pnpm exec supabase status --output env --workdir "$WLBP_SUPABASE_WORKDIR" | sed -n 's/^DB_URL="\(.*\)"/\1/p')
for value in "$SERVICE" $SECRETS; do
  # stdin, not -c: psql interpolates :'v' only in input it reads, and quotes it safely.
  echo "select count(*) from control_plane.audit_events where strpos(detail::text, :'v') > 0 or strpos(coalesce(reason,''), :'v') > 0;" \
    | psql "$DB_URL" -At -v v="$value"
done
grep -rn "control_plane" dist-distribution 2>/dev/null | head -1
```
Expected: no `LEAK FOUND`; every audit count is `0`; the distribution grep prints nothing.

- [ ] **Step 3: Write the evidence document**

`docs/platform-admin-verification.md` with these sections, filled from the actual runs (no placeholders, no claims without a log):
1. **Environment** — isolated project id, ports, which stack the running Platform Admin uses (from `dev.log` and `ps -E`/`lsof` of the server process), confirmation that `white-label-booking-platform`, `dashboard-completion-20261005` and `maslak_dashboard` were not reset or modified.
2. **Gate table** — command, result, log path. Gates that do not exist are written `N/A — not yet implemented, owned by issue #N` per `AGENTS.md`.
3. **Database contract** — the six new pgTAP files and what each proves (copy their assertion descriptions).
4. **Browser journeys** — each Playwright test name and result.
5. **Secrets** — Step 2 results.
6. **External dependencies, unverified** — the table from the master plan §1, with the exact configuration each needs (names only).
7. **Accessibility** — automated axe results; "Human screen-reader acceptance: not performed" unless the user has supplied it.
8. **Contract versions** — `whiteLabelVersion`, `configSchemaVersion`, `backendContract` read from `platform-contract.json`.

- [ ] **Step 4: Commit**

```bash
rtk git add docs/platform-admin-verification.md
rtk git commit -m "Record Platform Admin verification evidence"
```

---

### Task 27: Leave it running, inspect it natively, update the knowledge pack, hand off

**Files:**
- Modify: `docs/local-setup.md` (Platform Admin isolated stack section)
- Modify: `docs/runbooks.md` (operator bootstrap, MFA recovery, break-glass, support access)
- Modify: `docs/architecture.md` (control-plane operator RPC pattern: `require_operator_v1`, step-up, idempotency ledger, jobs worker boundary, releases/rollouts)
- Modify: `docs/superpowers/plans/2026-10-06-platform-admin-checkpoint.md` (final state)

- [ ] **Step 1: Start the app on the expected URL**

Run:
```bash
rtk lsof -nP -iTCP:3002 -sTCP:LISTEN
rtk node scripts/platform-admin-local.mjs serve --port 3002 --replace
rtk curl -sI http://localhost:3002/en/login | head -1
```
Expected: if port 3002 was held by this repository's Platform Admin dev server (pointing at the wrong database), it is replaced; anything else is refused and reported. `HTTP/1.1 200`. Client (3000) and Dashboard (3001) are left exactly as they were.

- [ ] **Step 2: Native inspection with the T3 preview tools**

Using `preview_open` / `preview_navigate` / `preview_snapshot` / `preview_resize` / `preview_click` / `preview_type` on `http://localhost:3002`:
- Sign in as the demo admin (password and current TOTP from `node -e` with `scripts/totp.mjs` — never paste them into chat output).
- Visit every navigation item in English, then in Arabic; confirm `dir="rtl"`, mirrored layout, Arabic labels, localized digits.
- Resize to 390×844 and 820×1180; confirm the menu disclosure, table scroll regions, and dialogs fit the viewport.
- Open and cancel one dialog with the keyboard only.
- Record observations (pass/fail per item) in `docs/platform-admin-verification.md` under "Native inspection". Fix any defect found, re-run the affected gate, and commit.

- [ ] **Step 3: Knowledge-pack updates**

- `docs/local-setup.md`: add "Platform Admin (isolated stack)": `node scripts/platform-admin-local.mjs start|seed|serve|test|replay|stop`, ports 56521/56522, credentials file location and permissions, the TOTP helper, and the warning that `.env.local` on port 54321 may point at another project.
- `docs/runbooks.md`: add procedures — bootstrapping the first administrator (insert into `control_plane.operators` with a reviewed migration or the SQL editor, then enroll TOTP), lost authenticator recovery (the steps in the Account page copy), granting and expiring break-glass, approving destructive jobs, support access lifecycle.
- `docs/architecture.md`: document the operator RPC pattern and the worker boundaries (`claim_job_v1`/`complete_job_v1`, `report_rollout_target_v1`, `record_health_observation_v1`, `record_integration_status_v1`) as the contract future workers must implement.
- Run `rtk pnpm check:docs`; expected: pass.

- [ ] **Step 4: Final checkpoint**

Rewrite `docs/superpowers/plans/2026-10-06-platform-admin-checkpoint.md` to state: what is complete; every changed file and migration (`git diff --stat` since the starting commit plus new files); how to start, seed and serve; the login instructions (where the credentials file is, how to get a TOTP code with `node -e "import('./scripts/totp.mjs').then(m=>console.log(m.totp(require('./.artifacts/platform-admin/credentials.json').operators.admin.totpSecret)))"`); the feature-to-route checklist with status per route; gate results; unverified external dependencies; and resume instructions.

- [ ] **Step 5: Commit and hand off**

```bash
rtk git add docs/local-setup.md docs/runbooks.md docs/architecture.md docs/platform-admin-verification.md docs/superpowers/plans/2026-10-06-platform-admin-checkpoint.md
rtk git commit -m "Document the Platform Admin control plane and how to run it locally"
```
(`docs/local-setup.md` has unrelated uncommitted edits; stage only this task's hunks with `git add -p`.)

Hand-off message to the user (concise): the URL `http://localhost:3002/en`; login instructions; the feature-to-route checklist; gate results with any failures quoted; the unverified external dependencies and the exact configuration each needs; that nothing was pushed or deployed; and where the checkpoint is.
