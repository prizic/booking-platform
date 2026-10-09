# Monorepo hardening verification — 2026-10-08

Status: local implementation and verification completed on 2026-10-09. One high dependency advisory still fails the audit gate; this report does not establish full release readiness.

## Scope and baseline

Booking Platform only, branch `chore/monorepo-hardening-20261008`, based on
`5dddd702419931a2188d9f995f86490454cb7f41` (fetched `origin/main`). No Maslak
changes were identified. No commit, push, deployment, production operation, or
external provider delivery was performed. Existing retained demo databases were
preserved. The [execution plan](superpowers/plans/2026-10-08-monorepo-hardening.md)
records the historical requirements and ownership.

The initial three OpenCode Space Bunny HIGH implementation workers completed,
followed by bounded Muse Spark 1.3 Contributor Free HIGH integration, independent
review, and repair tasks. Verification started after implementation and review
repairs; failed gates receive targeted reruns within the same campaign.
The final fixture and isolation tasks use the subsequently requested OpenCode
MiMo-V2.6-Flash Free model. Its last hydration repair task ended with a provider
rate limit before making edits; the coordinator completed that bounded repair.

## Implemented behavior

- Client checkout maps absent joined fields to null rather than the string
  `undefined`. Management queries retain their token intent. A valid guest view
  link can request a scoped cancellation/rescheduling link and OTP through the
  notification outbox; database authorization and immutable snapshots remain
  authoritative.
- Dashboard custom roles support create, edit, duplicate, and archive with
  descriptions, bilingual refusal messages, revisions, retry keys, and scope
  selection that preserves compatible grants. Invalid targets and revisions
  fail closed. Assigned roles and protected administrators remain protected.
  A pristine duplicate editor adopts refreshed source permissions after an edit;
  an operator's unsaved permission or scope selections remain intact.
  Role save forms also preserve names, permissions, and scope through automatic
  React form resets, so correcting a refused save cannot silently widen a grant.
- Provider dispatch rejects inherited/unknown keys; Stripe input validation
  rejects invalid amounts and dates; catalog prices require supported money
  shapes. Notification claim settlement handles expired undeliverable claims.
- Timezone formatting reuses a formatter; WhatsApp branding lookups are cached
  per tenant and locale within a batch. Existing pure branding parsers gain
  narrow imports so metadata need not load the entire UI barrel.
- Edge generation follows relative import dependencies, including the missing
  email locale module. Documentation links and local fixture helpers are
  portable. Shipped icon and booking-route content tests support both source
  and generated-instance configuration paths. Database and browser fixtures use an isolated campaign profile.
- Platform Admin domain creation has an explicit Client application default,
  and release target labels have stable React keys. The console language links
  hydrate with the shell instead of behind separate deferred boundaries.
- Next.js and aligned ESLint configuration are patched to 16.3.8, with targeted
  transitive dependency patches. Source tests exclude generated `dist` copies,
  avoiding duplicate execution and excessive parallel workers.

No tracked file was deleted without a demonstrated reason; the deletion ledger
is empty. An unfinished, untracked speculative SQL draft was replaced by the
supported notification fix. Existing migrations, assets, fixtures, RTL, PWA,
Platform Admin, and white-label distribution boundaries were retained.

## Verification environment

Commands run at the repository root through `rtk`, with Node 22.22.0, pnpm
11.25.0, local Deno 2.9.5, and local PostgreSQL tools on PATH. Local Deno differs
from the CI pin; this is not evidence of a current Linux CI run.

Fresh Supabase project: `monorepo-hardening-20261008`; workdir
`.artifacts/monorepo-hardening/isolated`; API 57721, DB 57722, Mailpit 57724.
Retained 553xx/565xx stacks were not reset. Credentials stay in ignored,
owner-readable fixtures and are excluded from authenticated browser artifacts.

Sanitized logs, worker reports, and measurement data are under
`.artifacts/monorepo-hardening/`; these local artifacts are not distributed.

## Gate ledger

`pnpm check` stopped at observed failures. Its remaining constituent commands
were executed separately; an aggregate all-green result is not claimed.

| Gate / command | Current result | Evidence |
| --- | --- | --- |
| `pnpm install --frozen-lockfile`; `pnpm check:lockfile` | Pass after dependency repairs | `dependency-repair.md` |
| `pnpm check:ci`; `pnpm format:check` | Pass at campaign entry/resume; changed-file formatting passed October 9 | `verification/workspace*.log` |
| `pnpm lint` / boundaries | Pass on final source, including parser exports | `verification/final-lint.log` |
| `pnpm typecheck` | All 17 package tasks pass; later parser-export changes checked separately | `verification/workspace-types-resume.log` |
| `pnpm test:unit` | All source suites pass across the initial run and targeted repairs (1,047 tests) | `verification/workspace-unit-resume.log`, `verification/unit-repair-*-full.log` |
| `pnpm test:github-app` | 40 tests pass | `verification/github-tests.log` |
| `pnpm test:vercel` | 22 tests pass | `verification/vercel-tests.log` |
| `pnpm test:contract` | Pass | `verification/contracts.log` |
| `pnpm test:config` | 46 tests pass across the initial run and targeted fixture repair | `verification/config-tests.log` |
| `pnpm test:ci-fixtures` | Pass: generated-instance frozen install, configuration, lint/unit tests and fail-closed negative fixtures | `verification/ci-fixtures-final.log` |
| `pnpm check:config` | Pass | `verification/check-config.log` |
| `pnpm check:distribution` | Pass including the new pure parser exports | `dependency-repair.md` |
| `pnpm test:distribution` | 5 tests pass | `verification/distribution-tests.log` |
| `pnpm build:distribution` | Pass: 531 files, 13 members; refreshed after final Dashboard role repairs | `verification/distribution-final-oct9.log` |
| `pnpm check:secrets` | Pass | `verification/secrets.log` |
| `pnpm check:docs` | Pass on the final ledger and source | `verification/docs.log` |
| `pnpm build`; `pnpm check:bundles` | Initial 17 build tasks pass; final Dashboard and Platform Admin production rebuilds pass after repairs; final distributed bundle scan passes | `verification/build.log`, `verification/dashboard-build-final-env-oct9.log`, `verification/platform-build-final-oct9.log`, `verification/bundles-final-oct9.log` |
| `pnpm check:edge` | Generated closure/schedule and 25 Deno tests pass | `verification/edge.log` |
| `pnpm check:fonts` | Pass | `verification/fonts.log` |
| `node scripts/check-ci-history.mjs` | Pass | `verification/history.log` |
| `pnpm run sbom` | Pass after dependency patches | `verification/sbom-patched.log` |
| `pnpm audit --audit-level=high` | **Fail: one remaining high advisory** | `verification/audit-repair.log` |
| Fresh database migration replay | Pass | `verification/database-replay.log` |
| Database pgTAP | 49/49 files pass cumulatively, 2,291 assertions; targeted repaired files: 109 assertions | `verification/database-tests-direct.log` |
| Database lint, types, concurrency | Pass; generated types match, 48 concurrency assertions | `verification/database-repair-{lint,types,concurrency}.log` |
| Baseline browser suite | 156 nonvisual cases pass; 11 authenticated cases run separately | `verification/baseline-browser-retry.log` |
| Darwin visual suite | 24/24 pass after reviewed baseline regeneration; independent comparison 24/24 pass | `verification/visual-final-clean-cache-oct9.log`, `verification/visual-final-compare-oct9.log` |
| Linux visual suite | 24/24 baseline generation pass; representative images reviewed, independent comparison 24/24 pass | `verification/linux-visual-update.log`, `verification/linux-visual-compare.log` |
| Live booking browser suite | All nine pass cumulatively (3 + 2 + 4); fixed stale heading and response-shape assertions without weakening booking/replay checks | `verification/live-final-oct9.log`, `verification/live-targeted-oct9.log`, `verification/live-last-four-oct9.log` |
| Dashboard browser suite | All 31 Dashboard cases pass cumulatively; both additional authenticated toast accessibility cases pass. Final form-reset repair: both affected CRUD/scope cases pass | `verification/dashboard-final-oct9.log`, `verification/dashboard-targeted-oct9.log`, `verification/dashboard-realtime-fixture-oct9.log`, `verification/dashboard-roles-final-oct9.log`, `verification/dashboard-scope-final-oct9.log` |
| Platform Admin browser suite | All 14 cases pass cumulatively; final commercial workflow passes with no console errors after the console hydration repair | `verification/platform-admin-final2.log`, `verification/platform-hydration-parent.log`, `verification/platform-locale-query-final.log` |

Initial source-only shared unit totals: API contracts 186, auth 16, booking
domain 20, config 23, email 176, i18n 21, integrations 144, observability 2,
Supabase client 3, tenant resolution 18, UI foundation 21, white-label UI 24;
Platform Admin 67, Client 134, Dashboard 192. Repeated targeted runs and generated test copies must not be
added to these totals as new coverage.

## Performance evidence

For the same three DST-sensitive booking-domain calls, independent baseline and
current source execution produced equal outputs while formatter constructions
fell from 5,043 to 1. See `verification/domain-performance.json`. This is an
exported-library measurement; no current production caller or production
latency improvement is asserted. WhatsApp regression coverage verifies tenant
and locale separation while reusing branding lookups within a batch.

The nonvisual baseline breakdown is E2E 54 pass / 9 live cases deferred,
component 14 pass, localization 4 pass, accessibility 84 pass / 2 authenticated
toast cases deferred. The separate visual project has 24 cases. Its old
reference images showed the previous demo design, and warm-brand assertions used
a removed CSS class. The harness now checks root brand tokens and rendered colors.
All 24 Darwin references were regenerated and representative default/warm,
desktop/mobile, and RTL images were reviewed across the three surfaces. The 24
Linux references were generated by Chromium inside the official Playwright
1.63.0 Noble container (Linux aarch64), connected to the local app servers.
Representative Linux images received the same review. This is a local Linux
browser run, not a GitHub CI or x64 validation run.

## Native preview evidence

The shared T3 preview returned HTTP 200 for `/ar/manage` and `/en/manage`.
Without a management token, both display the equivalent instruction to open
the link in the booking message and offer a return-to-booking link. No current
console errors were observed. This checks the missing-token recovery state; it
is not evidence of authenticated mutation or human screen-reader acceptance.

## Remaining limitations

- The audit fell from 16 advisories (one critical, eight high, six moderate, one
  low) to one high advisory in `braces <=3.0.3`,
  [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
  The audit reports no patched version. Its dependency chain is ESLint tooling
  through the Next ESLint plugin, fast-glob, and micromatch. This gate remains
  failed; it has not been suppressed or accepted on the user's behalf.
- Contract/fixture tests do not prove actual Stripe, email, WhatsApp, GitHub,
  or Vercel delivery, deployment, or recovery under production credentials.
- During browser startup, host load average reached about 305 with 15.5 GB of
  swap in use. A startup timeout is an infrastructure failure, not a passing or
  failing application assertion. Unrelated host jobs were not stopped.
- Current Linux CI, production load/recovery drills, and human screen-reader
  acceptance are not established by this local campaign. Automated coverage
  cannot prove every conceivable edge case.
- Guest rescheduling coverage includes the real API/database move; the new live
  test does not drive the complete rescheduling date/time picker interaction.

Contract versions from `platform-contract.json`: white-label `0.1.0`, config schema
`3`, backend contract minimum `1`, maximum `1`.

### Browser campaign environment interruption

On October 8 the host load rose above 500. The Dashboard browser attempt was stopped after repeated navigation/sign-in timeouts. Its recovery test also exposed a launch omission: the campaign command lacked the ephemeral `DASHBOARD_RECOVERY_COOKIE_SECRET` and `NEXT_PUBLIC_DASHBOARD_REALTIME_ENABLED=true` used by the standard Dashboard verification runner. These environment settings must be restored before the affected journeys are rerun; this attempt does not establish a product regression or a passing browser gate. Those two worker attempts were later cancelled. Docker Desktop was stopped at the user’s request, then restarted on October 9 after renewed authorization. The existing campaign containers recovered without resetting their databases.

### October 9 targeted continuation

Changed-file formatting and lint pass, including the final Platform Admin source and browser checks; the documentation check and whitespace check pass. Live fixture reuse, identity-collision refusal, incomplete-fixture refusal, and six script tests pass. The existing confirmed booking and hold survive fixture reuse. A separate fresh-insert probe passes with remapped identities, validates all expected rows, and rolls back without residue (`live-fixture-fresh.md`).

The visual helper previously awaited an intentional infinite loading spinner on the brand-preview page. Native browser inspection confirmed its infinite iteration count; the helper now waits only for finite animations, while screenshot capture disables looping animations. Interrupted Turbopack caches caused a subsequent compiler panic and were removed from generated output directories before the targeted retry. No source or retained data was deleted by cache cleanup.

Darwin visual baseline generation on October 9 passes all 24 cases after the finite-animation repair. The independent comparison run also passes all 24 cases (1.2 minutes, exit 0). Linux baseline generation separately passes all 24 cases using the pinned Linux browser; exactly 24 images for each operating system changed. The authenticated accessibility artifact settings were moved to file level because Playwright requires these options at worker scope.

The corrected 33-case Dashboard/accessibility run finished with 23 passes, two failures, and eight serial cases not run. One destructive realtime test revoked the scheduler shared by later permission tests; it now uses a dedicated synthetic account. The other failure clicked a Radix checkbox's hidden backing input; role interactions now address the visible checkbox. The guarded incremental setup passed without resetting the campaign. Both authenticated toast accessibility cases passed in the initial corrected run.

The shared scheduler passes after fixture isolation. The realtime test's manually created primary context twice timed out before sign-in; using the standard Playwright page/context fixture passes the full realtime refresh, offline recovery, and revocation journey (2.1 minutes), with the second actor still isolated and all assertions retained. The remaining role journey reached duplication and found two copied permissions after editing the source to add a third. The duplicate editor retained its initial React state across refreshed server props. The repair synchronizes pristine permission/scope state with changed source grants while preserving unsaved selections; Dashboard's 192 unit tests, lint, and typecheck pass again. The browser regression checks all three selected permissions before submitting and keeps the persisted three-grant assertion.

The subsequent nine-case run passed eight cases, including the duplication regression, full role CRUD, assigned scopes/descriptions, stale edits, protected roles, Arabic accessibility, and both integration entitlement states. Archive assertions now observe the archived badge and removal of controls because a successful archive unmounts its form. Independent role cases run sequentially outside the serial notification group, so a failure no longer skips unrelated cases.

The remaining role failure was an automatic form reset after a refused tenant-to-assigned scope change: Radix restored the initial tenant mode, so the corrected retry saved a tenant-scoped grant instead of `own`. The role save form now cancels reset in capture phase, preserving both native fields and Radix-controlled state. Both affected browser cases pass after this repair: full CRUD/duplication and refusal/correction/retry with persisted `own` scope. Dashboard's 192 unit tests, lint, typecheck, and formatting pass again. HTTP readiness for Dashboard sign-in now precedes authenticated tests after repeated first-navigation startup timeouts.

Platform Admin's final worker verified 13 of 14 cases plus all functional steps of the commercial workflow. It fixed a missing React Fragment key in release target labels and retained an explicit Client default for new domains. Test locators use the existing main landmark, distinguish mobile menu controls, and scope audit assertions to the table. The commercial-workflow failure reported locale-switch hydration mismatches during queued-job navigation. The final MiMo task ended at a provider rate limit without source changes. The coordinator removed the two optional console-language Suspense boundaries so route-dependent links hydrate with the navigating shell. The complete commercial workflow then passed with its original empty-console assertion and an added current-route language-link assertion. The separate filtered-list regression checks query preservation and current-language marking. A first attempt timed out while MFA was still processing before reaching those assertions; its targeted retry is recorded separately. Authentication layouts and server-rendered language links remain intact; no hydration warning is suppressed.

After the final role repairs, the Dashboard production build passes with CI's canonical site URL (`https://source-ci.invalid`). An initial direct build omitted that required variable and failed metadata generation; no application change was needed for that launch omission. Distribution regeneration passes with 531 files from 13 members, including both final role fixes.

The final Platform Admin production build (including TypeScript) and scoped app/browser ESLint pass. Final report formatting, documentation links, and whitespace are checked after recording the results. No native delegated work remains active.
