# Knowledge pack — index and coverage map

The authoritative specification is
[`WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md`](../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md)
(§1–§34). It is retained **intact**. This pack splits it into focused documents
so a person or a coding agent can find product, design, data, security, testing,
release, and operational requirements without reading 1,900 lines. Where a
document and the specification disagree, the specification and any **Accepted**
ADR win, and the drifted document must be fixed in the same change.

Agents: read [`../AGENTS.md`](../AGENTS.md) first. It is the contract.

## Start here

| I need to… | Read |
| --- | --- |
| Understand what we are building and for whom | [product-vision.md](product-vision.md) |
| Use a term correctly (tenant ≠ brand ≠ instance) | [glossary.md](glossary.md) |
| Know exactly how a booking behaves, step by step | [journeys.md](journeys.md) |
| Know what is in v1 versus deferred | [release-scope.md](release-scope.md) |
| Understand the system shape | [architecture.md](architecture.md) |
| Write code that will be accepted | [engineering-rules.md](engineering-rules.md) |
| Run it locally / know the CI gates | [local-setup.md](local-setup.md) |
| Identify an environment or release the shared backend | [environments.md](environments.md) |
| Build UI, tokens, Arabic/RTL, accessibility | [design-system.md](design-system.md) |
| Upgrade an older instance brand schema | [config-migrations/0001-to-0002-brand-tokens.md](config-migrations/0001-to-0002-brand-tokens.md) |
| Know the security and privacy rules | [security-and-privacy.md](security-and-privacy.md) |
| Know what a tenant may customize | [customization-boundaries.md](customization-boundaries.md) |
| Ship a release or upgrade an instance | [upstream-updates.md](upstream-updates.md) |
| Know what a generated instance repo must contain | [instance-docs-contract.md](instance-docs-contract.md) |
| Operate, monitor, back up, recover | [runbooks.md](runbooks.md) |
| Know which packages ship to an instance, and which contract versions apply | [adr/0011-distribution-allowlist-and-contract-versions.md](adr/0011-distribution-allowlist-and-contract-versions.md) |
| Know who owns an instance repository and what each support tier promises | [adr/0012-instance-ownership-and-support-tiers.md](adr/0012-instance-ownership-and-support-tiers.md) |
| Find or record a decision | [adr/README.md](adr/README.md) |
| Check an external source | [references.md](references.md) |

## Decisions at a glance

Full table in specification §2. The load-bearing ones:

| Area | Decision |
| --- | --- |
| Product model | Multi-tenant SaaS, optional dedicated deployments |
| Frontend | Three independent Next.js App Router applications |
| Backend | One Supabase project: Postgres, Auth, Storage, Realtime, Edge Functions, Queues, Cron |
| Tenancy | Shared schema, mandatory `tenant_id`, RLS as the isolation boundary |
| Booking writes | Atomic database functions/RPCs — never the browser |
| Distribution | Sanitized distribution repo + managed logical instance repos |
| Customization | Config-first, extension points second, core edits exceptional |
| Migrations | Central platform pipeline only |
| Email | Outbox → Supabase Queue → Edge Function → Resend |
| Payments | Provider adapter; tenant is merchant of record; Stripe Connect first |
| Deployment | Two Vercel projects per instance + one private Platform Admin project |
| Languages | English and Arabic, including semantic RTL |
| Accessibility | WCAG 2.2 AA target |
| Recovery | Postgres PITR **plus** a separate Storage-object backup plan |

## Coverage map — specification §1–§34

| § | Specification section | Lives in |
| --- | --- | --- |
| 1 | Executive recommendation | [product-vision.md](product-vision.md), [architecture.md](architecture.md) |
| 2 | Decisions at a glance | this file, [adr/README.md](adr/README.md) |
| 3 | Product definition | [product-vision.md](product-vision.md), [glossary.md](glossary.md), [release-scope.md](release-scope.md) |
| 4 | Users, roles, and permissions | [product-vision.md](product-vision.md), [security-and-privacy.md](security-and-privacy.md) |
| 5 | The three applications | [product-vision.md](product-vision.md), [architecture.md](architecture.md) |
| 6 | Core user journeys | [journeys.md](journeys.md) |
| 7 | State models | [journeys.md](journeys.md) |
| 8 | Functional scope by release | [release-scope.md](release-scope.md) |
| 9 | System architecture | [architecture.md](architecture.md), [environments.md](environments.md) |
| 10 | Monorepo and code ownership | [architecture.md](architecture.md), [customization-boundaries.md](customization-boundaries.md), [upstream-updates.md](upstream-updates.md) |
| 11 | White-label customization contract | [customization-boundaries.md](customization-boundaries.md), [design-system.md](design-system.md) |
| 12 | AI agent instruction pack | [instance-docs-contract.md](instance-docs-contract.md), [`../AGENTS.md`](../AGENTS.md) |
| 13 | Next.js application architecture | [architecture.md](architecture.md), [engineering-rules.md](engineering-rules.md), [design-system.md](design-system.md) |
| 14 | Supabase backend architecture | [architecture.md](architecture.md) |
| 15 | Availability and booking correctness | [architecture.md](architecture.md), [engineering-rules.md](engineering-rules.md) |
| 16 | Async jobs, Realtime, Storage, secrets | [architecture.md](architecture.md), [security-and-privacy.md](security-and-privacy.md) |
| 17 | Resend email architecture | [architecture.md](architecture.md) |
| 18 | Payments and commerce | [architecture.md](architecture.md); merchant model → [ADR-0003](adr/0003-merchant-of-record-and-payments.md); money representation → [ADR-0002](adr/0002-region-currency-and-money-representation.md) |
| 19 | Calendar integrations | [architecture.md](architecture.md), [release-scope.md](release-scope.md) (two-way is Phase 2) |
| 20 | Tenant API and webhooks | [architecture.md](architecture.md), [release-scope.md](release-scope.md) (Phase 2) |
| 21 | Provisioning and fleet management | [architecture.md](architecture.md), [upstream-updates.md](upstream-updates.md) |
| 22 | Security architecture | [security-and-privacy.md](security-and-privacy.md) |
| 23 | Privacy, data governance, compliance | [security-and-privacy.md](security-and-privacy.md), [ADR-0008](adr/0008-privacy-retention-and-support-access.md) |
| 24 | Testing and release quality | [engineering-rules.md](engineering-rules.md), [local-setup.md](local-setup.md), [environments.md](environments.md) |
| 25 | Observability, SLOs, operations | [runbooks.md](runbooks.md) |
| 26 | Backup and disaster recovery | [runbooks.md](runbooks.md) |
| 27 | Analytics and product measurement | [runbooks.md](runbooks.md), [ADR-0009](adr/0009-analytics-definitions.md) |
| 28 | Delivery roadmap | [release-scope.md](release-scope.md) |
| 29 | Major risks and mitigations | this file, below |
| 30 | Decisions required before implementation | [adr/README.md](adr/README.md) — every numbered ADR from [0001](adr/0001-lighthouse-vertical-and-v1-scope.md) onward is written and Accepted |
| 31 | Production acceptance criteria | [release-scope.md](release-scope.md) |
| 32 | Recommended build order for tickets/epics | [release-scope.md](release-scope.md) (mapped to milestones M0–M8) |
| 33 | Research basis and official references | [references.md](references.md) |
| 34 | Final architecture position | this file, below |

## Risk register (§29)

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Horizontal scope explosion | Slow, incoherent product | Lighthouse vertical; compose orthogonal rules; stage modules |
| White-label code divergence | Upgrades become manual projects | Config-first tiers, extension contracts, upstream promotion |
| Repository/project fleet cost | Build and API limits, operator load | Rollout rings, quotas, config-only shared mode threshold |
| Shared-database isolation bug | Cross-tenant exposure | RLS + grants + composite keys + negative tests |
| Shared-database noisy neighbor | Latency or outage across tenants | Index and measure, quotas, bounded queries, dedicated escape hatch |
| Shared restore blast radius | All tenants affected | PITR, isolated restore, tenant exports, dedicated tier |
| Double booking | Revenue and trust loss | DB exclusion constraints, locked capacity, idempotency, race tests |
| Provider eventual consistency | Paid-but-unconfirmed states | Inbox/outbox, separate state machines, reconciliation queues |
| Shared Resend reputation | Fleet-wide deliverability failure | Sending subdomains, suppression, health monitoring, BYOK tier |
| Wrong merchant-of-record model | Regulatory and financial exposure | Decide before coding; tenant-contracted PSP default; legal review |
| Agent introduces unsafe customization | Security or upgrade breakage | Generated contract plus enforceable CI, rulesets, CODEOWNERS |
| Non-atomic Client/Dashboard deploy | Temporary version mismatch | N/N-1 contracts, paired release records, checked rollback |
| Arabic/RTL treated as a skin | Broken critical flows | Semantic RTL foundation and full flow tests from sprint one |

## Architecture position (§34)

One product platform with three sharply separated interfaces, a centralized
transactional booking and data layer, a private control plane, and a
deliberately narrow white-label distribution surface. Two decisions protect the
business above all others:

1. **Database-owned booking and tenant invariants** — RLS, composite tenant
   relationships, atomic holds and allocations, idempotency, audited state
   machines.
2. **Config-first managed logical forks** — instance freedom where it creates
   customer value, with a sanitized upstream, explicit contracts, generated
   agent instructions, enforceable customization boundaries, and fleet-safe
   update pull requests.

If tenant forks can change database rules, if service keys enter white-label
repositories, or if each brand rewrites core booking code, the platform becomes
difficult to secure and nearly impossible to update at scale.

## Point-in-time facts

Vendor limits, pricing, feature availability, and any legal or regulatory
statement in this repository are **point-in-time** and must be revalidated at
implementation and procurement time. Nothing here is legal advice or a
compliance claim. See [references.md](references.md).
