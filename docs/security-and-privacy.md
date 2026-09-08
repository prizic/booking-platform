# Security and Privacy

Purpose: the non-negotiable security invariants, control checklists, secret-handling rules, and data-governance model every change in this repository is measured against.

Authoritative source: §22, §23, §4.3, §16.6 of [the architecture spec](../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md)

Related: [docs index](./README.md) · [architecture](./architecture.md) · [glossary](./glossary.md) · [engineering rules](./engineering-rules.md) · [customization boundaries](./customization-boundaries.md) · [release scope](./release-scope.md) · [upstream updates](./upstream-updates.md) · [references](./references.md) · [ADRs](./adr/README.md)

---

## 1. Security invariants

Non-negotiable. A change that violates one of these is rejected regardless of who requested it. Changing an invariant requires an ADR ([ADRs](./adr/README.md)), not a pull-request comment.

| # | Invariant |
| --- | --- |
| SI-1 | Tenant isolation is enforced in the database. It is never inferred from UI routing, hostname, or client state. |
| SI-2 | Every exposed table has RLS enabled and least-privilege grants. |
| SI-3 | Every sensitive mutation rechecks current authorization server-side, at execution time. |
| SI-4 | Service/secret keys never enter white-label applications or any instance repository. |
| SI-5 | Booking and capacity correctness is atomic and database-enforced, never application-serialized. |
| SI-6 | Provider webhooks are raw-body signature-verified, deduplicated, and processed asynchronously. |
| SI-7 | Prices, tax, policies, and customer consent are versioned and snapshotted onto the records they govern. |
| SI-8 | Production data and secrets never appear in previews, test fixtures, AI prompts, or logs. |
| SI-9 | Platform Admin requires MFA/AAL2. Tenant owners require step-up auth for sensitive changes. |
| SI-10 | Support access is explicit, scoped, expiring, bannered, and audited. Silent impersonation does not exist. |

Enforcement pointers: SI-1/SI-2 are tested by the RLS matrix, SI-5 by the concurrency cases, SI-4/SI-8 by the export-leakage test. See [engineering rules](./engineering-rules.md).

---

## 2. Authentication and session

| Principal | Identity source | Rules |
| --- | --- | --- |
| Customer (account) | Supabase Auth | Standard session; verification and password recovery handled by Auth. |
| Customer (guest) | Signed manage link | Link is scoped, expiring, and revocable. Sensitive views/actions additionally require email OTP. As implemented in issue #14: only the token digest is stored, refusals are indistinguishable from one another, every use is rate limited and audited, and any booking state change revokes every outstanding link. |
| Tenant staff | Supabase Auth + membership row | Membership is current database state, so revocation takes effect immediately without waiting for a role-bearing JWT to expire. |
| Tenant owner | Supabase Auth + MFA | Step-up (recent auth + MFA) required for the sensitive-action list below. |
| Platform operator | Separate operator roles | MFA/AAL2 mandatory. Documented break-glass process, audited. |

Rules:

- Never encode authorization in a JWT claim that outlives the underlying membership. Read membership at the point of use.
- Tenant switching is always explicit for multi-tenant staff users. No implicit "last tenant" resolution for a mutation.
- The selected-tenant cookie or form value is a convenience selector, not an authorization credential. The database rechecks that selection against the actor's current membership, capability bundle, and location scope on every protected path.
- Step-up auth is required for owner transfer, payout/merchant changes, and provider-key changes. Tenant administrators use recent authentication plus MFA for authorized export/correction work; customers use an intent-scoped link plus email OTP for export, correction, deletion, and restriction requests.
- Never trust a hostname, URL parameter, form value, JWT user metadata, or hidden UI control as authorization.

The concrete request-to-database authority flow is recorded in [ADR-0013](./adr/0013-tenant-context-and-live-authorization.md). Hostname resolution may select only an active verified routing context. It cannot add a membership or capability, and a changed host cannot revive a revoked membership. Missing, malformed, ambiguous, preview, and multi-tenant-without-selection contexts fail closed or enter an explicit safe selection flow.

---

## 3. Application controls

Applies to Client, Dashboard, and Platform Admin unless noted.

**Input and output**

- Server-side schema validation on every request body, parameter, and action payload.
- Output DTO minimization: return the fields the view needs, never a whole row by default.
- No customer PII in URL paths, query strings, analytics event properties, or client error payloads.

**Session and transport**

- SameSite, Secure, HTTP-only session cookies per Supabase/Next.js SSR guidance.
- Origin/CSRF protection for all state changes, matched to the route or action mechanism in use.
- HSTS, clickjacking defense, MIME-sniffing defense, restrictive referrer policy, restrictive permissions policy.

**Content and navigation**

- Strict CSP with nonces or hashes where required. Arbitrary tenant-supplied scripts are not permitted — see [customization boundaries](./customization-boundaries.md).
- Safe redirect allowlists and canonical hostname validation on every redirect target.

**Abuse and files**

- Rate limits keyed by IP, session, tenant, account, and action. Bot protection on public booking endpoints.
- Uploads: file type and size inspection, image decoding, quarantine, malware scan, non-executable serving, signed private URLs.

---

## 4. Database controls

- Composite tenant foreign keys and tenant-scoped unique constraints, so a cross-tenant reference cannot be represented at all.
- RLS and grant tests for every operation × principal combination (the RLS matrix).
- Separate exposed, application, and private schemas. Only the exposed schema is reachable by the API role.
- Current membership, role-permission, and location-scope rows are read at authorization time; an otherwise valid stale Auth session cannot preserve revoked authority.
- `SECURITY DEFINER` functions hardened (fixed `search_path`, explicit tenant checks) with execute grants revoked by default and granted deliberately.
- Migration pipeline serialized, reviewed, backed up before apply, and contract-tested against the previous application release.
- Append-only application audit events carrying: actor, effective actor, tenant, action, target, outcome, reason, request ID, timestamp, redacted diff.
- Selective pgAudit for privileged, DDL, and sensitive operations. Do not enable global statement logging that would capture raw sensitive parameters.

---

## 5. Secret handling

Storage locations, by purpose:

| Location | Holds | Never holds |
| --- | --- | --- |
| Vercel environment storage | App/runtime secrets and public configuration, scoped per project and environment | Anything needed only database-side |
| Supabase function secrets | Provider secrets used by Edge Functions | Values also exposed to the browser |
| Supabase Vault | Only secrets that genuinely need database-side access | Application-tier provider keys |
| Platform database | Encrypted secret *references* and fingerprints | Plaintext secrets, ever, including for display |
| Instance repository | Nothing | Any secret, in any form |

**Forbidden, without exception**

1. A Supabase service-role key or any provider secret in Client or Dashboard code, in a client bundle, or in a public environment variable.
2. Any secret in a tenant instance repository — source, config, fixtures, screenshots, commit history, or CI definition.
3. Any secret in this knowledge pack (`docs/**`).
4. Any secret in a generated AI instruction pack (`AGENTS.md`, `docs/WHITE_LABEL_AGENT_BRIEF.md`, and siblings). Generated files carry `schemaVersion`, `tenantId`, `baseRelease`, `generatorVersion`, and a content hash — and no credentials, provider tokens, production data, or unnecessary personal information.
5. Any secret, real customer data, provider token, or production dump inside an AI prompt or agent context.

**Naming rule for documentation**

Environment variables may be referred to *by name and purpose only*. Never write a value, and never write a realistic-looking placeholder token (no `sk_live_…`-shaped strings, no base64 blobs, no JWT-shaped examples). Write "unset" or "provided by the platform" instead.

| Variable | Purpose | Tier |
| --- | --- | --- |
| Supabase project URL | Points the app at its Supabase project | Public, safe in browser |
| Supabase publishable/anon key | Browser client, RLS-constrained | Public, safe in browser |
| Supabase service-role key | Trusted server/job access that bypasses RLS | Platform-side only. Never in Client, Dashboard, or an instance repo |
| Resend API key | Transactional email sending | Server-side only |
| Payment provider secret key | Server-side payment calls | Server-side only |
| Payment provider webhook signing secret | Raw-body signature verification | Server-side only |
| Calendar provider client secret | Google/Microsoft OAuth exchange | Server-side only |
| GitHub App private key | Minting installation tokens | Control plane only |
| Vercel API token | Project, env, and domain provisioning | Control plane only |

**Token lifecycle**

- Mint short-lived GitHub installation tokens per job, scoped to the smallest repository set, and never store them.
- Rotate provider credentials on a schedule and on any suspicion of exposure. Maintain last-used and last-rotated timestamps.
- Redact tokens, authorization headers, customer data, and webhook bodies from ordinary logs.

---

## 6. Supply chain and repository controls

| Control | Requirement |
| --- | --- |
| Branch protection | Protected branches/rulesets plus CODEOWNERS on the source monorepo and on generated instance repositories |
| Release integrity | Signed/attested distribution release manifests and immutable tags |
| Dependencies | Automated dependency updates and vulnerability scanning |
| Secrets | Secret scanning on push, plus scanning of exported history before an instance repository is handed over |
| CI | Reusable workflows pinned to a full commit SHA where practical |
| Installs | Lockfile required; frozen installs in CI |
| Provenance | SBOM and release provenance for enterprise readiness |
| Leakage | Export-leakage test proving Platform Admin code, private packages, and migrations are absent from any distributed instance |

Dependency additions require a license, maintenance, security, bundle-impact, and duplication check first — see [engineering rules](./engineering-rules.md) and [upstream updates](./upstream-updates.md).

---

## 7. Threat list to test explicitly

These are test cases, not aspirations. Each row must have a failing-before/passing-after test in the suite.

| # | Threat | Expected defense |
| --- | --- | --- |
| T-1 | Guess another tenant's UUID | RLS / composite relationship denies; returns no data, not an error that confirms existence |
| T-2 | Change Host header or tenant parameter | Verified domain resolves brand only; authorization still denies |
| T-3 | Use a stale, revoked session | Sensitive RPC reads current membership and denies |
| T-4 | Double-submit a booking | Database idempotency returns the original result |
| T-5 | Race a single slot | Exclusion constraint / locked capacity permits only the configured capacity |
| T-6 | Forge a payment, email, or calendar webhook | Raw-body signature verification fails before any processing |
| T-7 | Replay a valid webhook | Unique inbox ID makes processing idempotent |
| T-8 | Upload an active or malicious file | Quarantine, validation, scan, non-executable serving |
| T-9 | Tenant edits a local feature flag file | Backend entitlement still denies |
| T-10 | AI agent attempts a database migration | Instance repository lacks migration authority; CI rejects the path/import |
| T-11 | Support user browses silently | No support context means denial; a valid context is bannered and audited |

---

## 8. Data classification

Every field belongs to exactly one class. Each class carries: collection purpose, lawful basis/consent decision, access roles, encryption and secrets handling, retention, deletion or anonymization method, export format, logging rule, backup behavior, and provider/subprocessor mapping.

| Class | Examples | Access | Logging rule | Deletion method |
| --- | --- | --- | --- | --- |
| Public brand/catalog assets | Logos, service names, prices shown publicly | Anonymous read | Free to log | Delete with tenant |
| Tenant operational data | Schedules, resources, staff hours, policies | Tenant staff by role | Structured, no redaction needed | Delete on offboarding |
| Customer PII / contact data | Name, email, phone, address | Tenant staff by role; customer self | Never in URLs, analytics, or client errors | Delete or anonymize per request |
| Sensitive intake / notes | Intake answers, rendered consent text, free-text notes | Narrowest staff role; never analytics | Never logged, not even truncated | Hard delete on the sensitive-data clock |
| Authentication / security events | Sign-ins, MFA events, step-up outcomes | Security roles | Metadata only, never credentials | Retained per security retention, not business retention |
| Payment references and financial ledger | Provider object IDs, amounts, fees, refunds | Finance roles | IDs and amounts only, never card data | Retained for lawful financial evidence |
| Provider credentials / tokens | API keys, OAuth refresh tokens | No human read path | Never logged; redact authorization headers | Revoke at source, then delete |
| Audit and legal evidence | Append-only audit events, support sessions, minimal consent evidence (document/version, timestamp, rendered-text hash) | Security/legal roles | Is the log | Retain for the evidence period; never delete while a hold applies |

Terminology for these classes is defined once in the [glossary](./glossary.md).

---

## 9. Retention, export, deletion, and legal hold

**Lifecycle rules**

- Collect only data required for a declared purpose. A new field needs a purpose before it needs a column.
- Version consent and policy acceptance. Existing bookings keep the policy snapshot they were made under.
- Provide tenant and customer export, correction, deletion, and restriction workflows appropriate to applicable law.
- Deletion runs as an **idempotent job** across Postgres, Storage, Resend, and payment/calendar metadata. It inventories analytics to verify that only pseudonymous, timer-governed events exist; those events age out on their own 30-day/13-month clocks rather than being purged per request. Backups expire naturally rather than being surgically edited.
- Legal holds suspend deletion for identified records. A hold is explicit, recorded, and outranks any deletion request.
- Backup retention is tracked separately from business/legal retention. They are different clocks and must not be conflated in policy text.

**Tenant offboarding phases** (each is a distinct, reversible-until-the-next state)

1. Restrict new bookings.
2. Preserve safe access and export for the tenant.
3. Close the instance.
4. Delete primary data.
5. Retain only lawful audit and financial evidence.

---

## 10. Support access model

Silent impersonation is not implemented and must not be added.

A support session record contains: tenant, operator, reason, ticket/reference, approved scope, start time, expiry, and every action taken.

Rules:

- An unmistakable support-mode banner is displayed for the whole session.
- Credential and security changes are prohibited while in support mode.
- The audit trail is append-only.
- Absence of a valid support context is a denial, not a fallback to normal access (see T-11).
- Audit events record both actor and effective actor so a support action is attributable to the human, not the tenant.

---

## 11. PCI scope

- Prefer provider-hosted checkout, or provider-hosted / isolated payment components.
- Never collect card data in our own forms, and never write it to logs, analytics, or support tooling.
- Store payment *references* (provider object IDs) and ledger amounts only.
- Confirm the correct PCI SAQ type and scope with the acquirer and a QSA.

Architecture can reduce PCI scope. It cannot self-declare compliance, and this document does not.

---

## 12. Regional and legal review status

**First-release baseline: United States, USD.** See [release scope](./release-scope.md). Everything below the divider is future-region material carried forward from the spec and is explicitly **out of first-release scope**.

This document is architecture research, not legal advice. No statement here claims compliance with any law, standard, or scheme.

### 12.1 FUTURE-REGION — Saudi Arabia (out of first-release scope)

Not in scope for the first release. Building, enabling, or marketing any of the following **requires independent legal review with qualified Saudi counsel before any KSA launch**. Do not treat these notes as a checklist that, once ticked, produces compliance.

| Area | What must be reviewed before a KSA launch |
| --- | --- |
| PDPL / SDAIA | Controller vs processor roles, privacy notices, rights handling, retention, cross-border transfer mechanism, incident notification obligations, and data residency, mapped against the official Personal Data Protection Law and SDAIA rules. Requires independent legal review. |
| Payments / SAMA | Platform role, payment licensing, settlement, KYC, and refund responsibilities. Candidate providers must be validated against the official SAMA licensed payment-service-provider list. Requires independent legal review. |
| E-invoicing / ZATCA | E-invoicing obligations and which party bears them. Separate analysis from PDPL. Requires independent legal review. |
| Payment provider availability | As of the spec's research date, Saudi Arabia is not listed as a supported Stripe account country. If KSA becomes a target market, Stripe must not be the only provider; use tenant-contracted, SAMA-licensed providers. |
| Sector-specific (e.g. clinics) | A booking product for clinics may trigger healthcare-sector requirements. Do not infer healthcare compliance from ordinary SaaS controls. Requires independent legal review. |

Source links for all of the above live in [references](./references.md); they are deliberately not duplicated here so there is one place to keep them current.

### 12.2 Review status table

| Item | Status |
| --- | --- |
| US/USD first-release baseline | In scope. Payment, tax, and consumer-notice review still required before general availability. |
| KSA / PDPL / SAMA / ZATCA | Out of scope. Requires independent legal review before any KSA launch. |
| PCI SAQ determination | Open. Requires acquirer and QSA confirmation. |
| Subprocessor list and DPAs | Open. Requires independent legal review. |
| Healthcare / sector-specific verticals | Out of scope. Requires independent legal review. |
