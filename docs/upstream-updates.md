# Upstream Updates

Purpose: define how a white-label release is cut, how it reaches an instance, what compatibility it guarantees, and how it is rolled out or rolled back.

Authoritative source: §10.5, §10.6, §10.7, §21.4, §21.5, §12.3 of [the architecture spec](../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md).

Related: [docs/README.md](./README.md) · [architecture](./architecture.md) · [glossary](./glossary.md) · [engineering rules](./engineering-rules.md) · [security and privacy](./security-and-privacy.md) · [release scope](./release-scope.md) · [customization boundaries](./customization-boundaries.md) · [instance docs contract](./instance-docs-contract.md) · [local setup](./local-setup.md) · [runbooks](./runbooks.md) · [references](./references.md) · [ADRs](./adr/README.md)

---

## 1. Rule zero: instances never run migrations

An instance repository can **never** run a shared production database migration. Only the private, serialized platform release pipeline may do that.

This is restated in three places on purpose — here, in [customization boundaries](./customization-boundaries.md), and in every generated instance `AGENTS.md` — because it is the single most damaging thing an instance-side change could attempt.

---

## 2. Cutting a release

The distribution pipeline runs in the private source monorepo. Every step is a gate.

| # | Step | Gate |
| --- | --- | --- |
| 1 | Merge source changes to the private monorepo | Normal review |
| 2 | Run unit, contract, RLS, integration, E2E, accessibility, security, and export-leakage checks | All must pass |
| 3 | Build a sanitized distribution tree from an explicit **allowlist** | Never a denylist |
| 4 | Scan the exported tree **and its history** for secrets, Platform Admin symbols, control-plane code, migrations, and internal docs | Any hit blocks the release |
| 5 | Commit and tag as `tenant-runtime-vMAJOR.MINOR.PATCH`, publish a signed manifest | Manifest carries checksums, backend contract range, migration dependencies, feature changes, upgrade notes |
| 6 | Test against pristine, lightly customized, and heavily customized reference instances | All three, every release |
| 7 | Mark `canary`, then `stable` once fleet telemetry is acceptable | Promotion is a decision, not a timer |
| 8 | Upgrade bot opens PRs from each instance's recorded version to the target | See §3 |

**The sanitized distribution lives in a separate repository with its own Git history.** A branch inside the source monorepo is not a safe boundary if that history ever contained Platform Admin code or secrets.

---

## 3. How an instance receives an upgrade

The upgrade bot opens a pull request against the instance repository. Fleet updates are **never** direct-pushed to default branches.

An upgrade PR must:

- State the old and new white-label versions and the compatible backend contract range.
- Touch only upstream-owned paths, unless a migration guide explicitly calls for an instance configuration change.
- **Preserve `instance/**` and supported extension files.**
- Run, for both Client and Dashboard: build, type, unit, contract, E2E, accessibility, snapshot, and forbidden-import checks.
- Flag any config-schema change and generate an exact before/after migration for it.
- Produce preview deployments for Client and Dashboard.
- Require human approval for major releases, authentication or payment changes, and any conflict.
- Report deploy and rollback status back to Platform Admin.

Config-schema upgrades include a checked-in, exact migration guide. The first
such migration, from the bootstrap brand surface to the complete semantic token
contract, is [config schema 1 → 2](./config-migrations/0001-to-0002-brand-tokens.md).

The reusable instance workflow receives the target environment's current
`backend_contract_version` as a required, non-secret numeric input. It compares
that value with the instance's distributed `platform-contract.json` and fails
before build or promotion when the version is outside the inclusive range. The
private source release validator and `control-plane/` tree are deliberately not
distributed just to perform this check.

### Config-only vs extended-code instances

| Instance tier | Upgrade path |
| --- | --- |
| Config-only | Automated PR, automated checks, low-touch merge |
| Extended code | Manual review against a conflict budget, resolved by hand, different update/support SLA |

If a customization keeps causing conflicts across instances, the fix is upstream: promote it into a feature flag, design token, content field, or formal extension slot. Do not widen what instances may edit.

---

## 4. Compatibility range contract

Each instance declares its position explicitly. The authoritative values always come from the repository-root `platform-contract.json`; documentation never supplies example version numbers that can be mistaken for the current contract.

| Field | Meaning |
| --- | --- |
| `whiteLabelVersion` | The `tenant-runtime-*` release this instance is built from |
| `configSchemaVersion` | The schema its `instance/` configuration conforms to |
| `backendContract.min` / `.max` | The inclusive range of backend contract versions this build can talk to |

The backend exposes **stable versioned views and RPCs** — for example `availability_v1`, `create_booking_v1`. Application code targets those contracts, never raw shared tables.

### Expand/contract, always

Database change order is fixed:

1. **Expand** — add the new structure.
2. **Backfill / dual-write.**
3. **Deploy all supported applications** across the fleet.
4. **Observe.**
5. **Contract** — remove the old structure only after the deprecation window closes.

A backend release may not narrow the supported contract range while any live instance still declares dependence on it. Contract mismatch is a rollout pause condition (§6).

---

## 5. The N / N-1 Client + Dashboard pairing rule

Client and Dashboard build from the **same Git commit**, but promoting them is two separate external operations and is **not atomic**. Between the two promotions, the fleet is briefly running mixed versions.

Therefore:

- The backend must remain compatible with **both the current (N) and previous (N-1)** application versions during any promotion.
- Wait for **both** deployment checks to pass, then promote both.
- Record the two production deployment IDs as **one logical release pair**. Health, rollback, and audit all operate on the pair, never on a single surface.
- A Client promoted without its paired Dashboard (or vice versa) is an incident state, not a partial success.

---

## 6. Rollout rings

Releases move outward through rings. A ring is entered only after the previous ring is healthy.

| Ring | Population |
| --- | --- |
| 1 | Internal and demo tenants |
| 2 | Canary tenants |
| 3 | Small production batches |
| 4 | Remaining config-only fleet |
| 5 | Extended-code tenants, after manual conflict resolution |

Rollout pauses **automatically** on:

- Build failures
- Smoke-test failures
- Error-rate or latency regression
- Backend contract mismatch
- Unusual booking or payment error patterns

Never direct-push fleet updates to default branches, at any ring.

---

## 7. Rollback

On failure:

1. **Stop or pause the rollout ring.**
2. **Redirect both domains to the last healthy pair**, where safe.
3. **Verify backend compatibility and health** for that pair.
4. **Create a source revert or forward-fix** so Git remains authoritative.

### What rollback does not do

- It does not undo external API actions already performed (emails sent, payments captured, calendar events written).
- It does not undo destructive data migrations — which is exactly why database change uses expand/contract and forward repair, never a "roll the schema back" reflex.
- A previous deployment retains its **old build-time environment values**; a rollback that depends on a newer env var will not behave as expected. Check the pair's env assumptions before redirecting.

Incident procedure and on-call steps live in [runbooks](./runbooks.md).

---

## 8. Agent workflow after an instance fork is created

The generated instance is designed so that the safe path is also the easiest path.

1. Platform Admin creates the logical fork and commits generated configuration and docs.
2. A human gives the coding agent a focused request and points it at the repository `AGENTS.md`.
3. The agent reads the instruction pack, records its assumptions, and **changes configuration first** — see [customization boundaries](./customization-boundaries.md).
4. The agent runs the exact verification matrix and produces Client and Dashboard preview deployments.
5. A human checks brand fidelity, booking correctness, RTL, mobile, and accessibility — see [design system](./design-system.md).
6. The approved pull request merges; Platform Admin records the deployment version and health.
7. Future platform releases arrive as **separate upstream-update pull requests** — never mixed into a customization PR.

Agent instructions guide behavior; they are not a security control. Enforcement is CI, CODEOWNERS, rulesets, and RLS — see [security and privacy](./security-and-privacy.md).

---

## 9. Quick reference

| Question | Answer |
| --- | --- |
| Can an instance run a migration? | No. Never. Platform pipeline only. |
| Does an upgrade PR touch `instance/`? | Only when a migration guide explicitly requires it, with a generated before/after. |
| What survives an upgrade? | `instance/**` and supported extension files. |
| Who approves a major/auth/payment upgrade? | A human, always. |
| What is the unit of release? | The Client + Dashboard pair from one commit, recorded as one logical release pair. |
| What backend versions must work during promotion? | Current and previous — N and N-1. |
| Where do release contents get recorded? | The signed release manifest, plus [release scope](./release-scope.md). |
