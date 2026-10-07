# Platform Admin Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `apps/platform-admin` from a login + create-tenant shell into a navigable, secure, data-backed control plane for tenants, provisioning, subscriptions, releases, health, support access, operators, audit and platform settings.

**Architecture:** All data stays in the private `control_plane` schema. Every new read and mutation is a `control_plane.*_v1` SECURITY DEFINER function that begins with `control_plane.require_operator_v1(minimum_role, step_up_seconds)`, and is exposed to the browser session only through a same-named `api_v1.*` SECURITY DEFINER pass-through granted to `authenticated` (the reviewed pattern from `20260930130000_operator_api_security_definer.sql`). External infrastructure work is a queued, idempotent, audited job row with a worker-only claim/complete boundary; nothing in the browser or Next server talks to GitHub/Vercel/Resend/Stripe. The Next.js 16 app uses server components for reads, server actions for mutations, URL search params for list state, and a small set of local primitives (table, pagination, filter bar, confirm dialog, step-up dialog) built on `@wlbp/ui-foundation`.

**Tech Stack:** Next.js 16.3.4 (App Router, `proxy.ts`), React 19.2, TypeScript 6, `@supabase/ssr` request-scoped client (`@wlbp/supabase-client`), PostgreSQL 17 / Supabase CLI 2.116, pgTAP, Vitest 5, Playwright 1.63.

## Plan documents

This plan is split by subsystem so each part stays readable. Execute them in this order; task numbers are global.

| Part | File | Tasks |
| --- | --- | --- |
| A. Database contract | [`2026-10-06-platform-admin-database-contract.md`](2026-10-06-platform-admin-database-contract.md) | 1–8 |
| B. Application | [`2026-10-06-platform-admin-application.md`](2026-10-06-platform-admin-application.md) | 9–21 |
| C. Demo data and verification | [`2026-10-06-platform-admin-demo-and-verification.md`](2026-10-06-platform-admin-demo-and-verification.md) | 22–27 |

## Global Constraints

- Repository root: `/Volumes/PortableSSD/Dev/E/projects/booking-platform/booking-platform` (the outer `booking-platform/` directory is not the repo).
- Prefix every shell command with `rtk` (user instruction), e.g. `rtk pnpm test:db`.
- Preserve all existing uncommitted work. Never `git checkout`, `git stash`, `git reset`, `git clean`, or reformat files outside this plan's file list. Commit only files this plan creates or modifies, using explicit paths. Do not push or deploy.
- `control_plane` stays private: never `grant usage on schema control_plane to anon, authenticated`; never grant a `control_plane` table or function to `anon`/`authenticated`.
- Every `api_v1` operator wrapper: `language sql`, `security definer`, `set search_path to ''`, body exactly `select * from control_plane.<same_name>(<args>)` (or `select control_plane.<same_name>(<args>)` for scalar/jsonb returns), `revoke all … from public, anon`, `grant execute … to authenticated`. Worker wrappers grant only `service_role`.
- Every privileged `control_plane` function first calls `control_plane.require_operator_v1(<role>, <null | control_plane.step_up_seconds_v1()>)`. Roles: `viewer` reads; `operator` routine mutations; `admin` lifecycle, commercial, release, security changes. Step-up (`step_up_seconds_v1() = 900`) on: tenant suspend/reactivate/closure, plan save, subscription assignment/update, entitlement overrides, rollout create/start/rollback, support approval, operator add/role/disable/enable, platform flag save, audit export, job approval, instance deactivation.
- Error vocabulary is the `message` of a raised exception; the app maps it to localized copy. Reuse existing codes (`policy_denied`, `transition_not_allowed`, `idempotency_conflict`, `secret_rejected`, `plan_unknown`, `domain_taken`) and add only: `recent_authentication_required`, `not_found`, `stale_revision`, `reason_required`, `name_invalid`, `confirmation_mismatch`, `suspend_before_closure`, `job_running`, `attempts_exhausted`, `plan_exists`, `entitlement_invalid`, `ends_at_required`, `release_exists`, `release_invalid`, `no_targets`, `rollback_not_supported`, `account_not_found`, `operator_exists`, `last_admin_protected`, `self_grant_denied`, `expiry_invalid`, `hostname_invalid`, `flag_invalid`, `reference_invalid`.
- Never store, log, render, or audit a secret: provider keys, service-role keys, TOTP secrets, JWTs. `control_plane.contains_no_secret_v1` guards every jsonb/text that reaches an audit or job row.
- No tenant customer, booking, or personal data is readable from Platform Admin. Reads touch `app.tenants`, `app.brands`, `app.instances`, `app.tenant_domains`, `app.tenant_entitlements` and `control_plane.*` only.
- Every user-facing string exists in English and Arabic (`[en, ar]` tuples); no English-only copy. RTL via `dir` on `<html>` plus CSS logical properties only (no `left`/`right`, no `[dir=rtl]` overrides).
- Never display "healthy", "ready", "verified" or `0` in place of missing data: missing observations render the localized "Not observed" / "Unknown" value.
- Never fake external success. A button that queues external work says "Queue …" and the resulting state reads "Queued — waiting for the … worker" until a worker records an outcome.
- No new npm dependencies.
- Local database work targets only the isolated stack `platform-admin-20261006` (Task 1, ports `565xx`). Never run `supabase db reset`, `supabase stop`, or seeds against `white-label-booking-platform` (54321–54324, currently not running), `dashboard-completion-20261005` (553xx), or the unrelated `maslak_dashboard` project that currently owns port 54321.
- Credentials live only in `.artifacts/platform-admin/credentials.json` (git-ignored via `.artifacts/`), mode `0600`.

---

## 1. Feature inventory (as found on 2026-10-06)

### Environment fact that changes the plan

All three running dev servers (3000/3001/3002) load `.env.local` pointing at `http://127.0.0.1:54321`, but **port 54321 is served by the unrelated Docker project `maslak_dashboard`**; this repository's `white-label-booking-platform` stack is stopped and the `dashboard-completion-20261005` stack runs on 553xx. Platform Admin therefore currently talks to the wrong database. Task 1 creates an isolated `platform-admin-20261006` stack, and Task 26 restarts only the Platform Admin dev server with that stack's environment injected (process env wins over `.env.local` in Next.js), leaving `.env.local` files untouched.

### Working

| Area | Evidence |
| --- | --- |
| Operator allow-list with viewer/operator/admin/break_glass, expiring break-glass, AAL2 on every check | `control_plane.operators`, `control_plane.is_operator_v1` (`20260922120000`) |
| Plans, subscriptions, plan→entitlement projection | `control_plane.plans`, `subscriptions`, `assign_plan_v1` |
| Desired vs observed infrastructure, drift | `instance_infrastructure`, `record_infrastructure_state_v1`, `get_fleet_registry_v1` |
| Jobs with two-person approval for destructive kinds | `control_plane.jobs`, `enqueue_job_v1`, `approve_job_v1` |
| Append-only operator audit | `control_plane.audit_events` + `enforce_append_only` |
| Platform flags / incident banner | `platform_flags`, `api_v1.get_platform_notice_v1` |
| Scoped, expiring, two-person support grants (read-only by construction) | `20260923120000_support_access_grants.sql` |
| Resumable provisioning runs, steps, timeline, retry, activation gate, rollback-by-deactivation, reconciler | `20260924120000_resumable_instance_provisioning.sql`, `20260930160000_local_provisioning_steps.sql` |
| Operator-facing api_v1: `create_tenant_v1`, `request_provisioning_v1` | `20260930120000`, `20260930130000` |
| Worker api_v1: claim/complete step, GitHub/Vercel identity | `20260930140000`, `control-plane/github-app`, `control-plane/vercel` |
| Release manifest validation (files) | `control-plane/contracts/release-contracts.mjs`, `platform-contract.json` |
| Platform Admin: locale routing, CSP proxy, password + TOTP login, MFA enrollment, create-tenant form | `apps/platform-admin/app/**` |

### Incomplete

| Area | Gap |
| --- | --- |
| Platform Admin UI | Single page with marketing hero, hard-coded `—`/`0`/"Ready", stale "later M1" copy, no navigation, raw English error strings |
| api_v1 operator reads | No fleet, tenant, job, run, plan, support, operator, or audit read is reachable from the app (`get_fleet_registry_v1`, `get_provisioning_run_v1`, `list_support_grants_v1` are `service_role`-only and unexposed) |
| Recent authentication | Only `aal = aal2` is checked; no age check on high-impact operator actions |
| Audit | No outcome/reason/target columns; failures are never recorded; `create_tenant_v1` writes no audit row |
| Idempotency | `create_tenant_v1` and `enqueue_job_v1` have none; double submit creates duplicates |
| Local provisioning steps | `execute_local_provisioning_steps_v1` parks `health_check`/`generate_agent_pack` with waiting reason `worker_not_implemented`, which violates the `provisioning_steps.waiting_reason` check constraint (fixed in Task 4) |
| Seed | No operator rows; no control-plane demo data |

### Missing

Releases/rollouts tables and workflows; health observations; integrations registry; job cancel/retry/events and a worker boundary for jobs; operator management with last-admin protection; tenant update/suspend/reactivate/closure; domain add/verification requests; plan create/edit; subscription lifecycle edits; entitlement overrides; audit search/export; overview aggregates; alerts; platform-flag editing; isolated local stack and demo seed for Platform Admin; Platform Admin browser tests.

### Dependent on external services (boundary built, execution unverified)

| Capability | Needs | Local behavior |
| --- | --- | --- |
| Provisioning steps 3–12 | GitHub App (`GITHUB_APP_*`), Vercel (`VERCEL_API_TOKEN`, `VERCEL_TEAM_ID`) workers deployed | Runs advance through local steps 1–2, then wait; UI shows "Waiting for the GitHub worker" |
| Domain verification, certificates | Vercel worker | `verify_domain` jobs stay queued; certificate status "Not reported" |
| Release deployment (`publish_release`) | Release worker using Vercel | Rollout targets stay "Queued — waiting for the release worker" |
| Integration connection checks | Integration worker with provider credentials | `check_integration` job stays queued; status "Configured: unknown" |
| Health observations | Health worker | Only seeded synthetic observations; everything else "Not observed" |
| SaaS billing provider | None exists (Stripe here is tenant payments, ADR-0003) | Subscriptions are labelled "Administrative record — no payment provider connected" |
| Break-glass paging | No paging integration | Active break-glass is shown as an overview alert only |

---

## 2. Route map (feature → route)

| Feature | Route | Task |
| --- | --- | --- |
| Overview | `/[locale]` | 13 |
| Tenants directory, registration | `/[locale]/tenants`, `/[locale]/tenants/new` | 14 |
| Tenant detail (identity, lifecycle, plan, entitlements, domains, instances, provisioning, support, audit) | `/[locale]/tenants/[tenantId]` | 14 |
| Instances (desired vs observed, drift) | `/[locale]/instances`, `/[locale]/instances/[instanceId]` | 15 |
| Domains | `/[locale]/domains` | 15 |
| Provisioning runs, run detail | `/[locale]/provisioning`, `/[locale]/provisioning/[runId]`, `/[locale]/provisioning/new` | 15 |
| Jobs queue, job detail | `/[locale]/jobs`, `/[locale]/jobs/[jobId]` | 15 |
| Plans | `/[locale]/plans` | 16 |
| Subscriptions | `/[locale]/subscriptions` | 16 |
| Releases, release detail | `/[locale]/releases`, `/[locale]/releases/[releaseId]` | 17 |
| Rollouts, rollout detail | `/[locale]/rollouts`, `/[locale]/rollouts/[rolloutId]` | 17 |
| Health and alerts | `/[locale]/health` | 18 |
| Support access | `/[locale]/support` | 18 |
| Operators | `/[locale]/operators` | 19 |
| Own account security (MFA, step-up, recovery guidance) | `/[locale]/account` | 19 |
| Audit (+ CSV export as a step-up server action) | `/[locale]/audit` | 20 |
| Platform settings, integrations | `/[locale]/settings` | 21 |
| Sign in / MFA enrollment | `/[locale]/login`, `/[locale]/mfa-enroll` | 12 |

## 3. File structure

### Database (Part A)

| File | Responsibility |
| --- | --- |
| `.artifacts/platform-admin/isolated/supabase/**` (generated, ignored) | Isolated stack copy |
| `scripts/platform-admin-local.mjs` | Create/start/replay/seed/serve the isolated stack; never touches other projects |
| `supabase/migrations/20261006120000_platform_admin_foundation.sql` | Audit columns, step-up, `require_operator_v1`, idempotency ledger, failure recording, operator context, audit list/export |
| `supabase/migrations/20261006130000_platform_admin_tenants.sql` | Tenant directory/detail/update/status/closure, idempotent tenant creation |
| `supabase/migrations/20261006140000_platform_admin_operations.sql` | Jobs (events, cancel, retry, approve, worker claim/complete), provisioning reads/actions, instances, domains, local-step constraint fix |
| `supabase/migrations/20261006150000_platform_admin_commercial.sql` | Plans, subscriptions, entitlement overrides |
| `supabase/migrations/20261006160000_platform_admin_releases.sql` | Releases, rollouts, targets, prerequisites, worker reporting |
| `supabase/migrations/20261006170000_platform_admin_security_health.sql` | Operators, support wrappers, health observations, integrations, platform flags, alerts, overview |
| `supabase/tests/database/platform_admin_*_test.sql` (6 files) | pgTAP per migration |
| `supabase/tests/database/tenant_schema_contract_test.sql` (modify) | Generalize the reviewed-definer rule |
| `packages/supabase-client/src/database.types.ts` (regenerate) | api_v1 types |

### Application (Part B) — all under `apps/platform-admin/`

| File | Responsibility |
| --- | --- |
| `app/globals.css` (rewrite) | Tokens, fonts, shell, tables, forms, dialogs, responsive, RTL-safe |
| `public/fonts/*` (copied from dashboard) | Bundled Inter / Noto Arabic |
| `next.config.ts` (modify) | `transpilePackages` adds `@wlbp/auth`, `@wlbp/supabase-client` |
| `app/_lib/copy.ts` (rewrite) | `say()`, `Copy` tuple type, shared copy (shell, states, errors, statuses) |
| `app/_lib/copy.test.ts` | Parity: every tuple has non-empty EN and Arabic-script AR |
| `app/_lib/operator-api.ts` | Server-only RPC caller, error-code mapping |
| `app/_lib/operator-api.test.ts` | Error mapping tests |
| `app/_lib/operator-page.ts` | `requireOperator(locale)` guard for pages |
| `app/_lib/operator-action.ts` | `runOperatorAction()` for server actions, failure audit |
| `app/_lib/list-params.ts` (+ `.test.ts`) | Parse/serialize list URL state |
| `app/_lib/navigation.ts` (+ `.test.ts`) | Grouped nav registry |
| `app/_lib/admin-shell.tsx` | Sidebar, header, breadcrumbs, title, actions |
| `app/_lib/mobile-nav.tsx` | Disclosure nav < 52rem |
| `app/_lib/locale-switch.tsx` | EN/AR switch preserving path + safe query |
| `app/_lib/ui/data-table.tsx` | Accessible table with sortable headers |
| `app/_lib/ui/pagination.tsx` | Page links |
| `app/_lib/ui/filter-bar.tsx` | GET filter form |
| `app/_lib/ui/states.tsx` | Empty, Unavailable, PermissionDenied, Unknown value |
| `app/_lib/ui/status-badge.tsx` | Status → tone + localized label |
| `app/_lib/ui/facts.tsx` | `<dl>` facts list |
| `app/_lib/ui/time.tsx` | Localized time + staleness |
| `app/_lib/ui/action-dialog.tsx` | Client: confirm dialog with reason, typed confirmation, step-up |
| `app/_lib/ui/step-up.ts` | Client: TOTP re-verification |
| `app/[locale]/(console)/layout.tsx` | Guard + shell for all console routes |
| `app/[locale]/(console)/loading.tsx` | Localized loading state for every console route |
| `app/[locale]/(console)/**/page.tsx`, `actions.ts`, `copy.ts` | Feature routes (Tasks 13–21) |
| `app/[locale]/login/page.tsx`, `mfa-enroll/page.tsx` (modify) | Localized errors, styling |

### Demo and verification (Part C)

| File | Responsibility |
| --- | --- |
| `supabase/demo/platform-admin-demo.sql` | Synthetic, repeatable control-plane demo data |
| `scripts/platform-admin-local.mjs` (seed/serve subcommands) | Operator accounts, TOTP enrollment, credentials file, dev server |
| `playwright.config.ts` (modify) | `platform-admin` project gated by `PLATFORM_ADMIN_E2E=1` |
| `tests/e2e/platform-admin-fixtures.ts` | Sign-in with TOTP, SQL helper |
| `tests/e2e/platform-admin.spec.ts` | Critical journeys, a11y, RTL, mobile |
| `docs/platform-admin-verification.md` | Verification evidence |
| `docs/superpowers/plans/2026-10-06-platform-admin-checkpoint.md` | Resume checkpoint |
| `docs/local-setup.md`, `docs/runbooks.md`, `docs/architecture.md` (modify) | Knowledge pack updates |

## 4. Shared interfaces (exact names used across parts)

SQL (Part A produces, Part B consumes through `api_v1`):

```text
control_plane.step_up_seconds_v1() -> integer                       -- 900
control_plane.require_operator_v1(p_minimum text, p_recent_seconds integer default null) -> uuid
control_plane.write_audit_v1(p_operator uuid, p_action text, p_tenant_id uuid default null,
  p_instance_id uuid default null, p_target_kind text default null, p_target_id text default null,
  p_reason text default null, p_detail jsonb default '{}', p_outcome text default 'succeeded') -> uuid
control_plane.replay_request_v1(p_key text, p_action text) -> jsonb   -- null when new
control_plane.remember_request_v1(p_key text, p_action text, p_result jsonb) -> void
control_plane.enqueue_operator_job_v1(p_operator uuid, p_kind text, p_tenant_id uuid,
  p_instance_id uuid, p_parameters jsonb, p_idempotency_key text, p_reason text default null) -> uuid
```

api_v1 functions (all return `setof record` unless noted `jsonb`):

| Function | Role | Step-up |
| --- | --- | --- |
| `get_operator_context_v1()` | viewer | |
| `record_operator_failure_v1(p_action, p_error_code, p_tenant_id, p_target_kind, p_target_id)` → void | listed operator | |
| `list_audit_events_v1(p_search, p_action, p_tenant_id, p_operator_id, p_outcome, p_from, p_to, p_limit, p_offset)` | viewer | |
| `export_audit_events_v1(p_search, p_action, p_tenant_id, p_operator_id, p_outcome, p_from, p_to)` | admin | yes |
| `get_overview_v1()` → jsonb | viewer | |
| `list_tenants_v1(p_search, p_status, p_plan_key, p_sort, p_limit, p_offset)` | viewer | |
| `get_tenant_v1(p_tenant_id)` → jsonb | viewer | |
| `create_tenant_v2(p_name, p_brand_key, p_idempotency_key)` | admin | |
| `update_tenant_v1(p_tenant_id, p_name, p_expected_updated_at)` | operator | |
| `set_tenant_status_v1(p_tenant_id, p_status, p_reason, p_expected_status)` | admin | yes |
| `request_tenant_closure_v1(p_tenant_id, p_reason, p_confirmation, p_idempotency_key)` | admin | yes |
| `list_jobs_v1(p_status, p_kind, p_tenant_id, p_limit, p_offset)` | viewer | |
| `get_job_v1(p_job_id)` → jsonb | viewer | |
| `cancel_job_v1(p_job_id, p_reason)` / `retry_job_v1(p_job_id, p_reason)` | operator | |
| `approve_operator_job_v1(p_job_id)` | admin | yes |
| `claim_job_v1(p_kinds, p_lock_seconds)` / `complete_job_v1(p_job_id, p_outcome, p_error_code)` | worker (`service_role`) | |
| `list_provisioning_runs_v1(p_state, p_tenant_id, p_search, p_limit, p_offset)` | viewer | |
| `get_provisioning_run_detail_v1(p_run_id)` → jsonb | viewer | |
| `retry_provisioning_run_v1(p_run_id)` | operator | |
| `activate_provisioned_instance_v1(p_run_id)` | operator | |
| `deactivate_provisioned_instance_v1(p_run_id, p_reason)` | admin | yes |
| `list_instances_v1(p_search, p_state, p_ring, p_drift, p_limit, p_offset)` | viewer | |
| `get_instance_v1(p_instance_id)` → jsonb | viewer | |
| `list_domains_v1(p_search, p_status, p_limit, p_offset)` | viewer | |
| `add_tenant_domain_v1(p_tenant_id, p_instance_id, p_hostname, p_application, p_idempotency_key)` | operator | |
| `request_domain_verification_v1(p_domain_id)` | operator | |
| `list_plans_v1()` | viewer | |
| `save_plan_v1(p_key, p_name, p_entitlements, p_active, p_create)` | admin | yes |
| `list_subscriptions_v1(p_state, p_plan_key, p_search, p_limit, p_offset)` | viewer | |
| `assign_subscription_v1(p_tenant_id, p_plan_key, p_rollout_ring, p_reason)` | admin | yes |
| `update_subscription_v1(p_tenant_id, p_state, p_ends_at, p_rollout_ring, p_reason, p_expected_updated_at)` | admin | yes |
| `set_entitlement_override_v1(p_tenant_id, p_feature_key, p_granted, p_expires_at, p_reason)` | admin | yes |
| `clear_entitlement_override_v1(p_tenant_id, p_feature_key, p_reason)` | admin | yes |
| `register_release_v1(p_version, p_channel, p_git_commit, p_config_schema_version, p_backend_min, p_backend_max, p_migration_ids, p_feature_notes, p_upgrade_notes, p_reversible, p_idempotency_key)` | admin | |
| `set_release_status_v1(p_release_id, p_status, p_reason)` | admin | |
| `list_releases_v1(p_channel, p_status, p_limit, p_offset)` | viewer | |
| `get_release_v1(p_release_id)` → jsonb | viewer | |
| `create_rollout_v1(p_release_id, p_rings, p_instance_ids, p_reason, p_idempotency_key)` | admin | yes |
| `start_rollout_v1(p_rollout_id)` | admin | yes |
| `pause_rollout_v1(p_rollout_id, p_reason)` | operator | |
| `cancel_rollout_v1(p_rollout_id, p_reason)` | admin | |
| `retry_rollout_targets_v1(p_rollout_id)` | operator | |
| `rollback_rollout_v1(p_rollout_id, p_reason)` | admin | yes |
| `list_rollouts_v1(p_status, p_release_id, p_limit, p_offset)` | viewer | |
| `get_rollout_v1(p_rollout_id)` → jsonb | viewer | |
| `report_rollout_target_v1(p_job_id, p_outcome, p_error_code, p_observed_release)` | worker | |
| `list_operators_v1()` | viewer | |
| `add_operator_v1(p_email, p_role, p_expires_at, p_reason)` | admin | yes |
| `set_operator_role_v1(p_operator_id, p_role, p_expires_at, p_reason)` | admin | yes |
| `disable_operator_v1(p_operator_id, p_reason)` / `enable_operator_v1(p_operator_id, p_reason)` | admin | yes |
| `list_support_grants_v2(p_status, p_tenant_id, p_limit, p_offset)` | viewer | |
| `request_support_grant_v1(p_tenant_id, p_reason, p_ticket_reference, p_location_id, p_minutes)` | operator | |
| `approve_support_access_v1(p_grant_id, p_minutes)` | admin | yes |
| `revoke_support_grant_v1(p_grant_id, p_reason)` | operator | |
| `list_health_v1(p_status, p_subject_kind, p_limit, p_offset)` | viewer | |
| `list_alerts_v1()` | viewer | |
| `record_health_observation_v1(...)` | worker | |
| `list_integrations_v1()` | viewer | |
| `save_integration_references_v1(p_provider, p_secret_references)` | admin | |
| `request_integration_check_v1(p_provider)` | operator | |
| `record_integration_status_v1(...)` | worker | |
| `list_platform_flags_v1()` | viewer | |
| `save_platform_flag_v1(p_key, p_kind, p_enabled, p_message_en, p_message_ar, p_starts_at, p_ends_at, p_reason)` | admin | yes |

TypeScript (Part B, `apps/platform-admin/app/_lib/`):

```ts
// operator-api.ts
export type OperatorErrorCode = /* union of the SQL error vocabulary */ | "unavailable";
export type OperatorResult<T> = { ok: true; data: T } | { ok: false; code: OperatorErrorCode };
export async function callOperator<T>(fn: OperatorFunction, args?: Record<string, unknown>): Promise<OperatorResult<T>>;
// operator-page.ts
export type OperatorContext = { operatorId: string; email: string; role: OperatorRole; expiresAt: string | null; stepUpSeconds: number };
export async function requireOperator(locale: Locale): Promise<OperatorContext>; // redirects or throws a denied render
// operator-action.ts
export type ActionResult = { kind: "idle" } | { kind: "success"; code: string; href?: string } | { kind: "error"; code: OperatorErrorCode } | { kind: "step-up" };
export async function runOperatorAction<T>(input: { action: string; fn: OperatorFunction; args: Record<string, unknown>; tenantId?: string | null; targetKind?: string; targetId?: string; revalidate: string[] }): Promise<{ result: ActionResult; data?: T }>;
// list-params.ts
export type ListParams = { q: string; page: number; sort: string; filters: Record<string, string> };
export function parseListParams(raw: Record<string, string | string[] | undefined>, spec: ListSpec): ListParams;
export function listHref(path: string, params: ListParams, overrides?: Partial<Omit<ListParams, "filters">> & { filters?: Record<string, string> }): string;
// copy.ts
export type Copy = readonly [en: string, ar: string];
export function say(locale: Locale, copy: Copy): string;
```

## 5. Verification matrix (Part C, Task 25)

| Requirement | Gate |
| --- | --- |
| Type, lint, build | `rtk pnpm --filter @wlbp/platform-admin typecheck`, `rtk pnpm lint`, `rtk pnpm --filter @wlbp/platform-admin build` |
| Unit | `rtk pnpm --filter @wlbp/platform-admin test:unit` |
| DB authorization, isolation, MFA/step-up, validation, idempotency, failure paths | `WLBP_SUPABASE_WORKDIR=… rtk pnpm test:db` (all 39 files) |
| DB lint, types in sync | `rtk pnpm db:lint`, `rtk pnpm check:db-types` with the isolated workdir |
| Unauthorized direct API calls fail | `tests/e2e/platform-admin.spec.ts` "direct api" test (anon, tenant member, aal1 operator) |
| Browser journeys, EN/AR, RTL, mobile, keyboard, dialogs, axe | `PLATFORM_ADMIN_E2E=1 rtk pnpm exec playwright test --project=platform-admin` |
| No secrets in bundles | `rtk pnpm check:bundles`, `rtk pnpm check:secrets`, grep of `.next` output (Task 25) |
| Boundaries, distribution | `rtk pnpm check:boundaries`, `rtk pnpm check:distribution` |
| Docs | `rtk pnpm check:docs` |
| Native preview | T3 preview tools on the running app (Task 26) |

List state: every list keeps search, filters and page in the URL. Column sorting is offered where the database exposes a sort (the tenant directory); the other lists use one fixed, documented order (most recent or most urgent first), so their URLs stay shareable without a sort parameter.

Gates that do not exist are reported as `N/A — not yet implemented, owned by issue #N` per `AGENTS.md`. Human screen-reader acceptance is reported as **not performed** unless the user supplies it.

## 6. Definition of done

- Every route in §2 renders persisted data from the isolated stack, with loading/empty/error/denied states.
- No placeholder overview content remains (`grep -R "later M1\|healthReady\|systemReady" apps/platform-admin` is empty).
- Every visible action performs its documented behavior or is visibly labelled as queued/unavailable with the missing configuration named.
- All gates in §5 pass or are honestly reported.
- Platform Admin dev server left running against `platform-admin-20261006`; URL, login instructions, route checklist, unverified dependencies, and checkpoint delivered.
