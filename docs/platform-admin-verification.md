# Platform Admin delivery verification

Local console: `http://localhost:3002/en`, Arabic `http://localhost:3002/ar`. Authenticated operator sessions use real password/TOTP verification. Credentials remain in ignored, owner-readable `.artifacts/platform-admin/credentials.json`; current local codes come from `node scripts/platform-admin-local.mjs code admin`.

## Feature routes

| Feature | Routes | Local behavior |
| --- | --- | --- |
| Overview | `/en`, `/ar` | Persisted fleet/subscription/job summaries, recent audit activity, filtered links, explicit missing observations |
| Tenants | `/en/tenants`, `/new`, `/[tenantId]` | Directory URL filters/sort/pages, registration, identity/lifecycle, suspension/reactivation, guarded closure |
| Provisioning | `/en/provisioning`, `/new`, `/[runId]` | Requests, persisted steps/attempts, local activation safeguards, authorized retry/deactivation |
| Infrastructure | `/en/instances`, `/[instanceId]`, `/en/domains` | Desired versus observed state, unknown/drift/staleness, queued domain verification |
| Jobs | `/en/jobs`, `/[jobId]` | Stored attempts/sanitized errors, authorized retry/cancel, separate approval |
| Commercial | `/en/plans`, `/en/subscriptions`, tenant detail | Plan edits with reasons, local subscription lifecycle and entitlement overrides |
| Delivery | `/en/releases`, `/[releaseId]`, `/en/rollouts`, `/[rolloutId]` | Version inventory, rings/instance targeting, prerequisites, queue/progress, supported pause/retry/cancel/rollback |
| Operations | `/en/health` | Stored health observations, timestamps, stale signals, evidence-derived alerts |
| Support | `/en/support` | Scoped time-limited grants, reasons, revocation and audit |
| Security | `/en/operators`, `/en/account`, `/en/login`, `/en/mfa-enroll` | Roles, MFA, expiring break-glass, last-admin protection, operator revocation |
| Audit | `/en/audit` (export dialog) | Filtered paginated activity, sanitized detail, controlled CSV export |
| Settings | `/en/settings` (integration section) | Supported local flags, safe integration metadata and queued checks |

All console routes have Arabic equivalents and directional layout support. Support scopes do not provide automatic tenant booking/customer access.

## Evidence

Commands run at the repository root with Node **22.22.0**, pnpm **11.25.0**, and the isolated workdir `.artifacts/platform-admin/isolated`. Detailed logs and red/green regression evidence remain in ignored `.artifacts/platform-admin/`.

| Checks | Exact commands / execution | Result |
| --- | --- | --- |
| Installation and source contracts | `pnpm install --frozen-lockfile`; `pnpm check:lockfile`; `pnpm check:ci`; `pnpm test:contract`; `pnpm check:config` | PASS |
| Typecheck and production build | `pnpm typecheck`; `NEXT_PUBLIC_SITE_URL=https://platform-admin-build.invalid pnpm build`; `pnpm check:bundles` | PASS, all applications/packages built. The site URL supplies the existing Client sitemap requirement; no deployment occurred. |
| Unit/config/provider contracts | `pnpm test:unit`; `pnpm test:config`; `pnpm test:github-app`; `pnpm test:vercel`; `pnpm test:ci-fixtures` | PASS. Platform Admin: 10 files / 42 tests; local setup/TOTP seams: 16 tests, including RFC 6238 vectors. Provider contracts do not prove live provider execution. |
| Architecture and distribution | `pnpm check:boundaries`; `pnpm check:distribution`; `pnpm test:distribution`; `pnpm build:distribution`; `pnpm check:edge`; `pnpm check:fonts` | PASS |
| Documentation and source secret scan | `pnpm check:docs`; `pnpm check:secrets` | PASS |
| Database contracts with demo retained | `WLBP_SUPABASE_WORKDIR=.artifacts/platform-admin/isolated pnpm test:db`; `pnpm db:lint`; `pnpm check:db-types` with the same workdir | PASS: **39 files / 1,703 assertions**, lint `results: []`, API types in sync. Final source tests ran against retained demo data without reset/reseed. |
| Concurrency and HTTP boundaries | Local `database-concurrency.py` and `database-http-boundary.mjs` | PASS: duplicate concurrent creates yield one tenant/audit; simultaneous administrator demotions preserve one usable administrator; anonymous RPC receives HTTP 401 / SQLSTATE 42501. |
| Platform Admin browser journeys | `PLATFORM_ADMIN_E2E=1 pnpm exec playwright test --project=platform-admin --workers=1` | PASS: **14/14**, 5.9 minutes; expanded combined persisted workflow passed in 59.1 seconds. Every browser console error is rejected in the navigation and expanded journey checks. |
| Existing browser regression projects | `pnpm exec playwright test --project=component --project=i18n --project=a11y --project=visual --project=e2e` plus a focused baseline refusal/visual rerun | **161 distinct cases passed; 6 live-database-only cases skipped**. Initial 11 Dashboard refusal/visual mismatches came from supplying a configured backend to unconfigured baseline tests; a correct unconfigured rerun passed all 21 selected cases, including all 11 failures. Baselines were not rewritten. |
| Native collaborative browser | T3 preview on the running port 3002 | EN desktop/tablet/mobile and Arabic RTL inspected, including layout containment, navigation, native dialog initial focus, Escape focus return, real password/TOTP and sign-out. |
| Formatting and lint | `pnpm format:check`; `pnpm lint` | PASS. |
| Actual local credential scan | `.artifacts/platform-admin/security-scan.mjs` | PASS: **168 files and 132 persisted audit rows scanned; zero exact privileged/password/TOTP secret matches** in the final post-browser scan. Checks static bundles, logs, test output and persisted audit without printing secret values. |

Browser assertions cover real Auth/MFA, anonymous/AAL1/viewer API denial, all navigation, persisted URL filters, tenant registration/rename/suspend/reactivate and audit reasons, localized validation, refusal of self-approval, mobile keyboard navigation, RTL and automated EN/AR WCAG A/AA checks. The commercial journey covers reason-audited plans, subscription and entitlement changes, missing domain certificate evidence, specific-instance rollout queueing, two-person support approval/revocation, bilingual flags and queued integration checks. Retesting cancels only its own synthetic queued rollout; no worker success is fabricated. Authenticated tests disable screenshots/traces/videos to keep credentials out of artifacts.

Database tests use real operator/RLS boundaries, recent-authentication checks, payload-bound idempotency, secret rejection, concurrency protection and worker evidence requirements. Fixture scopes allow retained demo records; temporary test setup rolls back. The final native snapshot retry failed in the host preview automation client despite successful navigation; earlier native inspection and the final Playwright execution are separate evidence. Native and automated checks do **not** establish human screen-reader acceptance; that was not performed for this application.

## Unexecuted external acceptance

- Live provisioning replay against GitHub/Vercel/DNS: **N/A — not yet implemented as a configured live acceptance gate, owned by issues #30–#32**. Local contracts and queues pass.
- Upgrade/rollback acceptance against a published tenant distribution: **N/A — not yet implemented as a configured live acceptance gate, owned by issues #29, #34 and #35**. Local release compatibility, targeting, rollback and worker-report contracts pass.
- Existing Client live-booking cases were skipped by their environment guards in the broader regression run; Platform Admin direct API and persisted browser journeys run separately against the isolated project. Booking correctness is covered by the executed database suite; no reset of retained stacks was performed to enable unrelated browser campaigns.

## Preservation and contracts

A comparison against the starting binary diff confirmed **91 unrelated tracked file diffs unchanged** before the narrowly authorized source-test fixture fixes. Existing Client/Dashboard work remains uncommitted. Shared documentation, scripts, Playwright configuration and generated types are staged selectively. No push, deployment or other-project reset occurred.

Contract values from `platform-contract.json`: `whiteLabelVersion=0.1.0`, `configSchemaVersion=3`, `backendContract={min:1,max:1}`. No GitHub issue is automatically closed by this local delivery.

## External execution

Live GitHub/Vercel credentials, provider workers, DNS/certificate observations and release deployment/reporting require real environment configuration. Local queues and worker contracts are implemented; no external success is fabricated. Billing-provider actions remain unavailable because no payment-provider control-plane integration is present. Synthetic health/release records are explicitly demo evidence.
