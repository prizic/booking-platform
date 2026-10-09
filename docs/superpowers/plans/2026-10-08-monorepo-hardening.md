# Booking Platform Monorepo Cleanup and Hardening Implementation Plan

> **Execution update:** Implementation, combined review, and the local verification campaign are complete. The campaign passed 1,047 source unit tests, 49 database files (2,291 assertions), 48 concurrency checks, all 17 initial build tasks, final affected app rebuilds, and the critical connected browser journeys. The dependency audit still fails on one high tooling advisory for which the audit reports no patched version; full release readiness is not established. See [the verification ledger](../../monorepo-hardening-verification.md) for cumulative results, targeted repairs, and limits. Later delegated work used the requested OpenCode `opencode/mimo-v2.6-flash-free`; the last task hit a provider rate limit without edits, so the coordinator completed the final hydration repair.

> **For agentic workers:** Use the executing-plans skill with native T3 Code delegation to OpenCode **Space Bunny**, effort **high**. The user requires all implementation to finish before combined review and one verification campaign. Author regression tests during implementation; execute them during that campaign. Repair failures with targeted reruns.

**Goal:** Clean and enhance the entire Booking Platform monorepo, complete demonstrated missing supported features and CRUD, preserve existing behavior, and verify connected customer, tenant, and operator journeys.

**Architecture:** Preserve database-owned booking, capacity, pricing, authorization, and idempotency. Three independent implementation owners cover applications, shared runtime/integrations, and database/delivery. Reuse existing modules, contracts, and test suites.

**Tech Stack:** Node >=22.13.0 <23, pnpm 11.25.0, Next.js 16.3.8, React, TypeScript, Supabase/PostgreSQL, Vitest, node:test, Deno, pgTAP, Playwright.

## Global constraints

- **Booking Platform only:** repository `prizic/booking-platform`, checkout `/Volumes/PortableSSD/Dev/E/projects/booking-platform/booking-platform`. Maslak repositories, databases, tools, credentials, and deployments are excluded.
- Execution authorized by the user's subsequent instruction: "execute the goal". Use this plan for implementation, combined review, and final verification within the Booking Platform boundary.
- Preserve existing shared UI/forms, Arabic default, PWA, branded email, optional WhatsApp, custom roles, and all supported features.
- Preserve tenant isolation, live authorization, immutable booking snapshots, last-administrator protection, atomic mutations, audit history, revisions, idempotency, and N/N-1 compatibility.
- Preserve English/Arabic parity, RTL, mobile layouts, keyboard access, labels, focus, and recovery states.
- Complete missing features only when required by supported product behavior or Accepted ADRs. Do not add speculative roadmap features.
- CRUD includes safe archive/retire/cancel transitions where required. Do not add hard deletion to audit records or historical booking snapshots.
- Delete only proven unnecessary files. Retain migrations, required generated code, fixtures, visual baselines, assets, credentials, and retained local data.
- Use the smallest complete change. No framework migration, dependency churn, unrelated redesign, or speculative abstraction.
- All implementation finishes before combined review and testing. One campaign contains distinct gates; failed checks receive targeted repairs and reruns.
- No production mutation, external provider execution, push, merge to main, or deployment is included.
- Never claim every conceivable edge case, provider delivery, human acceptance, or performance improvement without evidence.

## Current source and history

The latest completed sync used `git fetch --all --prune` and `git merge --ff-only origin/main`. Both HEAD and origin/main were `5dddd702419931a2188d9f995f86490454cb7f41`, with divergence `0 0`. Working branch: `chore/monorepo-hardening-20261008`. Preserve existing uncommitted work during future synchronization.

All 14 threads exposed by current T3 project `e7b65438-aa7c-41df-a0f0-0478c3d775a1` were inventoried, including subagents and settled threads. Original messages and subsequent worker activity were recovered through final pages and long-text offsets. The QR thread was unrelated; no relevant message content remained unread in that inventory. Access was limited to this T3 project.

| Source thread | Reconciled evidence |
| --- | --- |
| `7be7e833-354f-416d-bb55-050d4a8102b0` — Dashboard | Historical completion covers access/MFA, catalog, staff, scheduling, bookings, privacy, branding, and realtime. Its earlier Platform Admin placeholder diagnosis is superseded. |
| `a161f61c-393b-4923-b16e-5181135f284b` — Platform Admin and six children | Implemented tenants, commercial operations, provisioning, releases, support, operators, health, and audit; historical local checks passed; PR #123 is now merged. |
| `cab2a53e-f0a0-4f89-a9e2-0aba085be4fa` — diagnosis/planning | Port/hydration diagnosis and the original Dashboard plan are background. Earlier SQL/type failures need current evidence before being treated as unresolved. |
| Current GitHub source | Newer UI/forms, PWA, notification, and custom-role changes postdate old test reports. Current main includes role-editor actions; confirm actual missing behavior before adding it. |
| Three interrupted workers | Applications/runtime left no source edits. Database/tooling left unfinished changes below. None completed the assignment; earlier partial checks do not replace final verification. |

Recorded writes were inside Booking Platform. No Maslak changes were identified to revert. Prior misleading task titles must not be reused.

### Existing unfinished work

The database/delivery owner inherits and completes or removes unsupported additions in:

- `scripts/bundle-edge-shared.mjs`, `scripts/bundle-edge-shared.test.mjs`, and `package.json`.
- `scripts/check_links.py`, `scripts/verify-dashboard-completion.mjs`, and `docs/superpowers/plans/2026-10-05-dashboard-completion.md`.
- `supabase/migrations/20261008130000_custom_roles_and_notification_hardening.sql`.
- `supabase/tests/database/custom_roles_notification_hardening_test.sql`.

Prior CI run `37684106307` failed generated Edge email-source drift. Older PR CI failed workstation-absolute documentation links. The tooling worker reported six scoped bundler tests and docs checks. Its SQL and fixtures remain unverified. Keep source-confirmed, worker-reported, and campaign-verified results separate.

## Skills and instructions

Read each selected skill once per worker. Use `/Volumes/PortableSSD/AI-Hub/catalog/skill-categories.md` for discovery.

| Skill | Responsibility |
| --- | --- |
| `writing-plans` | Concrete ownership, conditional repair tasks, acceptance cases, and evidence requirements. |
| `ai-hub` | Relevant capability discovery and correct project/connection identity. |
| `ahmed-frontend` | Interaction, validation, mutation, persistence, refresh, localization, and accessibility across all three apps. |
| `ahmed-backend` | Domain rules, contracts, jobs, provider failure/retry, compatibility, and trusted authorization. |
| `ahmed-supabase` | Migrations, RLS/grants, RPCs, generated types, local identity, and isolation. |
| `caveman` | Concise updates and handoffs without dropping evidence. |
| `ponytail` | Smallest complete fix, existing helpers, caller tracing, meaningful regression tests, no speculative code. |

Hub skill paths are `/Volumes/PortableSSD/AI-Hub/skills/<name>/SKILL.md`. Ponytail is at `/Users/ahmed/.codex/plugins/cache/ponytail/ponytail/5.0.0/skills/ponytail/SKILL.md`.

Read root/applicable `AGENTS.md`, `docs/README.md`, `docs/glossary.md`, `docs/engineering-rules.md`, and the complete relevant product/security/architecture/design/distribution documents. Accepted ADRs 0018 and 0019 govern WhatsApp and custom roles. Read Ahmed's shared workflow once; add diagnostic, Next.js, React, or PostgreSQL references only for an actual question.

The user's ordering overrides skill defaults for per-task test runs, reviews, frequent commits, and execution-choice questions. Use native T3 preview for manual browser inspection. Skill availability does not establish a database connection.

## Delegation and file ownership

At execution time, discover available providers/models with `orchestrator_capabilities`. The initial implementation target was:

```json
{
  "providerInstanceId": "opencode",
  "model": "opencode-go/space-bunny",
  "options": { "variant": "high", "agent": "build" }
}
```

Use native `delegate_task`, role `implementation`, mode `async`, with a distinct stable `clientRequestId` for each assignment. Store every returned `taskId`. Do not use top-level threads as subagents or silently substitute a model.

Current capacity is four active agents including the coordinator: launch three independent implementers. If capacity changes, split additional work only along disjoint files and update ownership before dispatch. Do not create duplicate audits.

| Owner | Exclusive write ownership | Work |
| --- | --- | --- |
| A: Applications | `apps/client/**`, `apps/dashboard/**`, `apps/platform-admin/**`, `tests/e2e/**` except SQL fixtures, `playwright.config.ts` | Tasks 1–3 |
| B: Shared runtime/integrations | `packages/**` except generated database types; `control-plane/**`; `supabase/functions/**` except generated targets enumerated by the bundler | Task 4 |
| C: Database/delivery | `supabase/**` except non-generated functions; generated Edge targets; `packages/supabase-client/src/database.types.ts`; `scripts/**`; `.github/**`; root tooling/config/lockfile; tests outside A including SQL fixtures; docs except this plan/final report | Tasks 5–7 |
| Coordinator | This plan, `docs/monorepo-hardening-verification.md`, integration/generation after owners finish, review and campaign | Tasks 0, 8–9 |

Workers share a checkout and are not alone. Never overwrite or revert another owner's edits. Report cross-owner defects with exact producer/consumer files, contract, failing input, and expected result. Assign dependent repairs after the original owners finish.

### Shared brief included in every delegation

Send this brief plus the owner's complete task sections and ownership. Child tasks do not inherit parent history.

```text
Work only in /Volumes/PortableSSD/Dev/E/projects/booking-platform/booking-platform.
Repository: https://github.com/prizic/booking-platform.git
Branch: chore/monorepo-hardening-20261008
Read docs/superpowers/plans/2026-10-08-monorepo-hardening.md.
Confirm current HEAD and existing edits. Preserve newer source and other owners' work.

Read applicable AGENTS.md, required knowledge-pack documents, your Ahmed domain
skill and shared workflow. Apply Ponytail's smallest complete change. Maslak
and every unrelated project are out of scope.

Implement your assigned tasks within exclusive ownership. Confirm supported
behavior from current code and Accepted ADRs before adding missing CRUD.
Trace callers, trusted rules, persisted state, and dependent UI refresh.
For each nontrivial fix, author a meaningful regression case and record the
evidence of the defect. Do not claim an unrun test failed or passed.

Do not run tests, builds, lint/typecheck, browser suites, or databases during
implementation. Source reading, searching, static inspection, and formatting
only your changed files are allowed. The coordinator runs one campaign after
all implementation finishes.

Do not commit, push, deploy, reset retained data, touch production, expose
secrets, start nested agents, or edit another owner's files. Finish without
routine approval requests. Report cross-owner dependencies precisely.

Return inspected surfaces, defects/fixes, changed files, regression cases,
deletion evidence, pending performance measurement, exact test commands,
cross-owner dependencies, and remaining limitations.
```

Save concise worker handoffs under `.artifacts/monorepo-hardening/`: `applications-implementation.md`, `runtime-implementation.md`, `data_tooling-implementation.md`.

Let workers finish without interruption. Use automatic completion delivery rather than repeated polling. Every follow-up repair/review round gets a new native delegated task with prior findings and unresolved objections.

## Implementation tasks

This is an existing-system audit with conditional repairs. Do not invent code or APIs for an unproven failure. Refine each confirmed defect into its concrete owner, implementation boundary, regression input, and expected persisted result before editing.

### Task 0: Establish the execution baseline

**Owner:** Coordinator. **Inputs:** Current source/history. **Output:** One stable baseline and environment identity for all workers.

- [x] Confirm checkout/remote/branch/diff and preserve unfinished changes.
- [x] Fetch GitHub once at execution entry; integrate newer main safely if needed before dispatch.
- [x] Inspect relevant issue acceptance criteria and blockers. Issues #40, #50, and #51 contain broader blocked roadmap scope; this execution maintains already merged behavior under the explicit user plan and does not start or claim those entire issues. Existing realtime behavior is assessed against #102's acceptance cases.
- [x] Confirm interrupted original tasks have no pending child runs.
- [x] Identify retained local stacks and synthetic credential storage without printing secrets.
- [x] Dispatch all three full briefs with current source revision and exclusive ownership.

Execution started on 2026-10-08 at source `5dddd702419931a2188d9f995f86490454cb7f41`. Native T3 task client request IDs are `booking-platform-hardening-20261008-applications-execution-v2`, `booking-platform-hardening-20261008-runtime-execution-v2`, and `booking-platform-hardening-20261008-data_tooling-execution-v2`. All use OpenCode `opencode-go/space-bunny`, reasoning `high`. Combined review completed; verification results and targeted repairs are recorded in the live ledger.

### Task 1: Customer booking and management

**Owner:** A.

**Files:** `apps/client/app/_lib/booking-data-source.ts`, `availability-data-source.ts`, `management-data-source.ts` and their tests; `apps/client/app/[locale]/book/booking-flow.tsx`; `apps/client/app/[locale]/manage/manage-booking.tsx`; `apps/client/app/api/manage/route.ts` and `route.test.ts`; `apps/client/app/_lib/service-worker.test.ts`; `tests/e2e/booking.spec.ts`.

**Interfaces:** Existing api_v1 availability/hold/booking/payment/management contracts. Database remains the booking/price owner.

- [x] Trace published catalog, availability, hold/request, confirmation/payment, and manage/cancel/reschedule through persisted results.
- [x] Cover malformed identifiers/contact/intake, timezone boundaries, full slots, expired holds, repeated submit, lost response/retry, and backend unavailability.
- [x] Cover expired/wrong-intent management token or OTP. Failed rescheduling must preserve the original booking.
- [x] Confirm redirects cannot fabricate payment success and retry cannot create a duplicate booking/payment.
- [x] Preserve unticked optional WhatsApp consent, international phone handling, email fallback, and offline/PWA privacy boundaries.
- [x] Repair supported gaps and add behavioral regressions; successful mutations must refresh dependent screens.

**Acceptance:** One valid submit produces one durable booking. Denied/invalid requests do not mutate protected state; recoverable failures preserve customer reservations.

### Task 2: Tenant Dashboard and supported CRUD

**Owner:** A.

**Files:** `apps/dashboard/app/_lib/dashboard-data-source.ts`, `dashboard-access.ts`, `workspace-live-events.ts` and their tests; `apps/dashboard/app/[locale]/roles/actions.ts`, `role-editor.tsx`, `page.tsx`; `apps/dashboard/app/[locale]/team-resources/staff-access-actions.ts`; `tests/e2e/dashboard-completion.spec.ts`.

**Interfaces:** Existing catalog/staff/custom-role/booking RPCs, shared forms, live permissions, and query/realtime refresh.

- [x] Inventory supported create/read/update/archive/publish operations for services, locations, staff/resources, schedules, roles, and settings.
- [x] Confirm edit/duplicate/archive against current role-editor code; do not repeat the stale missing-editor assumption.
- [x] Cover invalid forms, duplicate submit, stale revisions, in-use archival, retry, and persisted state after reload.
- [x] Cover tenant mismatch, revoked membership, assigned-location restrictions, role dominance, recent MFA, and last usable administrator protection.
- [x] Trace request decisions, booking lifecycle, refunds, customers/privacy, reports, communications, and settings.
- [x] Check detail/list/calendar/count/permission refresh after mutations and realtime events.
- [x] Complete supported gaps with focused regression cases and equivalent English/Arabic/accessibility behavior.

**Acceptance:** Allowed changes persist once and appear after reload. Forbidden/stale actions leave state unchanged with actionable errors.

### Task 3: Platform Admin operations

**Owner:** A.

**Files:** `apps/platform-admin/app/_lib/operator-api.ts`, `operator-action.ts`, `operator-page.ts`, `read-pages.ts`, `read-pages.test.ts`, `schemas/schemas.test.ts`, existing `actions/` modules; `tests/e2e/platform-admin.spec.ts`.

**Interfaces:** Private operator RPCs; tenant sessions never receive control-plane access.

- [x] Trace operator MFA and tenant/commercial/provisioning/domain/release/support/operator/health/audit workflows.
- [x] Check filtering/pagination, persisted details, unknown observations, empty/error states, and refresh.
- [x] Cover denied roles/tenant sessions, expired MFA/support grants, stale revision, repeat requests, and last-operator protection.
- [x] Ensure retry/cancel actions obey stored job state and preserve attributable actor/reason/outcome audit.
- [x] Keep queued/unavailable provider states honest; fix supported gaps and add schema/action/browser regressions.

**Acceptance:** Authorized operations persist with audit; denied operations do not mutate or expose private data. Queued work is not reported as provider success.

### Task 4: Shared domain, contracts, providers, and workers

**Owner:** B.

**Files:** `packages/booking-domain/src/index.ts` and `index.test.ts`; `packages/auth/src/index.ts`; `packages/api-contracts/src/index.ts`, `roles.ts` and existing tests; `packages/email/src/worker.ts`; `packages/integrations/src/stripe.ts` and `stripe.test.ts`; `packages/integrations/src/whatsapp/send.ts`; `supabase/functions/whatsapp-worker/worker.test.ts`; `supabase/functions/whatsapp-webhook/handler.test.ts`; GitHub/Vercel `control-plane/*/src/provisioning-worker.mjs`.

**Interfaces:** Preserve public exports, versioned DTOs, safe RPC outcomes, and N/N-1 compatibility. Edit canonical sources; generated copies belong to C/coordinator.

- [x] Trace all consumers before changing shared validation, money/time, identity, capability, or form behavior.
- [x] Cover integer minor units/currency exponents, invalid numeric/date inputs, DST gap/fold, and snapshotted policy rules.
- [x] Cover malformed identity, revoked access, stale/future MFA, and compatible unknown capabilities.
- [x] Cover raw-body webhook signatures, duplicate/reordered events, transient/permanent provider errors, bounded retry, and secret-safe diagnostics.
- [x] Check email/WhatsApp consent/template rules, Stripe reconciliation, and GitHub/Vercel replay/partial failures.
- [x] Fix proven defects and author regression tests at exported boundaries.
- [x] Identify repeated work with concrete evidence and a before/after measurement plan; preserve tenant-aware caching.
- [x] Return generated-output dependencies, coordinated contract needs, and test commands.

**Acceptance:** Invalid/unauthorized input fails safely. Replays do not duplicate protected state. Provider outages never fabricate success.

### Task 5: Database invariants and unfinished SQL

**Owner:** C.

**Files:** Existing uncommitted `20261008130000_custom_roles_and_notification_hardening.sql` and `custom_roles_notification_hardening_test.sql`; current custom-role migrations; `supabase/tests/database/custom_roles_test.sql`, `role_delegation_test.sql`, `location_scope_semantics_test.sql`, `whatsapp_notification_test.sql`, `tenant_rls_matrix_test.sql`; generated database types after integration.

**Interfaces:** Preserve api_v1 signatures, grants/search_path, tenant-composite keys, expected revisions, replay semantics, and audit.

- [x] Confirm unfinished SQL changes are reachable fixes. Remove speculative additions from this task's uncommitted migration.
- [x] Define positive/negative cases for tenant A/B, anonymous, allowed/denied roles, revoked sessions, assigned roles with zero locations, and worker boundaries.
- [x] Cover current/new role dominance, built-in locking, in-use archive denial, last-admin protection, and changed-payload/revision replay.
- [x] Cover notification tenant/consent binding, claim/retry eligibility, and duplicate/reordered outcomes.
- [x] Validate fixture columns, foreign keys, IDs, constraints, and snapshots against actual schema. Create required synthetic bookings explicitly.
- [x] Author compatible additive SQL and assertions; do not rewrite applied migrations or run the database during implementation.
- [x] Return affected callers, generation needs, and cross-owner repairs.

**Acceptance:** Ordinary-user RLS is exercised directly; privileged bypass is not proof of isolation. Denials preserve state and permitted writes retain transaction/audit guarantees.

### Task 6: Edge generation, portability, and cleanup

**Owner:** C.

**Files:** `scripts/bundle-edge-shared.mjs`, `scripts/bundle-edge-shared.test.mjs`, `scripts/check_links.py`, `scripts/verify-dashboard-completion.mjs`, `package.json`, and the earlier Dashboard plan.

**Interfaces:** Generated modules faithfully reflect canonical package sources; CI/distribution checks remain enforced.

- [x] Finish relative-import closure so required email `intl-locale.ts` is emitted with resolvable imports.
- [x] Finish multiline declaration extraction. Retain regressions for complete object/union types, supported imports, missing modules, and deterministic output.
- [x] Keep generation/check modes consistent; defer regeneration until B's canonical edits finish.
- [x] Finish portable documentation/skill lookup without disabling missing-target checks or silently skipping required gates.
- [x] Inventory deletion candidates through imports, exports, scripts, CI, distribution, dynamic loading, fixtures, and operational entrypoints.
- [x] Delete only proven redundancy; record path, consumer search, reason, and affected checks. An empty deletion ledger is valid.
- [x] Preserve lockfile integrity and test discovery; do not introduce a second verification framework.

**Acceptance:** Generated imports/types are complete, drift is detected, docs are portable, and every deletion has evidence.

### Task 7: Prepare isolated verification

**Owner:** C, coordinating browser config/fixture TypeScript with A.

**Files:** `scripts/platform-admin-local.mjs` and its test; `scripts/supabase-local.mjs`; `scripts/live-booking-e2e.mjs` and its test; `scripts/verify-dashboard-completion.mjs`; SQL browser fixtures. A owns `playwright.config.ts` and authenticated fixture TypeScript.

**Interfaces:** Existing `WLBP_SUPABASE_WORKDIR` selects several tools, but Platform Admin has hardcoded project/workdir/port guards. One environment variable does not relocate every server/fixture.

- [x] Prepare a fresh `.artifacts/monorepo-hardening/isolated` campaign project with a distinct ID and verified free ports.
- [x] Preserve retained Dashboard `553xx` and Platform Admin `565xx` stacks; never use their reset entrypoints.
- [x] Narrowly adapt existing helpers where necessary so seed/server/credentials/fixtures/concurrency/type generation target the same campaign.
- [x] Preserve identity guards and author wrong-project/workdir/port regressions.
- [x] Prepare migration replay and synthetic actors with repeatable IDs/transaction cleanup.
- [x] Separate unconfigured baseline browsers from authenticated fixtures; avoid shared Next output directories and port collisions.
- [x] Keep credentials ignored and owner-readable; disable credential-bearing traces/screenshots/video.
- [x] Return exact guarded setup/seed commands and non-secret environment variables. Execute none yet.

**Acceptance:** Fresh replay and synthetic fixtures cannot reset retained demos or another project.

## Connected user acceptance

| Actor/screen | Action | Persisted result and evidence | Failure cases |
| --- | --- | --- | --- |
| Customer catalog/booking | Choose service/location/time; submit contact/intake | One booking with correct snapshots and confirmation | Full slot, invalid input, expired hold, duplicate submit |
| Customer payment/manage | Trusted payment boundary; valid token/intent | Trusted payment state and permitted cancel/reschedule | Forged redirect, wrong/expired OTP, reschedule failure preserves original |
| Staff bookings/calendar | Locate booking; perform permitted lifecycle action | Detail/list/calendar agree after reload | Wrong tenant/location/role; stale revision |
| Tenant admin catalog/team/roles | Create/read/edit/duplicate/publish/archive where supported | Saved configuration and refreshed views | In-use archive, escalation, last-admin removal |
| Tenant communications/settings | Configure entitled channel; inspect report | Tenant-bound settings and honest delivery state | No entitlement/consent; provider unavailable |
| Platform operator pages | MFA and authorized operational action | Persisted state, audit, queued external work | Expired MFA/grant, unauthorized role, replay |
| All three apps | English/Arabic, mobile, keyboard, recovery | Equivalent RTL/labels/focus/functionality | Empty/unavailable data must not appear successful |

Unit tests supplement connected journeys. Automated accessibility checks do not establish human screen-reader acceptance.

## Task 8: Combined review and single verification campaign

**Owner:** Coordinator after all implementation and dependent repairs finish.

- [x] Read final worker reports and complete combined diff once. Check supported scope, deletion safety, public contracts, and feature preservation.
- [x] Obtain an independent native Muse Spark 1.3 Contributor Free high review for consequential authorization/payment/destructive changes (latest user model selection). Give full read-only briefs. Combined review is split into guest/SQL, role CRUD, and runtime/tooling scopes; client request IDs end in `review-guest-v1`, `review-roles-v1`, and `review-runtime-v1` under the `booking-platform-hardening-20261008-` prefix.
- [x] Resolve material findings through narrowly owned tasks before starting the campaign.
- [x] Activate Node 22 and pnpm 11.25.0. Verify the available local Node 22.22.0 installation before use.
- [x] Run Task 7's guarded setup; finalize Edge generation and database types from the correct source/environment.
- [x] Execute distinct existing gates below once, record exit status/counts/skips, then repair demonstrated failures and rerun affected checks.
- [x] Measure any performance change with identical representative inputs/environment before and after. Report actual query/request counts or elapsed work; do not claim improvement from intuition.

### Campaign commands

Run at the repository root using `rtk`, Node 22, and Task 7's verified environment. Database and authenticated commands are not safe to run before Task 7 completes.

| Stage | Commands | Required evidence |
| --- | --- | --- |
| Install/generation | `rtk pnpm install --frozen-lockfile`; `rtk pnpm bundle:edge` | Frozen install and settled source generation succeed |
| Workspace | `rtk pnpm check` | All constituent static/unit/contract/config/CI-fixture/distribution/secret/docs/build/Edge/bundle gates pass, including all three app builds |
| Fonts | `rtk pnpm check:fonts` | Font provenance/assets pass |
| Additional CI gates | `rtk node scripts/check-ci-history.mjs`; `rtk pnpm audit --audit-level=high`; `rtk pnpm run sbom` | Reachable Git history scan, dependency advisory result, generated CycloneDX artifact (exact existing CI steps) |
| Database | Task 7's fresh guarded migration replay; `rtk pnpm db:lint`; `rtk pnpm test:db`; `rtk pnpm check:db-types` | Migration, pgTAP/RLS counts, lint and matching generated types |
| Concurrency | `rtk pnpm test:concurrency`, with `SUPABASE_DB_URL` privately bound to fresh stack | Contended bookings/holds and replay preserve invariants |
| Baseline browsers | `rtk pnpm exec playwright test --project=component --project=e2e --project=i18n --project=a11y --project=visual` | Both locales, brands, responsive/keyboard/a11y evidence with baseline backend variables unset |
| Live booking | `rtk pnpm test:e2e:live` with isolated workdir/fixtures | Real local customer booking across Client and Dashboard |
| Dashboard | `rtk env DASHBOARD_COMPLETION_E2E=1 pnpm exec playwright test --project=dashboard-completion` after guarded fixture setup | Persisted tenant workflows and denied/retry/reload outcomes |
| Platform Admin | `rtk env PLATFORM_ADMIN_E2E=1 pnpm exec playwright test --project=platform-admin` after helper/fixture alignment | Real privileged flows and denials against identified fresh environment |

Map additional required repository/CI gates, including history scanning and release/recovery checks, to their existing exact invocation and actual issue ownership before the campaign. Do not invent passing substitutes for missing gates.

Do not repeat `pnpm check` constituents for another report. Run browser groups sequentially when sharing ports. Skipped authenticated tests are not passes. Do not run the old Dashboard reset runner against retained data or update visual baselines merely to suppress failures.

Use native T3 preview when a changed interaction needs manual browser evidence. Artifacts under `.artifacts/monorepo-hardening/` record source revision/diff fingerprint, environment, versions, command, exit status, counts, skips, duration, and sanitized logs. Old reports cannot verify changed source.

## Task 9: Evidence report and handoff

**Owner:** Coordinator. **File:** `docs/monorepo-hardening-verification.md`.

- [x] Report completed behavior, affected apps/packages, and acceptance evidence.
- [x] Include deletion evidence, preserved features, regression/edge cases, and measured performance or its absence.
- [x] List every gate as passed/failed/blocked/not run with command, counts, and reason.
- [x] Separate local contracts from live Stripe/Resend/WhatsApp/GitHub/Vercel execution, current Linux CI, load/recovery drills, and human acceptance.
- [x] Use `N/A — not yet implemented, owned by issue #N` only with an actual repository issue. Never invent ownership.
- [x] Read final versions from `platform-contract.json`; planning baseline is whiteLabelVersion `0.1.0`, configSchemaVersion `3`, backendContract `{ min: 1, max: 1 }`.
- [x] Update this plan's checkboxes from actual evidence, not worker completion alone.

**Outstanding gate:** `pnpm audit --audit-level=high` remains failed on GHSA-vfj7-8cjw-p6xm. No suppression, waiver, or claim of an all-green release is made. External delivery, current CI, production load, and human acceptance limits are listed in the report.

**Definition of done:** Required in-scope repairs and supported missing operations are integrated, applicable local gates pass, all three apps' critical connected journeys have evidence, and deletions are justified. Unresolved failures or external acceptance limits remain explicit; they are never converted into passes.
