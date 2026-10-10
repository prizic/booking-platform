# Security remediation verification — October 10, 2026

## Delivered scope

Addresses issues #127–#131; no issue was closed, and no commit, PR, push or
hosted deployment was made in this session.

- #127: booking reads require direct view capability, effective location access
  and, for own scope, assignment. Custom brand-only roles cannot read booking
  rows, their contact children, Today or Calendar.
- #128: digest booking/PII scopes intersect membership location restrictions.
  Cached digests are refused after scope/content changes.
- #129: production OTP dispatch → claim → worker mint → bilingual rendering is
  connected. Challenge authorization tables retain hashes, not plaintext codes.
- #130: erasure removes WhatsApp phone/text, keeps minimal consent evidence,
  cancels outstanding sends and purges encrypted customer and staff-digest
  renditions. Invalidated digest identities cannot regenerate after replay.
  The forward repair also handles already-erased customers, respecting later
  legal holds. WhatsApp rechecks authorization immediately before sending.
- #131: provider input is encrypted and stored before sending, then replayed
  unchanged after lost acknowledgements. Current claim/recipient authority is
  rechecked; expiry and erasure fail closed rather than replacing old content.

The change extends existing database/worker modules and adds one internal
module in the existing platform-only email package (source ladder rung 3).
No dependency, package, distribution allowlist or backend compatibility-window
change was needed. ADR-0004 and ADR-0018 contain implementation clarifications.
Windows CLI/type-generation fixes were needed to execute the existing gates;
the shared Edge bundle was regenerated, not edited independently.

## Environment and safety

Portable, ignored toolchains: Node 22.22.0 and the CI-pinned Deno 2.5.2. The
Node download was checked against its official SHA-256 list; Deno against its
official release asset digest. Frozen installation used pnpm 11.25.0.

Docker Desktop was started. Database work used only the new
`security-remediation-20261010` stack at
`.artifacts/security-remediation-20261010`, on separate 5832x ports, with Realtime
enabled for its existing policy suite. Existing local/demo stacks were neither
reset nor modified. Source migrations/tests were copied into the isolated
stack before each replay. Fixtures use reserved synthetic identities.

For the commands below, `WLBP_SUPABASE_WORKDIR` points to that absolute isolated
directory. The concurrency command used its local database endpoint through
`SUPABASE_DB_URL`; no hosted database or provider was contacted. Builds used the
synthetic `NEXT_PUBLIC_SITE_URL` value `https://preview.example.invalid`.

## Commands and results

| Exact command / operation | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS — frozen lockfile and supply-chain policy validation |
| `pnpm lint` | PASS — ESLint and dependency/boundary/cycle enforcement |
| `pnpm typecheck` | PASS — 25 tasks |
| `pnpm test:unit` | PASS — 23 tasks; email suite includes 184 tests |
| `pnpm --filter @wlbp/email test:unit` | PASS — 184 tests, including EN/AR production OTP and stable retry content |
| `pnpm --filter @wlbp/email typecheck` | PASS |
| `pnpm exec supabase db reset --local --workdir <absolute isolated directory>` | PASS — replay from zero through all October 10 migrations |
| `pnpm test:db` | PASS — 49 files, 2,326 assertions |
| `pnpm db:lint` | PASS — no error-level findings |
| `pnpm db:types` and `pnpm check:db-types` | PASS — actual local `api_v1` generation, not a handwritten type approximation |
| `pnpm test:concurrency` | PASS — 48 checks, with the default 100 hold contenders |
| `pnpm build` | PASS — all 17 app/package build tasks; initial run without the required public site URL failed, then passed with the synthetic URL |
| `pnpm check:bundles` | PASS — distributed production bundles contain no private code/credentials |
| `pnpm bundle:edge` and `pnpm check:edge` | PASS — generated bundle, scheduler/function correspondence, one invocation-guard test and 25 further Deno tests |
| `deno check supabase/functions/notification-worker/index.ts supabase/functions/whatsapp-worker/index.ts` | PASS |
| `node --test scripts/bundle-edge-shared.test.mjs` | PASS — seven tests, including the native-path CLI entry point |
| `pnpm check:lockfile`, `pnpm check:ci` | PASS |
| `pnpm test:github-app`, `pnpm test:vercel`, `pnpm test:contract` | PASS — unit/contract evidence, not live provisioning |
| `pnpm check:config`, `pnpm check:distribution`, `pnpm test:distribution` | PASS |
| `pnpm check:secrets`, `pnpm check:fonts` | PASS |
| `git diff --check` | PASS — task diff, not a rewrite of earlier font-license content |
| `pnpm exec prettier --check <all changed/new TS, TSX, MJS and JSON files>` | PASS |
| Knowledge pack: Git Bash `scripts/check-docs.sh`, with exported `python3` function pointing to Python 3.12 and `PYTHONUTF8=1` | PASS — all six checks; plain Windows/WSL `bash` and initial non-UTF-8 Python attempts failed |
| Exact scheduler SQL piped to `psql -v ON_ERROR_STOP=1` in the isolated database | PASS — `wlbp-prune-delivery-envelopes` registered exactly once |
| Rolled-back synthetic legacy-erasure scenario, using the customer-privacy fixture prefix and the exact forward-repair DO block | PASS — 73 assertions; final three cover later legal hold, payload redaction/evidence retention and cancellation |

`pnpm build:distribution` returned zero on Windows without executing its old
URL/path-based entry guard. It was **not** counted as export evidence. The real
export was invoked with this native-path bootstrap:

```js
const entry = new URL("./scripts/build-distribution.mjs", import.meta.url);
process.argv[1] = decodeURIComponent(entry.pathname);
process.argv[2] = ".artifacts/security-export-20261010";
await import(entry.href);
```

Running it with Node's `--input-type=module -e` produced 519 files from 13
allowlisted members, plus the distribution manifest. The output target was
checked to be new and within this workspace before executing the export.

## Failed or unavailable broader gates

| Command / gate | Actual result |
| --- | --- |
| `pnpm format:check` | FAIL — checkout-wide formatting warnings in 765 files, including many untouched files. Only task files were formatted. |
| `pnpm test:config` | FAIL — one remaining newline-sensitive RTL fixture mutation. The two Windows path failures in the touched bundler tests were corrected and its seven tests pass. |
| `pnpm test:ci-fixtures` | FAIL — Windows child-process invocation failure followed by `undefined.trim` in `scripts/check-ci-fixtures.mjs:183`. |
| `pnpm exec playwright test --project=component --max-failures=1` | BLOCKED — existing warm-server command uses POSIX inline environment assignments, rejected by Windows command execution. |
| Same Playwright command for `e2e`, `a11y`, `i18n`, `visual` | BLOCKED — same server-start failure, before browser assertions; no browser pass claimed. |
| Live booking/completion browser journeys | NOT RUN — shared server-start blocker; source/DB tests are not a substitute. |
| Live provider integration gate | N/A — not yet implemented, owned by issues #19–#23, as recorded in source CI. Real Resend/Meta delivery was not tested. |
| Live GitHub App provisioning | N/A — not yet implemented, owned by issue #31; unit tests do not establish installation/runtime-secret evidence. |
| Customer-attachment byte-level backup/restore gate | N/A — not yet implemented, owned by issue #39; attachments remain deferred. |
| Independent post-fix model review | UNAVAILABLE — Astra hit the subscription-sharing usage limit; Claude failed after repeated API errors. Neither attempt is a passed review. |

Initial Docker, CLI-wrapper and database-fixture failures were resolved before
the final passing database gates. The isolated stack was stopped after
verification; its synthetic data/volumes are retained for inspection. Docker
and existing unrelated local stacks were left running.

## Remaining risks and operational handoff

The source remediation is verified locally but is **not a release-ready claim**:
the broader failed/blocked gates and independent review still need resolution.
No real provider acceptance/delivery or production privacy conclusion follows
from these tests. Privacy/retention obligations require independent legal review.

Production must apply the forward migrations, set runtime-only
`NOTIFICATION_DELIVERY_ENCRYPTION_KEY`, deploy the regenerated workers and apply
the central scheduler. Keep encryption keys stable throughout active retries;
the current implementation has no multi-key rotation keyring. Erasure cannot
retract a request already handed to an external provider. See
[notification delivery](notification-delivery.md) for rollout, key operations,
authority, expiry, privacy and the narrow check-to-handoff race.

Committed contract versions from `platform-contract.json` are unchanged:
`whiteLabelVersion = 0.1.0`, `configSchemaVersion = 3`,
`backendContract = { min: 1, max: 1 }`.
