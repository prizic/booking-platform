# ADR-0008: Privacy, retention, and support access

- **Status:** Accepted
- **Owner:** @SEIFSEIF4
- **Date:** 2026-09-04
- **Supersedes / Superseded by:** —

## Context

The lighthouse release stores three kinds of data that carry different obligations: the tenant's own operating data, the tenant's customers' personal data, and the platform's own security and financial evidence. §23 of the [architecture spec](../../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md) requires a classification with a per-class purpose, access rule, retention, deletion method, export format, logging rule, and backup behavior. §4.3 forbids silent impersonation and requires scoped, expiring, audited support sessions. §30 lists "data residency/retention", "support access approval", and "customer attachments" as decisions that must be made before implementation, not during it.

Three forces make this non-obvious.

1. **Deletion is not one system.** A customer record touches Postgres, Storage, Resend, the payment provider, calendar metadata, analytics, and backups. §23.2 requires deletion to be an idempotent job across all of them, with backups expiring naturally rather than being surgically edited. That means "deleted" has to be defined per store, not as a single boolean.
2. **Backups have a different clock than the business.** Backup retention and legal retention are separate policies (§23.2, §26). Conflating them produces a policy statement the system cannot honour.
3. **Storage has no restore path in MVP.** §26.2 states plainly that Supabase database backups contain Storage *metadata*, not object bytes — restoring the database does not restore deleted objects. Anything we accept as a customer upload is therefore data we cannot promise to recover.

The tenant is merchant of record and, for its own customers' data, the controller in the ordinary commercial sense; the platform operates the system on the tenant's behalf. Naming those roles precisely is a legal question, not an architecture question, and is called out below.

## Decision

### 1. Six data classes, one class per field

Every column, object, and event property belongs to exactly one class. The six classes plus the two evidence categories below cover all eight §23.1 categories: public brand and catalog assets, tenant operational data, customer PII, sensitive intake and notes, provider credentials and tokens, authentication and security events, payment references and financial ledger, and audit and legal evidence. **Internal** is an extra class §23.1 does not name, and §23.1's payment-reference and audit-evidence categories share one evidence row here because they carry the same retention obligation. The mapping is also the table in [security and privacy](../security-and-privacy.md) §8; this ADR is the shorter operating view.

| Class | Example fields | Access | Retention default (US/USD baseline) | On deletion request |
| --- | --- | --- | --- | --- |
| **Public** | Tenant logo, service name and description, public price, location address, opening hours | Anonymous read | Life of tenant; removed at offboarding step 4 | N/A — contains no personal data |
| **Internal** | Platform telemetry, `request_id`, latency and error samples, fleet version, deployment ID, aggregate funnel counts, analytics events, the daily `offered_minutes` materialization | Platform operators | Raw logs, traces, and raw analytics events **30 days**; aggregated metrics and the daily `offered_minutes` materialization **13 months** | N/A — pseudonymous only; not purged by a deletion request (see §3) |
| **Tenant-confidential** | Staff working hours, buffers, blackout periods, resource inventory, policy configuration, plan and entitlement state, tenant financial totals | Tenant staff by role; platform under an audited support session | Life of tenant + **30 days** after offboarding close | N/A — not the customer's data |
| **Personal** | Customer name, email, phone, address, booking history, manage-link tokens, email delivery events, payment provider customer reference | Tenant staff by role; the customer themselves via a verified manage link | **24 months** after the customer's last booking activity, then anonymized | Anonymized (see §3) |
| **Sensitive-personal** | Intake answers, rendered consent text, free-text staff notes on a booking, accessibility or health-adjacent disclosures | Narrowest staff role only; never analytics, never logs | **12 months** after the booking completes or is cancelled | Hard-deleted (see §3) |
| **Provider credentials and tokens** | Payment provider keys, calendar OAuth access and refresh tokens, Resend and other API keys, webhook signing secrets, and any token issued by a third party on the tenant's behalf | **No human read access.** Written and read by the service that uses them; never rendered in the Dashboard, an export, a log line, or a support session, in any role including break-glass | **Life of the connection.** Deleted when the connection is disconnected, the tenant offboards, or the credential is rotated — there is no independent timer | **Revoked at the source first**, then the stored reference is deleted. A deleted row whose token is still live at the provider counts as a failed deletion, not a completed one |

Two consequences follow from that last row. A new provider integration cannot be merged without naming the revoke call it will make on deletion — a stored token with no revoke path has no deletion method and is not shippable. And because these values are never readable, a lost credential is re-issued at the provider, never recovered from us.

The daily `offered_minutes` materialization that [ADR-0009](./0009-analytics-definitions.md) requires for utilization and fairness denominators is classed **Internal** and retained **13 months**, matching aggregated metrics: it is a per-day, per-resource minute count carrying no customer reference, and the 13-month window is what makes a year-over-year denominator computable.

Two categories sit outside the six classes because they are evidence, not content, and their retention is set by obligation rather than by product need:

| Evidence category | Example fields | Retention default | Note |
| --- | --- | --- | --- |
| Security events | Sign-in, MFA, step-up outcome, support-session start and expiry | **12 months** | Retained even when the related personal record is deleted; carries no intake or note content |
| Financial and audit evidence | Payment provider object IDs, amounts in minor units, fees, refunds, tax lines, append-only audit events, consent document key/version, acceptance timestamp, rendered-text hash | **7 years** | US baseline. The exact period is a legal determination — **requires independent legal review** |

Backup retention is a separate clock: the PITR window and daily backup retention purchased on the Supabase plan. It is never quoted as a business retention period, and a deletion request is satisfied against live systems plus natural backup expiry, never by editing a backup.

**Data residency.** All classes above live in one place: the shared Supabase project is hosted in a **US region**, and so are its backups, its Storage bucket, and the platform telemetry derived from it. There is no second region in the first release. Adding one — for a tenant, a jurisdiction, or a latency argument — is a **superseding ADR**, and it **requires independent legal review** before any production data exists in that region, not after. A region added first and reviewed later cannot be un-added, because the data is already there.

### 2. Who may request export or deletion, and how they are verified

| Requester | May request | Identity verification |
| --- | --- | --- |
| Customer, for their own record | Export, correction, deletion, restriction | Email OTP to the address on the booking, on a scoped manage link. A link alone is not sufficient for a deletion request |
| Tenant administrator, on a customer's behalf | Export and correction. **Not tenant staff, schedulers, or location managers** — they hold neither `customer.data.export_on_behalf` nor `customer.data.correct` ([ADR-0007](./0007-roles-and-capabilities.md)) | Step-up authentication plus the `customer.data.export_on_behalf` capability; the request is recorded against the administrator who originated it |
| Tenant owner or administrator | Full-tenant export, tenant offboarding | Step-up authentication (recent auth plus MFA) |
| Platform operator | Nothing on a customer's behalf | Operators execute requests; they do not originate them |

**SLA:** acknowledge within **5 business days**; complete within **30 calendar days** of verified identity. One **30-day** extension is permitted where the request is complex, and the reason is recorded on the request. Requests, verifications, extensions, and outcomes are audit events.

### 3. What is hard-deleted, anonymized, and retained

- **Hard-deleted:** intake answers, staff notes, rendered consent/free text, contact fields, manage-link tokens, email body metadata beyond aggregate delivery counts, and any Storage object keyed to the customer. Minimal consent evidence—document key/version, acceptance timestamp, and rendered-text hash—is audit evidence, not sensitive-personal content.
- **Anonymized:** the booking row itself. The customer reference is replaced with a non-reversible tombstone identifier; timestamps, service, resource, duration, status, and money amounts survive. Utilization, cancellation, and no-show history therefore stay correct after a deletion, which is why deletion does not silently rewrite the tenant's reporting.
- **Retained:** financial ledger rows and payment provider references, refunds and disputes, tax lines, security events, and append-only audit events. These are retained on a stated lawful-evidence basis and carry no intake, note, or contact content.
- **Not touched at all: analytics events.** Analytics events are **pseudonymous** and classed **Internal**. A deletion request does **not** purge them. They carry no name, email, phone, or free text — only a tombstone-safe identifier and the event's own properties — and they age out on their own timers: raw events **30 days**, aggregates **13 months**. An implementer must not add analytics to the deletion job's store list; doing so would break the denominators [ADR-0009](./0009-analytics-definitions.md) requires to stay computable after anonymization, in exchange for deleting data that was never personal. If a property ever carries a direct identifier, that property is misclassified and the fix is to stop collecting it, not to extend the deletion job. §23.2 and [security and privacy](../security-and-privacy.md) list analytics among the stores the deletion job spans; that is read as "analytics must have a class and a timer", which it does, not as "analytics rows are purged per request", which they are not.

**Booking snapshots use three independently governed payloads.** [ADR-0006](./0006-policy-snapshot-rules.md) defines immutable-during-retention `terms_payload`, nullable `sensitive_payload`, and nullable `contact_payload`. Scheduled retention nulls sensitive content 12 months after completion/cancellation and contact content 24 months after the customer's last booking activity. A verified deletion request nulls both personal payloads immediately, subject to legal hold. Each operation stamps a payload-specific marker. Commercial terms and minimal consent evidence remain for the seven-year audit/financial period; after that timer, the retention job may delete the whole snapshot row when no legal hold applies.

The deletion job is idempotent, resumable, and reports per-store outcome. A store that cannot be reached leaves the request open rather than reporting success.

### 4. Legal hold outranks deletion

A hold is an explicit record carrying scope, requester, matter reference, start date, and review date. While a hold applies:

- The deletion job **skips** the held records and writes a skip reason; it does not fail, and it does not partially delete.
- Anonymization is also suspended — a hold that permitted anonymization would destroy the evidence it exists to preserve.
- Releasing a hold requires a named approver and is itself an audit event. Deletion of previously held records resumes on the next scheduled run.
- A hold cannot resurrect already-deleted data. Holds are placed forward, never retroactively.

### 5. Support access

Silent impersonation is not implemented and must not be added.

| Property | Rule |
| --- | --- |
| Default mode | **Read-only.** A support session grants no write capability by default |
| Reason | Mandatory free-text reason plus a ticket or incident reference. No reason means no session |
| Expiry | Default **4 hours**, hard maximum **24 hours**. Expiry is enforced server-side; there is no extend-in-place, only a new session with a new reason |
| Visibility | An unmistakable support-mode banner for the whole session, in both English and Arabic |
| Audit | Append-only. Every action records actor **and** effective actor, so it is attributable to the human operator, not to the tenant |
| Write access | Requires step-up authentication **and** approval by a second platform operator. Four eyes, recorded on the session |
| Prohibited in any mode | Credential changes, MFA changes, payout or merchant changes, provider key changes, and export of sensitive-personal data |
| Break-glass | A separate, alarmed path. It pages on-call on use, notifies the tenant owner within **24 hours**, and is reviewed by a named approver within **5 business days**. It is not a faster support session |

Absence of a valid support context is a denial, not a fallback to ordinary access.

### 6. Customer attachments are excluded from MVP

**Customer-uploaded attachments are out of scope for the first release.** The reason is recoverability, not effort: per §26.2, Supabase database backups contain Storage metadata, not object bytes, so Postgres PITR does not restore a deleted Storage object. Accepting customer uploads would create a data class with a deletion story but no restore story — the worst possible combination, because an accidental bulk delete would be permanent and undetectable until a customer asked for the file.

Attachments become in-scope only when **all** of the following are true:

1. An independent, scheduled object backup or versioning strategy for `tenant-private-docs` is live.
2. Inventory checks reconcile application metadata, Supabase Storage metadata, and the backup destination.
3. A restore drill has recovered actual object **bytes** and their access policies, with recorded duration and data gap.

Until then, the tenant-private bucket described in §16.5 exists for platform-generated documents only, and the Client application exposes no customer upload control. Intake collects structured answers and free text, never files.

### 7. Architecture controls versus legal approval

These are two different jobs and this ADR does only the first.

| We build (architecture) | Counsel must sign off (legal) |
| --- | --- |
| Classification tags on every field; access enforced by RLS and capability | Whether each class's lawful basis and stated purpose are correct |
| Retention timers, the idempotent deletion job, and the anonymization function | The actual lawful retention period per class and per jurisdiction |
| Export in a machine-readable format, with identity verification and an SLA timer | Whether the export scope and the verification standard satisfy a data-subject right |
| Legal-hold suspension of deletion | When a hold must be placed, and by whom |
| Consent versioning and per-booking policy snapshots | The consent wording and whether consent is the right basis at all |
| Support-session scoping, expiry, banner, four-eyes write, and audit | Controller/processor roles, subprocessor disclosures, and the customer-facing privacy notice |
| Provider-hosted checkout so card data never enters our forms or logs | The correct PCI SAQ type and scope, confirmed with the acquirer and a QSA |

This document is architecture. It makes **no claim of compliance** with GDPR, PDPL, PCI DSS, SAMA rules, or ZATCA e-invoicing requirements. Architecture can reduce scope and evidence burden; it cannot self-declare compliance. Every row in the right-hand column **requires independent legal review** before the corresponding capability is enabled or marketed, and any non-US region is out of first-release scope entirely (see [security and privacy](../security-and-privacy.md) §12).

### Alternatives rejected

- **A single "PII / not PII" split.** Rejected: it gives intake notes and a public service name the same handling rule, which forces every ambiguous case back to a human.
- **Hard-deleting the booking row on request.** Rejected: it destroys the tenant's utilization and financial history and would make cancellation and no-show rates silently drift. Anonymization preserves the denominators defined in [ADR-0009](./0009-analytics-definitions.md).
- **Time-boxed full-access support sessions.** Rejected: read-only default with a four-eyes escalation costs one extra click in the rare write case and removes the common case entirely.
- **Shipping attachments with "best-effort" recovery.** Rejected: a documented inability to restore customer data is not a caveat we can put in a contract.

## Consequences

### Positive

- Every field has one owner, one retention timer, and one deletion method, so a new column cannot be added without answering the question.
- Deletion is safe to re-run, which makes it operable at 3am without a decision tree.
- Anonymization keeps analytics denominators intact, so privacy operations and reporting do not fight.
- Support access is auditable end to end; "who looked at this booking" has a single answer, including for break-glass.
- Excluding attachments removes an entire recovery, malware-scanning, and retention surface from the first release.

### Negative / cost

- Anonymization requires a tombstone identifier and a reversible-nothing guarantee, which is real engineering work in the booking schema.
- The four-eyes write path means support cannot fix a tenant's data alone, which will occasionally slow an incident.
- The 30-day SLA is a commitment that needs an operational owner and a queue, not just a job.
- Refusing attachments will be a lost-deal reason for some prospects, and will read as a missing feature rather than as a deliberate control.
- Retention timers touching seven stores mean a retention change is a multi-system change, not a config edit.

## Revisit triggers

- An independent object backup for `tenant-private-docs` is live and a restore drill has recovered actual object bytes — attachments are then reconsidered.
- A second launch region is added, or any non-US personal data is processed in production.
- A regulator, counsel, or a customer contract states a retention period different from a default in the table above.
- A legal hold is placed for the first time, or a hold is found to have been bypassed by the deletion job.
- Break-glass is used more than once in a quarter, or any support session performs a write without recorded four-eyes approval.
- Deletion-request volume exceeds what the 30-day SLA can absorb manually.
- A new field is proposed that fits none of the six classes.
- A provider integration is proposed whose credential cannot be revoked at the source, leaving a stored token with no deletion method.

## References

- [Architecture spec](../../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md) — §4.3, §16.5, §22, §23, §26.2, §30
- [Architecture overview](../architecture.md)
- [Security and privacy](../security-and-privacy.md) — §8 classification, §9 retention, §10 support access, §12 regional review status
- [Glossary](../glossary.md) — support session, membership, capability
- [Release scope](../release-scope.md)
- [Runbooks](../runbooks.md) — deletion job, restore drills, incident procedure
- [ADR-0006: Policy snapshot rules](./0006-policy-snapshot-rules.md) — immutable-during-retention terms plus separately redactable sensitive/contact payloads
- [ADR-0007: Roles and capabilities](./0007-roles-and-capabilities.md) — `customer.data.export`, `customer.data.export_on_behalf`, `customer.data.correct`, `customer.data.delete`, `customer.data.restrict`
- [ADR-0009: Analytics definitions](./0009-analytics-definitions.md) — why anonymization must preserve denominators, and the `offered_minutes` denominator
- [ADR-0010: Deferred scope](./0010-deferred-scope.md) — attachments as deferred scope
- [References](../references.md) — vendor and regulatory sources, all point-in-time
