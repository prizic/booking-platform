# GitHub App Instance Repository Provisioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create, seed, govern, and reconcile private instance repositories through an organization-owned GitHub App without leaking credentials or duplicating provider resources.

**Architecture:** A private Node ESM module in `control-plane/github-app/` receives a database-claimed GitHub step and calls an injected GitHub App adapter once. PostgreSQL remains the source of ordering, idempotency, retry, and audit state; the worker only maps one claimed step to one provider call and a sanitized completion. Signed webhook ingress deduplicates metadata by delivery ID and enqueues reconciliation without retaining the raw body.

**Tech Stack:** Node.js ESM (`node:crypto`, `fetch`, `node:test`), Supabase/PostgreSQL migrations and pgTAP, existing provisioning RPCs, existing sanitized-distribution manifest.

**Spec:** `docs/superpowers/specs/2026-09-18-github-app-instance-repository-design.md`

## Global Constraints

- Keep all implementation below `control-plane/github-app/`; it is platform-only and must never enter the distribution export.
- Use an organization-owned GitHub App installation token, not a personal token; credentials are runtime-only and never persist or log.
- Treat `control_plane.provisioning_steps` and `complete_provisioning_step_v1` as the sole source of step ordering, retry, and idempotency.
- Verify GitHub webhook signatures over unmodified raw bytes before parsing; retain a SHA-256 digest and safe metadata only.
- Every new database table enables RLS with a deny-by-default application policy and positive/negative pgTAP coverage.
- Seed only the allowlist-validated `dist-distribution/` artifact; never private source history, migrations, control-plane code, or secrets.
- Preserve the existing `whiteLabelVersion: 0.1.0`, `configSchemaVersion: 3`, and `backendContract: { min: 1, max: 1 }` contract unless the implementation genuinely changes one.
- Do not add a dependency unless the standard library cannot meet the need and its license, maintenance, security, and bundle impact are documented.

---

### Task 1: Add durable, redacted GitHub delivery and infrastructure contracts

**Files:**
- Create: `supabase/migrations/20260927120000_github_app_repository_provisioning.sql`
- Modify: `supabase/tests/database/provisioning_test.sql`
- Modify: `supabase/tests/database/tenant_schema_contract_test.sql`
- Modify: `packages/supabase-client/src/database.types.ts`

**Interfaces:**
- Consumes: `control_plane.provisioning_runs`, `control_plane.provisioning_steps`, `control_plane.instance_infrastructure`, and `control_plane.contains_no_secret_v1` from issue #30.
- Produces: `control_plane.github_webhook_deliveries`, `control_plane.record_github_webhook_delivery_v1(...)`, and typed database rows for the worker.

- [ ] **Step 1: Write failing pgTAP assertions for delivery deduplication and denial**

```sql
select throws_ok(
  $$insert into control_plane.github_webhook_deliveries(delivery_id, payload_sha256, event_name)
    values ('delivery-1', repeat('a', 64), 'repository')$$,
  '42501', 'permission denied for table github_webhook_deliveries',
  'application roles cannot write GitHub delivery state directly'
);

select is(
  (select duplicate from control_plane.record_github_webhook_delivery_v1(
    'delivery-1', repeat('a', 64), 'repository', 'R_kgDOexample',
    '{"action":"renamed"}'::jsonb
  )), false,
  'the first verified delivery is recorded'
);
```

- [ ] **Step 2: Run the database test to verify it fails**

Run: `pnpm test:db -- --file supabase/tests/database/provisioning_test.sql`

Expected: FAIL because `github_webhook_deliveries` and `record_github_webhook_delivery_v1` do not exist.

- [ ] **Step 3: Add the migration with narrow worker-only ingress**

```sql
create table control_plane.github_webhook_deliveries (
  id bigint generated always as identity primary key,
  delivery_id text not null unique check (delivery_id ~ '^[A-Za-z0-9-]{8,200}$'),
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  event_name text not null check (event_name ~ '^[a-z_]{2,80}$'),
  repository_external_id text,
  safe_metadata jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default statement_timestamp(),
  check (jsonb_typeof(safe_metadata) = 'object'),
  check (control_plane.contains_no_secret_v1(safe_metadata))
);
alter table control_plane.github_webhook_deliveries enable row level security;
revoke all on control_plane.github_webhook_deliveries from public, anon, authenticated;
```

Implement `record_github_webhook_delivery_v1` as a `SECURITY DEFINER` worker-only function with an empty search path. It inserts only a digest and allowlisted metadata, returns `duplicate = true` on the same `delivery_id`, and emits a sanitized provisioning reconciliation event when the repository can be mapped to a run.

- [ ] **Step 4: Regenerate safe database types and run focused tests**

Run: `pnpm db:reset && pnpm db:types && pnpm test:db`

Expected: PASS with the new positive/negative delivery, secret-shaped metadata, and duplicate tests.

- [ ] **Step 5: Commit the database contract**

```bash
git add supabase/migrations/20260927120000_github_app_repository_provisioning.sql \
  supabase/tests/database/provisioning_test.sql \
  supabase/tests/database/tenant_schema_contract_test.sql \
  packages/supabase-client/src/database.types.ts
git commit -m "feat: record GitHub webhook deliveries safely"
```

### Task 2: Build the dependency-free GitHub App adapter

**Files:**
- Create: `control-plane/github-app/src/contracts.mjs`
- Create: `control-plane/github-app/src/github-app-client.mjs`
- Create: `control-plane/github-app/src/github-app-client.test.mjs`
- Create: `control-plane/github-app/src/redaction.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: environment secret-reference values at process start, injected `fetch`, injected clock, and a GitHub App installation ID.
- Produces: `createGitHubAppClient({ appId, privateKey, installationId, organization, fetchImpl, now })`, with `resolveRepository`, `createRepository`, `seedRelease`, `commitConfiguration`, `applyGovernance`, `verifyVercelAccess`, and `verifyWebhook` operations.

- [ ] **Step 1: Write failing adapter unit tests**

```js
test('uses a short-lived installation token and never includes it in an error', async () => {
  const client = createGitHubAppClient(fixtures);
  await client.resolveRepository({ name: 'northside-clinic' });
  assert.match(requests[0].headers.authorization, /^Bearer /u);
  assert.doesNotMatch(JSON.stringify(capturedErrors), /ghs_|Bearer /u);
});

test('resolves a repository after a timeout-after-create instead of creating another', async () => {
  const result = await client.createOrResolveRepository({ name: 'northside-clinic', private: true });
  assert.equal(result.externalId, 'R_kgDOexisting');
  assert.equal(createCalls, 1);
});
```

- [ ] **Step 2: Run the new unit test file to verify it fails**

Run: `node --test control-plane/github-app/src/github-app-client.test.mjs`

Expected: FAIL because the adapter module does not exist.

- [ ] **Step 3: Implement a narrow native-API client**

Use `node:crypto` to sign a short-lived RS256 App JWT and `fetch` to exchange it for an installation token. Keep token lifetime at most 10 minutes and cache it in memory only until expiry. Before any mutation, use the installation repository listing to confirm the repository ID/name is visible. Model failures as a discriminated result:

```js
export function providerFailure({ status, retryAfterSeconds }) {
  if (status === 429 || status === 403) return { kind: 'waiting', reason: 'provider_rate_limit', retryAfterSeconds };
  if (status === 404) return { kind: 'failed', code: 'github_scope_or_resource_missing' };
  return { kind: 'failed', code: 'github_provider_error' };
}
```

Allow only known safe response fields into `RepositoryObservation`: REST/node ID, name, visibility, default branch, commit/tree SHA, ruleset fingerprint, and installation/Vercel-access status. Implement centralized redaction that removes authorization headers, token-shaped substrings, and raw response bodies from thrown errors.

- [ ] **Step 4: Run adapter tests and dependency policy checks**

Run: `node --test control-plane/github-app/src/github-app-client.test.mjs && pnpm check:lockfile`

Expected: PASS; no new third-party package is added.

- [ ] **Step 5: Commit the adapter**

```bash
git add control-plane/github-app/src package.json
git commit -m "feat: add scoped GitHub App adapter"
```

### Task 3: Map durable GitHub provisioning steps to exactly one adapter call

**Files:**
- Create: `control-plane/github-app/src/provisioning-worker.mjs`
- Create: `control-plane/github-app/src/provisioning-worker.test.mjs`
- Create: `control-plane/github-app/src/provisioning-store.mjs`
- Modify: `control-plane/provisioning/README.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: `claim_provisioning_step_v1` output `{ id, run_id, tenant_id, instance_id, slug, step_key, idempotency_key, external_id, request }` and `GitHubAppClient`.
- Produces: one `complete_provisioning_step_v1` command per claimed step with outcome `succeeded`, `failed`, or `waiting` and sanitized observations only.

- [ ] **Step 1: Write failing worker behavior tests**

```js
test('does not call GitHub when no step is claimable', async () => {
  await worker.runOnce();
  assert.equal(github.calls.length, 0);
});

test('reports one successful seed and treats replay as database duplicate', async () => {
  await worker.runOnce();
  assert.deepEqual(store.completions[0], {
    outcome: 'succeeded', externalId: 'R_kgDOrepo', observedState: expectedRepositoryState,
  });
  await worker.runOnce();
  assert.equal(github.seedCalls, 1);
});
```

- [ ] **Step 2: Run worker tests to verify they fail**

Run: `node --test control-plane/github-app/src/provisioning-worker.test.mjs`

Expected: FAIL because `GitHubProvisioningWorker` does not exist.

- [ ] **Step 3: Implement step dispatch and outcome mapping**

```js
const handlers = {
  seed_repository: (step) => github.createOrResolveRepository(step),
  commit_configuration: (step) => github.commitConfiguration(step),
  protect_repository: (step) => github.applyGovernance(step),
};

export async function runOnce() {
  const step = await store.claim();
  if (!step || step.provider !== 'github') return { kind: 'idle' };
  const result = await handlers[step.step_key](step);
  return store.complete(step.id, toCompletion(result));
}
```

Reject unknown GitHub step keys before network access. Preserve the database-issued idempotency key on every GitHub mutation. Map `Retry-After` to the database retry time; never locally retry a provider mutation after a timeout because the next durable attempt must resolve first.

- [ ] **Step 4: Run worker tests and focused database/concurrency coverage**

Run: `node --test control-plane/github-app/src/provisioning-worker.test.mjs && pnpm test:db && pnpm test:concurrency`

Expected: PASS; exactly one concurrent worker claims a step and timeout-after-success does not duplicate a repository/commit/ruleset.

- [ ] **Step 5: Commit the worker and operational contract**

```bash
git add control-plane/github-app/src/provisioning-worker.mjs \
  control-plane/github-app/src/provisioning-worker.test.mjs \
  control-plane/github-app/src/provisioning-store.mjs \
  control-plane/provisioning/README.md package.json
git commit -m "feat: execute GitHub provisioning steps idempotently"
```

### Task 4: Add signed GitHub webhook ingress and governance reconciliation

**Files:**
- Create: `control-plane/github-app/src/webhook-ingress.mjs`
- Create: `control-plane/github-app/src/webhook-ingress.test.mjs`
- Create: `control-plane/github-app/src/governance.mjs`
- Create: `control-plane/github-app/src/governance.test.mjs`
- Modify: `control-plane/provisioning/README.md`
- Modify: `docs/runbooks.md`

**Interfaces:**
- Consumes: unmodified webhook bytes, `x-hub-signature-256`, `x-github-delivery`, `x-github-event`, and the runtime webhook secret.
- Produces: a `202` acknowledgement only after `record_github_webhook_delivery_v1` returns, and a reconciler result containing desired/actual governance fingerprints.

- [ ] **Step 1: Write failing webhook and governance tests**

```js
test('rejects an invalid raw-body signature before JSON parsing', async () => {
  const response = await ingress.handle({ headers: forgedHeaders, rawBody: Buffer.from('{not-json') });
  assert.equal(response.status, 401);
  assert.equal(store.recordCalls, 0);
});

test('deduplicates delivery IDs and schedules only one reconciliation', async () => {
  await ingress.handle(validRequest);
  await ingress.handle(validRequest);
  assert.equal(reconciler.enqueueCalls, 1);
});

test('reports a changed required-check ruleset as drift without weakening it', async () => {
  const result = await governance.reconcile(instance);
  assert.deepEqual(result, { kind: 'drift', code: 'github_ruleset_drift' });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `node --test control-plane/github-app/src/webhook-ingress.test.mjs control-plane/github-app/src/governance.test.mjs`

Expected: FAIL because ingress and reconciliation modules do not exist.

- [ ] **Step 3: Implement constant-time signature verification and desired-state fingerprints**

Use `createHmac('sha256', webhookSecret).update(rawBody).digest()` and `timingSafeEqual` only after validating equal buffer lengths. Parse only verified bytes. Store the body SHA-256 plus allowlisted `action`, repository external ID, and event name; discard raw bytes immediately.

Build a canonical JSON fingerprint from the intended branch, private visibility, required checks, review/CODEOWNERS settings, secret scanning, dependency protection, and immutable reusable-workflow reference. Compare the canonical desired fingerprint with GitHub's safe actual view. Enqueue reconciliation; do not directly apply a settings change from a webhook delivery.

- [ ] **Step 4: Run webhook, governance, secret-shape, and documentation checks**

Run: `node --test control-plane/github-app/src/webhook-ingress.test.mjs control-plane/github-app/src/governance.test.mjs && pnpm check:secrets && pnpm check:docs`

Expected: PASS; invalid signatures, token-shaped payload fields, duplicate deliveries, and out-of-order observations cannot alter state or leak values.

- [ ] **Step 5: Commit ingress, reconciliation, and runbook updates**

```bash
git add control-plane/github-app/src/webhook-ingress.mjs \
  control-plane/github-app/src/webhook-ingress.test.mjs \
  control-plane/github-app/src/governance.mjs \
  control-plane/github-app/src/governance.test.mjs \
  control-plane/provisioning/README.md docs/runbooks.md
git commit -m "feat: verify GitHub webhooks and reconcile governance"
```

### Task 5: Wire source gates and complete release evidence

**Files:**
- Create: `control-plane/github-app/README.md`
- Modify: `package.json`
- Modify: `docs/architecture.md`
- Modify: `docs/security-and-privacy.md`
- Modify: `docs/runbooks.md`
- Modify: `docs/local-setup.md`

**Interfaces:**
- Consumes: all private module tests, `pnpm check`, `pnpm test:db`, `pnpm test:concurrency`, and the distribution checker.
- Produces: `pnpm test:github-app` and a documented runtime configuration/verification surface that names references but no secret values.

- [ ] **Step 1: Write a failing command-registration test**

```js
test('the GitHub App suite is a source gate', async () => {
  const manifest = JSON.parse(await readFile('package.json', 'utf8'));
  assert.match(manifest.scripts['test:github-app'], /control-plane\/github-app/u);
  assert.match(manifest.scripts.check, /test:github-app/u);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test control-plane/github-app/src/source-gate.test.mjs`

Expected: FAIL because the source gate is not registered.

- [ ] **Step 3: Register and document the gate**

```json
{
  "scripts": {
    "test:github-app": "node --test control-plane/github-app/src/*.test.mjs",
    "check": "... && pnpm test:github-app && ..."
  }
}
```

Document secret-reference names, required App permissions, installation/repository scope validation, Vercel App access as a distinct prerequisite, manual drift reconciliation, signature-failure response, and the explicit N/A live-test condition.

- [ ] **Step 4: Run all implemented repository gates**

Run: `pnpm install --frozen-lockfile && pnpm check && pnpm test:db && pnpm test:concurrency && pnpm db:lint && pnpm test:a11y && pnpm test:i18n && pnpm test:component && pnpm test:e2e`

Expected: all commands PASS. Record provider live calls as `N/A — organization-owned GitHub App installation and runtime secret references are not yet configured`; record each later-owned gate using the issue number in `docs/local-setup.md`.

- [ ] **Step 5: Commit the final issue evidence**

```bash
git add control-plane/github-app/README.md control-plane/github-app/src/source-gate.test.mjs \
  package.json docs/architecture.md docs/security-and-privacy.md \
  docs/runbooks.md docs/local-setup.md
git commit -m "docs: operate GitHub App repository provisioning"
```

## Plan self-review

- Spec coverage: Tasks 1–4 cover durable state, App credentials/scope, idempotent repository lifecycle, governance, raw-body webhooks, drift reconciliation, and all requested failure modes. Task 5 wires verification and operating evidence.
- Placeholder scan: no placeholder task or deferred implementation language is used; the live App installation is an explicit external prerequisite, not an unfinished code task.
- Interface consistency: Task 1 defines durable ingestion; Task 2 provides the client; Task 3 invokes it through the existing claim/complete boundary; Task 4 creates verified ingress and reconciliation; Task 5 gates the same test files.
