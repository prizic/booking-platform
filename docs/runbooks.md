# Runbooks, Observability, and Recovery

Purpose: what we measure, what we promise ourselves, what to do when it breaks, and how we prove we can restore it.

Authoritative source: §25, §26, §27 of [the architecture spec](../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md)

Related: [docs index](./README.md) · [architecture](./architecture.md) · [glossary](./glossary.md) · [engineering rules](./engineering-rules.md) · [security and privacy](./security-and-privacy.md) · [customization boundaries](./customization-boundaries.md) · [release scope](./release-scope.md) · [upstream updates](./upstream-updates.md) · [references](./references.md) · [ADRs](./adr/README.md)

---

## 1. Correlation and telemetry

### 1.1 Correlation fields

Propagate these across app → RPC → job → provider call → webhook. A log line or span without the relevant subset is a defect.

| Field | Carried by |
| --- | --- |
| `request_id` | Every request, log line, and span |
| `tenant_id` | Everything tenant-scoped |
| `instance_id` | Everything deployment-scoped |
| `actor_id` | Authenticated actions (and `effective_actor_id` under support mode) |
| `booking_id`, `booking_revision` | Booking reads, mutations, and notifications |
| `outbox_event_id` | Async work and its downstream effects |
| Provider event / object ID | Payment, email, and calendar integrations |
| `release`, `deployment_id` | All of the above, for blast-radius attribution |

### 1.2 Logging rules

Structured fields, with redaction. **Never log**: tokens, raw authorization headers, full intake answers, payment data, manage-booking links. See [security and privacy](./security-and-privacy.md).

### 1.3 Monitored surfaces

| Surface | Signals |
| --- | --- |
| Apps | Client / Dashboard / Platform Admin availability, latency, errors, Web Vitals |
| Booking core | Availability and booking RPC p50/p95/p99, exclusion conflicts, idempotent replays, policy denials |
| Database | CPU, memory, disk, IOPS, connections, slow queries, lock waits, deadlocks |
| Async | Queue depth, oldest-event age, retry count, dead-letter count, Cron failures |
| Functions | Edge Function errors and timeouts, provider call latency |
| Delivery and money | Email delivery/bounce/complaint/suppression; payment pending age, webhook lag, reconciliation mismatches, refunds, disputes |
| Calendars | Sync lag, expired credentials/subscriptions, conflicts |
| Fleet | Provisioning step latency/failure, drift from GitHub/Vercel desired state, instance upgrade age, conflict rate, unsupported contract versions |
| Recovery | Backup/PITR freshness, Storage backup freshness, last restore drill |

---

## 2. SLO table

Design targets to validate with load tests and the purchased service tiers. **Not contractual promises.** Do not quote these to a customer without the validation and the tier behind them.

| Indicator | Initial target |
| --- | --- |
| Booking RPC availability | 99.95% monthly |
| Client / Dashboard availability | 99.9% monthly |
| Booking RPC latency | p95 < 500 ms, p99 < 1 s, excluding payment provider |
| Availability response | p95 < 800 ms for a bounded search window |
| Double bookings beyond configured capacity | Zero |
| Reminder queue lag | p99 < 60 s before intended send time |
| Provider webhook ingestion | p95 < 10 s to durable inbox |
| Config-only provisioning | < 10 minutes, excluding tenant DNS action |
| Critical incident acknowledgement | < 15 minutes during supported hours / on-call |

Error budgets are derived from these. **Fleet rollouts pause when an error budget is exhausted** — see [release scope](./release-scope.md) and [upstream updates](./upstream-updates.md).

---

## 3. Runbook index

Owners are placeholders until the on-call rotation exists.

| # | Runbook | Owner |
| --- | --- | --- |
| R-1 | [Slot contention / double-booking investigation](#r-1-slot-contention--double-booking-investigation) | TBD — assign at M6 |
| R-2 | [Payment succeeded but booking not confirmed](#r-2-payment-succeeded-but-booking-not-confirmed) | TBD — assign at M6 |
| R-3 | [Resend bounce/complaint spike or account suspension](#r-3-resend-bouncecomplaint-spike-or-account-suspension) | TBD — assign at M6 |
| R-4 | [Calendar credentials expired or sync loop](#r-4-calendar-credentials-expired-or-sync-loop) | TBD — assign at M6 |
| R-5 | [Queue backlog / dead-letter recovery](#r-5-queue-backlog--dead-letter-recovery) | TBD — assign at M6 |
| R-6 | [Database connection / lock pressure](#r-6-database-connection--lock-pressure) | TBD — assign at M6 |
| R-7 | [Tenant domain ownership / SSL failure](#r-7-tenant-domain-ownership--ssl-failure) | TBD — assign at M6 |
| R-8 | [Bad instance release and paired rollback](#r-8-bad-instance-release-and-paired-rollback) | TBD — assign at M6 |
| R-9 | [Suspected cross-tenant exposure](#r-9-suspected-cross-tenant-exposure) | TBD — assign at M6 |
| R-10 | [Compromised provider credential / GitHub App / Vercel token](#r-10-compromised-provider-credential--github-app--vercel-token) | TBD — assign at M6 |
| R-11 | [Database restore and Storage restore](#r-11-database-restore-and-storage-restore) | TBD — assign at M6 |
| R-12 | [Tenant export / deletion / legal hold](#r-12-tenant-export--deletion--legal-hold) | TBD — assign at M6 |
| R-13 | [Platform / tenant suspension and safe reactivation](#r-13-platform--tenant-suspension-and-safe-reactivation) | TBD — assign at M6 |

### R-1 Slot contention / double-booking investigation

- **Trigger:** Double-booking report, or exclusion-conflict rate above baseline.
- **First checks:** Booking RPC error/conflict rate by tenant; exclusion constraint still present on the affected table; capacity config for the service/resource; whether writes bypassed the booking RPC.
- **Mitigation:** Stop the bypass path first. Reduce capacity to safe value for the affected resource. Contact affected customers via the tenant, not directly.
- **Escalation:** Any confirmed double booking is a correctness incident → engineering lead + affected tenant owner. Add a regression case to the concurrency suite before closing.

### R-2 Payment succeeded but booking not confirmed

- **Trigger:** Payment pending age alert, or reconciliation mismatch.
- **First checks:** Provider event in the inbox? Signature verified? Outbox/inbox processing lag; booking state vs provider object state; idempotency key reuse.
- **Mitigation:** Replay the inbox event (idempotent). If capacity is gone, refund via the provider and record the ledger entry — never hand-edit booking state.
- **Escalation:** Finance owner for any refund; engineering lead if the mismatch is systemic rather than a single event.

### R-3 Resend bounce/complaint spike or account suspension

- **Trigger:** Bounce, complaint, or suppression rate above threshold; sending disabled.
- **First checks:** Which tenant/domain/template; domain verification and DNS records; whether a template change or list import preceded the spike.
- **Mitigation:** Pause the offending template or tenant sending. Suppress bad addresses. Keep transactional booking mail separate from anything marketing-shaped.
- **Escalation:** Provider support if account-level; tenant owner if their domain or content caused it.

### R-4 Calendar credentials expired or sync loop

- **Trigger:** Sync lag alert, expired credential/subscription count, or repeated write loop.
- **First checks:** Token/subscription expiry timestamps; conflict policy outcomes; whether our write is re-triggering an inbound event.
- **Mitigation:** Disable sync for the affected connection (bookings remain authoritative in our database). Re-authorize with the tenant. Break the loop with the event dedupe key before re-enabling.
- **Escalation:** Engineering lead if the loop is code-level rather than one connection.

### R-5 Queue backlog / dead-letter recovery

- **Trigger:** Queue depth, oldest-event age, retry count, or dead-letter count above threshold; Cron failure.
- **First checks:** Which event types; is a single provider slow or erroring; is a poison message blocking the head; worker/Cron actually running.
- **Mitigation:** Drain the poison message to dead-letter, restore throughput, then reprocess dead-letters in batches after fixing the cause. All handlers are idempotent — replay is safe.
- **Escalation:** Engineering lead if reminders will miss their send window (SLO breach).

### R-6 Database connection / lock pressure

- **Trigger:** Connection saturation, lock waits, deadlocks, or slow-query alert.
- **First checks:** Top blocking queries; long-running transactions; connection source (app, jobs, migration, ad-hoc session); recent migration or release.
- **Mitigation:** Terminate the blocking session or ad-hoc query first. Roll back the offending release if correlated. Never leave a manual `psql` transaction open.
- **Escalation:** Engineering lead; if a migration is implicated, halt the migration pipeline fleet-wide.

### R-7 Tenant domain ownership / SSL failure

- **Trigger:** Domain verification failure, certificate not issued/renewed, or tenant reports an untrusted-certificate warning.
- **First checks:** DNS records vs required values; verification state in the platform; whether the tenant changed their registrar or added CAA records.
- **Mitigation:** Re-issue verification, guide the tenant through the DNS change, keep the platform-provided hostname serving in the meantime.
- **Escalation:** Provisioning owner; the tenant's DNS action is the usual blocker and is outside our SLO.

### R-8 Bad instance release and paired rollback

- **Trigger:** Post-deploy error/latency spike, or a ring-1 canary failure.
- **First checks:** Which release and deployment ID; ring exposure; whether an expanded database contract shipped alongside the pair; contract-version compatibility.
- **Mitigation:** Halt the rollout and redirect **both application domains** to the last healthy Client + Dashboard pair. Keep the expanded, backward-compatible backend contract in place and verify it serves that pair. Never roll the schema or database contract backward; use a source revert or forward repair for the backend.
- **Escalation:** Release owner; pause all fleet rollouts until root cause is known. See [upstream updates](./upstream-updates.md).

### R-9 Suspected cross-tenant exposure

- **Trigger:** Any report or log line showing data from tenant A in tenant B's context.
- **First checks:** Reproduce with the RLS matrix; identify the query path and whether it used a definer function or a service-role path; scope the blast radius by `tenant_id` in logs.
- **Mitigation:** Disable the affected path immediately (feature flag or revoke execute grant) before diagnosing further. Preserve audit evidence.
- **Escalation:** **Highest severity.** Engineering lead + security owner + legal. Triggers the notification assessment in [security and privacy](./security-and-privacy.md). Add the case to the RLS matrix before closing.

### R-10 Compromised provider credential / GitHub App / Vercel token

- **Trigger:** Secret-scanning hit, provider alert, unexpected use, or suspected leak.
- **First checks:** Last-used and last-rotated timestamps; scope of the credential; what it touched since suspected exposure.
- **Mitigation:** Revoke at the provider first, then rotate, then redeploy consumers. Never wait for a clean rotation window. Purge any repository or log copy.
- **Escalation:** Security owner. If the credential could reach tenant data, escalate as R-9 as well.

### R-11 Database restore and Storage restore

- **Trigger:** Data loss, corruption, or a validated recovery request.
- **First checks:** PITR window covers the target timestamp; Storage backup freshness for the same window; is this whole-project or tenant-selective (see §4.3).
- **Mitigation:** Restore to an **isolated environment** first, validate, then move data forward. Restore object bytes separately from the database.
- **Escalation:** Engineering lead + platform owner. Project restore causes downtime — the decision to restore production in place is not an on-call-only call.

### R-12 Tenant export / deletion / legal hold

- **Trigger:** Tenant or customer request, or an incoming legal hold.
- **First checks:** Requester identity and step-up auth; is an active legal hold present (a hold outranks a deletion request); scope of the dependency closure.
- **Mitigation:** Run the idempotent deletion job across Postgres, Storage, Resend, payment/calendar metadata, and analytics. Backups expire naturally — do not surgically edit backups.
- **Escalation:** Legal owner for any hold conflict or cross-border question. See [security and privacy](./security-and-privacy.md).

### R-13 Platform / tenant suspension and safe reactivation

- **Trigger:** Non-payment, abuse, or security decision.
- **First checks:** Suspension reason and approver; current offboarding phase; outstanding confirmed bookings that customers still expect.
- **Mitigation:** Restrict new bookings first, preserve export access, then close. Reactivation restores in the reverse order and re-validates entitlements before re-enabling public booking.
- **Escalation:** Platform owner; legal owner if abuse or a dispute is involved.

---

## 4. Backup and disaster recovery

### 4.1 Database

- Enable production PITR **before the first real booking**. Daily-only backups can expose up to a day of data loss.
- Supabase provides daily retention by plan plus optional PITR; project restore causes downtime.
- Define contractual RPO/RTO only **after** an end-to-end restore drill on the purchased tier and the measured dataset.

Recommended targets, after validation:

| Target | Value |
| --- | --- |
| Database RPO | ≤ 5 minutes |
| Core booking RTO | ≤ 2 hours |
| Control-plane / noncritical reporting RTO | ≤ 8 hours |

### 4.2 Storage is a separate backup problem

Database backups contain Storage **metadata, not object bytes**. Restoring a database backup does not restore deleted objects.

- Keep brand assets reproducible from instance source/config wherever possible.
- Maintain an independent scheduled copy or versioning strategy for private and customer-uploaded objects.
- Inventory checks compare application metadata, Supabase metadata, and the backup destination — three-way, not two-way.
- Restore drills must include actual object bytes and their access policies.

### 4.3 Tenant-selective recovery

A shared Supabase project has **no native per-tenant PITR** (architectural inference from the project-level restore model).

To recover one tenant:

1. Restore the project into an isolated temporary environment.
2. Validate the restore there.
3. Export that tenant's full dependency closure.
4. Import through reviewed tooling.
5. Recover object bytes separately.

**Never overwrite production to recover one tenant.**

For a contracted tenant-specific RPO/RTO: maintain frequent tenant logical exports plus object backups, or move that tenant to a dedicated Supabase project. That is a pricing and [ADR](./adr/README.md) decision, not an on-call improvisation.

### 4.4 Restore discipline

| Cadence | Activity |
| --- | --- |
| Monthly | Automated restore validation for backup integrity |
| Quarterly | Human recovery exercise including DNS, secrets, and provider configuration |
| Every drill | Record evidence, duration, data gap, manual steps, corrective actions |

Also backed up, not just database rows: configuration, Edge Functions, migrations, provider and domain mappings, and secret-**recreation procedures** (procedures, never secret values — see [security and privacy](./security-and-privacy.md)).

Prefer forward repair for database releases. Rehearse high-risk migrations against production-sized sanitized data.

---

## 5. Analytics and KPIs

### 5.1 Event design

- Versioned event catalog. Every event has an owner, schema, purpose, retention, and consent category.
- Dimensions: tenant, instance, anonymous/session/customer pseudonymous identifiers, locale, device class, source/campaign, service/location/provider, release.
- **No raw PII in event properties.** Pseudonymous identifiers only.
- The **backend event ledger is the source of truth** for state transitions. Client analytics alone overcounts retries and loses asynchronous confirmations.

Funnel:

```
page_view → service_view → availability_requested → slots_shown / none_available
  → slot_selected → hold_created → intake_completed → payment_started
  → booking_requested / confirmed → manage_action
```

### 5.2 Tenant KPIs

| KPI | Note |
| --- | --- |
| Booking funnel conversion and abandonment by step | Per funnel stage above |
| Availability success rate; time to next available slot | |
| Confirmed / completed / cancelled / rescheduled / no-show rates | Denominators defined in product; no-show rate **excludes** cancellations |
| Utilization | Booked minutes ÷ offered staff/resource minutes |
| Group occupancy | Seats booked ÷ seats offered |
| Booking lead time; reschedule and cancellation lead time | |
| Revenue, AOV, refunds, fees, outstanding payments | |
| New vs returning customers; source/campaign | |
| Service / location / provider performance | Round-robin fairness normalizes for **offered hours**, not raw booking counts |
| Notification delivery and calendar-sync failure | |
| Waitlist offer/fill conversion | When shipped — see [release scope](./release-scope.md) |

Every ratio KPI must have its denominator defined in the product, not left to the reader.

### 5.3 Platform KPIs

| KPI | Note |
| --- | --- |
| Activation funnel | Tenant created → configured → test booking → published → first real booking |
| Time to activation; step-level onboarding failure | |
| Tenant lifecycle counts | Trial / active / restricted / past-due / churned |
| Per active tenant | Bookings, GMV, active staff, locations |
| Expansion | Plan, seat, location expansion; feature adoption |
| Health | Domain, email, payment, calendar, job, deployment |
| Fleet | Version distribution, upgrade conflict rate, upgrade latency |
| Support | Support-access sessions and incidents per tenant and per release |
| Gross margin drivers | Hosting, database, email, build, support, provider costs |

**Separation rule:** aggregate platform analytics are kept apart from tenant customer records. Finance and analyst roles do not automatically receive booking PII.
