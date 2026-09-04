# ADR-0012: Instance repository ownership and support tiers

- **Status:** Accepted
- **Owner:** @SEIFSEIF4
- **Date:** 2026-09-04
- **Supersedes / Superseded by:** —

## Context

§30 of [the architecture spec](../../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md) lists sixteen decisions that must be made before implementation, each with a recommended default and a point in the build where it is needed. Two of them are still open, and both are needed now:

| §30 row | Recommended default | Needed by |
| --- | --- | --- |
| Instance repository ownership | Platform organization by default; transfer only under contract | Provisioner design |
| Config-only vs extended code plans | Both, with different support/upgrade SLA | Commercial design |

Neither has a document that answers it. The consequences are concrete:

**Ownership is a provisioning input, not a paperwork detail.** [architecture.md](../architecture.md) says the default distribution model is a "managed independent repo with release ancestry", and that the control plane records "GitHub org, installation, repository ID, default branch, ruleset state". The provisioner must know which organization to create a repository *in* before it can create one, and the answer determines whether the platform's GitHub App can install on it, whether rulesets can be enforced, whether CODEOWNERS is binding, and whether the upgrade bot can open a pull request at all. [customization-boundaries.md](../customization-boundaries.md) §2 states plainly that enforcement is "mechanical, not advisory" — CI, CODEOWNERS, and GitHub rulesets. Every one of those mechanisms is an administrative capability that follows repository ownership. A repository the platform does not own is a repository where none of the stated enforcement exists.

**The support tiers exist operationally but have no commercial half.** [customization-boundaries.md](../customization-boundaries.md) §2 defines *Config-only* and *Extended code*, and [upstream-updates.md](../upstream-updates.md) §3 defines their upgrade paths — automated PR and low-touch merge versus manual review against a conflict budget. Both documents then say the tiers have a "Standard SLA" and a "different update/support SLA" without ever saying what either one is. [customization-boundaries.md](../customization-boundaries.md) §1 Path 3 says moving to Extended code brings "a different update and support SLA"; a tier whose terms are unwritten is not a tier a salesperson can sell or an on-call engineer can defend.

Rollout ring 5 in [upstream-updates.md](../upstream-updates.md) §6 already treats extended-code tenants as a distinct population requiring manual conflict resolution, and [architecture.md](../architecture.md) already notes that one repository plus two Vercel projects per tenant is expensive for configuration-only tenants. The operational shape is settled. What is missing is what each tier promises, and what withdraws the promise.

This ADR closes both §30 rows. It does not restate the customization paths or the upgrade mechanics — those live in [customization-boundaries.md](../customization-boundaries.md) and [upstream-updates.md](../upstream-updates.md) and remain authoritative for *how* the work happens. This ADR adds only *who owns the repository* and *what each tier is owed*.

## Decision

### A. Instance repository ownership

1. Every instance repository is created in, and owned by, the **platform GitHub organization**, private, with the platform GitHub App installed at creation. This is the default and requires no negotiation. The tenant receives named collaborator or team access scoped to their own repository, never organization-wide access.

2. Platform ownership is what makes the stated enforcement real. The platform retains, and does not delegate: repository administration, branch protection and ruleset configuration, CODEOWNERS, required status checks, the pinned central reusable workflow, and the GitHub App installation the upgrade bot authenticates through. A tenant collaborator may open and merge pull requests within their policy, and may not alter any of the preceding.

3. **Transfer of an instance repository to a tenant-controlled organization happens only under an explicit, signed contract amendment naming the repository.** It is never a support request, a configuration option, or an operator convenience. Executing a transfer requires step-up authentication and produces an audit record, alongside the other sensitive actions in [security-and-privacy.md](../security-and-privacy.md) §2.

4. **Transfer forfeits, on the transfer date:**
   - **Automated upgrade pull requests.** The GitHub App installation is removed; the upgrade bot has no path to the repository and will not be granted one.
   - **The support tier.** Both tiers in §B require the platform to be able to inspect, reproduce, and land changes in the repository. Neither survives transfer.
   - **Distribution guarantees.** No future release is built, tested, or exported for the transferred tree. The release manifest, the reference-instance test matrix in [upstream-updates.md](../upstream-updates.md) §2 step 6, and the rollout rings no longer include it.
   - **Verification guarantees.** Instance CI is a pinned central reusable workflow the platform maintains. Once the repository is outside platform administration, the platform neither maintains nor vouches for the checks that run there.

5. **A transferred repository is treated as a fork the platform no longer updates.** It is a point-in-time copy at the release it held on the transfer date. Its shared history with the sanitized distribution repository is historical fact, not an ongoing relationship, and the platform makes no commitment to keep future releases mergeable into it.

6. Transfer does **not** transfer the backend. The Supabase project, the migrations, and the `api_v1` contracts remain platform-operated, so a transferred repository still talks to a platform backend through versioned contracts and is still bound by the backend contract range in [ADR-0011](./0011-distribution-allowlist-and-contract-versions.md) §C. Two consequences follow and are stated in the contract amendment before signature: RLS and tenant isolation continue to hold, so a transferred repository cannot exceed its own tenant scope no matter what its code does; **and** when the platform contracts a backend version out of the supported range under expand/contract, a transferred repository that has not been updated by its new owner stops working, with no upgrade pull request coming.

7. A transferred repository may not be transferred back into the platform organization and resume a tier. Re-entry means provisioning a fresh instance at a current release and migrating configuration, because the platform cannot attest to what changed while the repository was outside its administration.

### B. Support and upgrade tiers

8. Two tiers exist, and they are the two already defined in [customization-boundaries.md](../customization-boundaries.md) §2 — **Config-only** and **Extended code**. This ADR does not redefine what each may touch, nor the upgrade mechanics in [upstream-updates.md](../upstream-updates.md) §3; those documents remain authoritative. The tier is recorded per instance in the control plane as the "customization tier" field described in [architecture.md](../architecture.md) under Control plane, and it is the field the rollout rings read.

9. The commercial half, previously unwritten:

| | **Config-only** (Standard) | **Extended code** (Extended) |
| --- | --- | --- |
| Upgrade PR cadence | Opened within **5 business days** of a release reaching `stable` (ring 4). Security and payment-correctness patches: **2 business days**, ahead of the normal ring order where the ring gate allows. | Same cadence for *opening* the pull request. Merge is manual and scheduled with the tenant; the instance sits in ring 5 and is upgraded after config-only instances are healthy. |
| Conflict resolution | Platform responsibility. `instance/**` is preserved by the upgrade, so conflicts are a platform defect and are fixed upstream, not negotiated per tenant. | Split by path. The platform resolves conflicts in upstream-owned paths. **Conflicts inside tenant-modified files are the tenant's responsibility**, within the conflict budget recorded in that instance's `.platform/customization-policy.json`. The platform advises; it does not rewrite tenant code. |
| Response targets (first substantive response, business hours) | P1 booking or payment broken for this instance: **4 business hours**. P2 a feature degraded, workaround exists: **1 business day**. P3 question or cosmetic: **3 business days**. | P1: **8 business hours**. P2: **2 business days**. P3: **5 business days**. The gap is diagnosis cost — a modified tree must be reproduced against a pristine instance before any fault can be attributed. |
| Reproduction requirement | None. | Before any P1 or P2 is accepted, the platform reproduces on a pristine instance at the same release. **If it does not reproduce, the fault is the tenant's modification** and the response target no longer applies. |

10. **What voids a tier** — in every case the instance drops to best-effort, is removed from automated upgrade pull requests, and is paused out of the rollout rings until the condition is corrected:

| Condition | Applies to |
| --- | --- |
| A change outside `instance/**` without the recorded platform-owner approval required by [customization-boundaries.md](../customization-boundaries.md) §1 Path 3 | Config-only — this is also the event that *moves* the instance to Extended code, at the platform's option, rather than simply voiding it |
| A change to any path forbidden at every tier — auth, tenant resolution, booking transactions, payment verification, RLS bypass, service-role usage, migrations | **Both.** This is not a tier question; it is an [engineering-rules.md](../engineering-rules.md) "never do these" violation and a security event |
| Force-push to the default branch, or disabling required status checks, rulesets, or CODEOWNERS | Both |
| Unpinning or replacing the central reusable workflow that instance CI calls | Both |
| Exceeding the recorded conflict budget without a renegotiated budget | Extended code |
| Falling more than **two `stable` releases** behind, or leaving an upgrade pull request unmerged past that point | Both. The instance is unsupported until it catches up, because the platform tests upgrades from supported versions, not from arbitrary ones |
| The instance declaring a `backendContract` range the platform no longer supports | Both. Contract mismatch is already an automatic rollout pause in [upstream-updates.md](../upstream-updates.md) §6 |
| Repository transfer under §A | Both — the tier ends rather than voids |

11. A voided tier is restored by correcting the condition and merging the outstanding upgrade pull requests. Voiding is a state, not a penalty, and it is recorded in the control plane's operational state alongside the rollout ring so it is visible before a release is promoted rather than discovered during one.

12. **Pricing is out of scope for this ADR and for this repository.** What a tier costs, how it is packaged, which tier a given contract includes, and what an overage is worth are **business decisions, not architectural ones**. They are settled in the commercial contract. Nothing in this repository — no configuration file, no control-plane field, no feature flag — is the source of truth for price. The architectural commitment is only that the two tiers are mechanically distinguishable, that the distinction is recorded per instance, and that the operational terms above are what each tier buys.

### Alternatives rejected

- **Tenant-owned repositories by default.** Rejected: it inverts every enforcement mechanism the platform depends on. Rulesets, CODEOWNERS, required checks, and the App installation are all administrative capabilities that follow ownership, so a tenant-owned default would make [customization-boundaries.md](../customization-boundaries.md) §2's "mechanical, not advisory" claim false on day one, and the upgrade bot would need standing write access into an organization the platform does not control.
- **Never transfer, at any price.** Rejected: source-code custody is a real procurement requirement for some enterprise buyers, and refusing it outright loses those deals for a reason that is contractual rather than technical. Transfer is safe precisely because the backend stays platform-operated (clause 6) — the isolation model does not depend on who owns the repository.
- **Transfer while keeping upgrade pull requests as a paid add-on.** Rejected: the platform would be opening pull requests against a tree it cannot test, cannot gate, and cannot roll back, and every conflict would arrive with no reproducible baseline. The reference-instance matrix in [upstream-updates.md](../upstream-updates.md) §2 step 6 is what makes an upgrade PR trustworthy, and it does not exist for a tree outside platform administration.
- **A single support tier for everyone.** Rejected: it prices either the config-only majority for conflict resolution they will never need, or the extended-code minority below the manual cost they actually generate. §30 already recommends both.
- **A third "lightly extended" middle tier.** Rejected as premature with zero live instances. The conflict budget in `.platform/customization-policy.json` is already a per-instance dial, which covers the middle ground without a third set of terms to maintain.
- **Define the SLA in the marketing site or the contract template only.** Rejected: on-call engineers and the upgrade bot read this repository, not the contract. Response targets that are not visible to the people who must meet them are decorative.

## Consequences

### Positive

- The provisioner has an unambiguous input: create in the platform organization, install the App, apply rulesets. Two §30 rows stop blocking provisioner and commercial design.
- Every enforcement mechanism the knowledge pack already claims — rulesets, CODEOWNERS, required checks, pinned workflows, upgrade PRs — is now backed by a stated ownership position rather than assumed.
- Transfer becomes a bounded, priced, auditable event with a written list of what it costs, instead of an ad-hoc concession negotiated under deal pressure.
- The tier a tenant is on now has consequences an engineer can act on at 2am and a salesperson can quote without inventing terms.
- The void conditions give the rollout rings a defensible reason to skip an instance, which is what stops one heavily modified tenant from stalling a fleet-wide release.

### Negative / cost

- Platform-owned repositories mean the platform carries the storage, seat, Actions-minute, and administrative cost of the entire fleet, and the repository-count and quota monitoring described in [architecture.md](../architecture.md) under Fleet economics becomes load-bearing sooner.
- Some enterprise buyers will read platform ownership as vendor lock-in and open the negotiation at transfer. Clause 4 makes the answer expensive rather than impossible, which is a harder conversation than either a flat yes or a flat no.
- The response targets in clause 9 are commitments with no measurement yet. Until an on-call rotation and a ticket system exist, "4 business hours" is an intention, and the first quarter of real tickets may show the extended-code targets are still too aggressive for a one-person on-call.
- The reproduction requirement will feel adversarial to extended-code tenants the first time a P1 does not reproduce and the response target lapses. That is the intended incentive, but it needs to be in the contract before it is invoked, not explained afterwards.
- "Two stable releases behind" is a threshold chosen without fleet data. If releases are frequent, it will void tiers on tenants who are merely slow rather than negligent.
- Transferred repositories become a small population the platform must still reason about for security advisories, even though it owes them no upgrades — a category with no automation behind it.
- Extended code being permanently in ring 5 means those tenants always receive fixes last, including security fixes, which is a real disadvantage of the tier that must be stated at sale rather than discovered.

## Revisit triggers

- The first transfer request is received, which tests whether clause 4's forfeiture list is contractually acceptable to a real buyer.
- A transferred repository requests a security fix, or falls out of the supported `backendContract` range under clause 6 — the "no updates" position meets its first concrete case.
- Any stated response target in clause 9 is missed twice in one quarter, or the first quarter of real support volume shows the targets do not match single-operator capacity.
- More than a defined share of live instances sit on Extended code, at which point the tier is the norm rather than the exception and its manual cost is the platform's main operating cost.
- An instance's tier is voided by clause 10 and the tenant disputes it, which tests whether the conditions are observable enough to be enforced.
- The fleet reaches the shared-deployment threshold in [architecture.md](../architecture.md) under Fleet economics — a config-only fleet mode with no per-tenant repository makes clause 1 partly moot for that population.
- A regulatory or procurement requirement makes tenant ownership of the code mandatory in a target market, rather than merely preferred.
- The conflict budget mechanism proves too coarse and a third tier is proposed again with evidence.

## References

- [Architecture spec](../../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md) — §10.3, §10.5–§10.8, §21, §30 (instance repository ownership; config-only vs extended code plans)
- [Architecture overview](../architecture.md) — managed logical fork model, control-plane state, fleet economics
- [Customization boundaries](../customization-boundaries.md) — §1 the three-path rule, §2 support tiers, §6 what is distributed
- [Upstream updates](../upstream-updates.md) — §3 upgrade paths per tier, §6 rollout rings, §7 rollback
- [Instance docs contract](../instance-docs-contract.md) — generated pack, `.platform/customization-policy.json`
- [Security and privacy](../security-and-privacy.md) — SI-9, SI-10, step-up authentication and audit
- [Engineering rules](../engineering-rules.md) — never-do rules, instance CI, compatibility rule
- [ADR-0011: Distribution allowlist, contract versions, and locale URLs](./0011-distribution-allowlist-and-contract-versions.md)
- [ADR-0008: Privacy, retention, and support access](./0008-privacy-retention-and-support-access.md)
- [ADR index](./README.md)
- [References](../references.md)
