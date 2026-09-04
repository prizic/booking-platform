# ADR-0009: Analytics definitions

- **Status:** Accepted
- **Owner:** @SEIFSEIF4
- **Date:** 2026-09-04
- **Supersedes / Superseded by:** —

## Context

§27.2 of the [architecture spec](../../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md) ends with an instruction rather than a list: *"Define denominators in the product. For example, no-show rate excludes cancellations, and round-robin fairness should normalize for offered hours rather than compare raw booking counts."* Issue #2 makes that a release gate — analytics definitions must include denominators for conversion, utilization, cancellation, no-show, and fairness rather than ambiguous counters.

The failure mode this prevents is specific and common. A dashboard ships "cancellation rate: 12%". Six weeks later, finance computes 9% and support computes 15%, because one counted against all bookings created, one against bookings confirmed, and one against bookings whose start date fell in the window. Nobody is wrong; nobody wrote the denominator down. By then three surfaces read the number and the definition cannot be changed without invalidating history.

Two further constraints shape this ADR. First, §27.1 makes the **backend event ledger the source of truth** for state transitions — client analytics overcounts retries and loses asynchronous confirmations, so a browser-only funnel cannot be the basis of a KPI. Second, §27.3 requires aggregate platform analytics to be kept apart from tenant customer records: finance and analyst roles do not automatically receive booking PII. Anonymized bookings from [ADR-0008](./0008-privacy-retention-and-support-access.md) must still count, which is why anonymization preserves timestamps, service, resource, status, and amounts.

## Decision

### 1. Every metric is a fraction with a written denominator

A metric definition is not accepted into the catalog unless it states, in this order: a **numerator**, a **denominator**, a **time window and the timestamp the window keys on**, a **tenant scope**, and an **exclusion list**. "Bookings" is not a metric. "Bookings this week" is not a metric. Both are inputs.

Minutes are the unit for all duration metrics. Money is in integer minor units. All windows are evaluated in the **location's** timezone, not the tenant's and not UTC, because a day boundary that disagrees with the schedule produces utilization above 100%.

### 2. The metric catalog

| Metric | Numerator | Denominator | Window | Scope | Excludes |
| --- | --- | --- | --- | --- | --- |
| **Booking conversion** | Distinct sessions with a backend `booking_confirmed` or `booking_requested` event | Distinct sessions with a `service_view` event | Rolling 28 days, keyed on session start | Tenant × instance; split by service and source/campaign | Bot and known-crawler sessions; sessions authenticated as tenant staff; bookings created in the Dashboard; test and demo tenants |
| **Request-to-book approval rate** | Requests that reached `confirmed` | Requests that reached any terminal decision (`confirmed` + `rejected` + `expired`) | Rolling 28 days, keyed on request creation; cohort closed — requests still pending at window close are held back, not counted as denied | Tenant × service × approver | Instant-confirmation bookings; requests withdrawn by the customer before a decision |
| **Staff utilization** | Booked minutes allocated to that staff resource | Offered minutes: published working minutes − time off − breaks − blackout periods | Calendar day in the location timezone, aggregated to the reporting period | Tenant × location × staff | Buffer minutes on both sides of a booking; unexpired holds; cancelled and rejected bookings; days after the staff member is deactivated |
| **Resource utilization** | Booked minutes allocated to that non-staff resource | Resource open minutes from the location schedule − blackout periods − maintenance blocks | Calendar day in the location timezone, aggregated | Tenant × location × resource | Buffer minutes; unexpired holds; cancelled bookings; resources marked inactive for the whole window |
| **Cancellation rate** | Bookings that reached `cancelled` | Bookings that reached `confirmed` and whose scheduled start falls in the window | Keyed on **scheduled start**, not on cancellation date | Tenant × service × location; split by initiator (customer / staff) | Expired holds; `rejected` requests; bookings never confirmed; reschedules — moving a booking is not cancelling it |
| **No-show rate** | Bookings marked `no_show` | Bookings that reached `confirmed` and whose scheduled start falls in the window, minus those cancelled — **not** the set of resolved statuses | Keyed on scheduled start; a booking enters the denominator once its start time has passed, whether or not anyone resolved it | Tenant × service × location × staff | **Cancellations, in the numerator and the denominator**; bookings whose start is still in the future; bookings that never reached `confirmed`; expired holds |
| **Reschedule rate** | Bookings with at least one completed reschedule | Bookings that reached `confirmed` and whose latest scheduled start falls in the window | Keyed on latest scheduled start | Tenant × service × location; split by initiator | Cancel-and-rebook, which produces a new booking rather than a revision; holds; reschedules rejected or reverted |
| **Lead time** | Sum of minutes between confirmation timestamp and scheduled start | Count of bookings in that population | Keyed on scheduled start | Tenant × service × location | Bookings created by staff in the Dashboard; negative values from clock skew; for rescheduled bookings, measure from **original** confirmation. Report p50 and p90 alongside; the mean alone is never the target |
| **Slot fill rate** | Published bookable slots that became a confirmed booking | Distinct published bookable slots (service × resource × start) offered in the window | Keyed on slot start | Tenant × location × service × resource | Slots inside the minimum-notice window; slots beyond the booking horizon; slots suppressed by an adjacent booking's buffer; slots on blackout dates |
| **Assignment fairness** (round-robin) | One staff member's share of auto-assigned booked minutes ÷ the assignment pool's auto-assigned booked minutes | That staff member's offered minutes ÷ the assignment pool's offered minutes | Rolling 28 days, minimum 20 assignments in the pool before the ratio is reported | Tenant × location × assignment pool × staff | Bookings where the customer chose a specific staff member; manually reassigned bookings; staff on time off for the entire window; buffer minutes |
| **Availability success rate** | Availability searches that returned at least one bookable slot (`slots_shown`) | Availability searches that completed and returned an answer (`slots_shown` + `none_available`) | Rolling 28 days, keyed on the search timestamp | Tenant × location × service; split by requested date range and source/campaign | Searches that errored or timed out — those are an availability SLO signal, not a demand signal; bot and known-crawler sessions; sessions authenticated as tenant staff; test and demo tenants |
| **Time to next available slot** | Sum of minutes between the search timestamp and the start of the earliest bookable slot returned | Count of availability searches that returned at least one bookable slot | Rolling 28 days, keyed on the search timestamp | Tenant × location × service | Searches that returned nothing — they have no value to average and are reported through availability success rate instead; staff and bot searches; slots outside the requested range. Report p50 and p90 alongside; the mean alone is never the target |
| **New customer share** (new vs returning) | Confirmed bookings stamped `new` at confirmation — the `customer_pseudonym_id` had no earlier confirmed booking with this tenant, looking back over the tenant's full history rather than the window | Bookings that reached `confirmed` and whose scheduled start falls in the window | Keyed on scheduled start | Tenant × location × service; split by source/campaign | Bookings that never reached `confirmed`; expired holds; test and demo tenants. The new/returning flag is stamped at confirmation and never recomputed, so ADR-0008 anonymization cannot retroactively reclassify a booking as new |
| **Notification delivery failure rate** | Notifications with a terminal failure outcome (hard bounce, rejected, dropped by the provider) | Notifications dispatched to the provider that reached a terminal outcome in the window (delivered + terminal failure) | Rolling 28 days, keyed on dispatch time; cohort closed — notifications still in flight at window close are held back, not counted as failures | Tenant × channel × template | Sends suppressed before dispatch by an unsubscribe or suppression list; soft bounces that were retried and later delivered; complaints and unsubscribes, which are their own rates; test and demo tenants |

Assignment fairness targets **1.00**. Values outside **0.80–1.25** are an alarm on the assignment algorithm, not on the staff member. Normalizing against offered minutes rather than raw booking counts is the whole point: a part-time staff member with half the offered hours and half the bookings is being treated fairly, and a raw-count comparison would report the opposite.

Group occupancy (seats booked ÷ seats offered) is defined the same way but is not reported in the first release — see [ADR-0010](./0010-deferred-scope.md).

**Cancellation and no-show denominators are not each other's mirror.** They are stated here once, in full, because this is the pair most often confused:

- The **cancellation rate** denominator is *every* booking that reached `confirmed` with a scheduled start in the window. That includes bookings that were later marked `no_show`, `completed`, or `checked_in`, and it includes the cancellations themselves. A no-show reached `confirmed`, so it belongs in the cancellation denominator — it is not excluded, and no surface may exclude it.
- The **no-show rate** denominator is the same population *minus cancellations*. The rule in §27.2 runs one way only: the no-show rate excludes cancellations. It does not say, and must not be read as saying, that the cancellation rate excludes no-shows.

**The no-show denominator is deliberately resolution-independent.** It counts bookings by what they reached (`confirmed`) and when they were scheduled to start, never by whether staff later resolved them. The earlier definition — `completed` + `checked_in` + `no_show` — was unstable: under [ADR-0005](./0005-booking-policy-defaults.md), `completion.auto_complete_after_minutes` is `null`, so completion is a manual staff action and an unresolved past-start booking stays `confirmed` indefinitely and would silently fall out of the denominator, inflating the rate. The definition above holds whether or not auto-completion is ever enabled. **Turning on `completion.auto_complete_after_minutes` must not change the denominator** — it changes only which statuses those same bookings end up in, and any implementation where the number moves on that config change is a defect, not a data improvement.

**Offered minutes are materialized daily, never read live.** Staff utilization, resource utilization, slot fill rate, and assignment fairness all divide by capacity derived from working hours, time off, breaks, blackouts, and maintenance blocks. That state is editable and unversioned, so a tenant correcting last month's working hours would silently rewrite last month's utilization. Therefore: the job that computes these metrics also writes a **daily materialized `offered_minutes` snapshot, one row per resource per location-day**, capturing offered minutes and the published bookable slot count for that day as they stood when the day closed. **All four metrics read that materialization. None of them reads live schedule state.** A retroactive schedule edit changes future snapshots only; correcting a historical figure means a deliberate, recorded re-materialization of the affected days, not an incidental side effect of editing a calendar. The snapshot is Internal-class aggregate data and is retained for 13 months, matching the aggregate-metrics row being added to [ADR-0008](./0008-privacy-retention-and-support-access.md).

**Rolling 28-day windows sit two days inside raw-event retention, deliberately.** Booking conversion, request-to-book approval rate, availability success rate, time to next available slot, notification delivery failure rate, and assignment fairness are computed from raw events, which ADR-0008 retains for **30 days**. That leaves **2 days of headroom** for a late-arriving event, a failed job, or a single reprocessing run — and nothing more. Two consequences are accepted rather than discovered later:

- **Any window longer than 28 days requires a retention change first.** A 30-day, quarterly, or year-over-year view of these metrics cannot be computed from raw events under the current policy. Asking for one is a retention decision in ADR-0008, not a query change.
- **Once written, an aggregate is authoritative and is not rebuilt.** Backfill, reprocessing, or a corrected definition applied beyond the 30-day raw window is impossible; the 13-month aggregate store cannot be recomputed from source. A definition correction is therefore applied forward from a stated date, and the older aggregates keep the definition they were written under.

### 3. Event taxonomy naming rule

Event names are `snake_case`, of the form **`<object>_<past-tense verb>`**: `service_view`, `slot_selected`, `hold_created`, `payment_started`, `booking_confirmed`, `manage_action`. The rule in full:

- Past tense only. An event records something that happened, never an intention.
- One object, one verb, no compound objects. `booking_payment_refund_completed` is three events pretending to be one.
- No vendor, provider, or component names in the event name — `payment_started`, never `stripe_payment_started`. The provider is a property.
- No personal data in the name or in any property. Pseudonymous identifiers only.
- The catalog is **versioned**; the version is a property (`catalog_version`), not a suffix on the name.
- **An event name's meaning never changes.** A semantic change means a new name. Renaming an event in place is the one change guaranteed to silently corrupt every historical comparison.
- Every event carries an owner, schema, purpose, retention, and consent category before it is emitted (§27.1).

State-transition events are emitted from the **backend event ledger**. Client-side events are permitted for interface behaviour (views, selections, abandonment) but may never be the source for a booking, payment, or money metric.

### 4. Required correlation identifiers

Every event carries the universal fields below. The event catalog then declares its event-specific required fields; ingestion rejects an event only when a field required for **that event schema** is missing.

| Identifier | Purpose |
| --- | --- |
| `event_id` | Deduplication; makes replay idempotent |
| `event_name`, `catalog_version` | Which definition applies |
| `occurred_at` (UTC) | Universal event ordering and windows |
| `tenant_id`, `instance_id` | Isolation and per-tenant scope. `tenant_id` is the reporting boundary |
| `release`, `deployment_id` | Attribute a metric shift to a deploy |
| `request_id` | Join an event to logs and traces |
| `locale` | Language parity and locale segmentation |

Event-specific fields:

| Event family | Required when applicable |
| --- | --- |
| Public interaction / funnel | `session_id`, `anonymous_id`, `device_class`; source/campaign only when attribution exists |
| Customer lifecycle | `customer_pseudonym_id`; never a direct contact identifier |
| Booking lifecycle | `booking_id`, `booking_revision` |
| Retryable mutation / outbox delivery | `idempotency_key` and/or `outbox_event_id`, according to the operation |
| Catalog-scoped event | The identifiers actually in scope: `service_id`, `location_id`, and/or `resource_id` |
| Location-day metric | Location timezone offset used for local-day bucketing |

For example, `service_view` requires a service and public-session identifier but cannot require a booking revision or outbox id that does not exist yet. A backend booking transition requires booking/revision and idempotency lineage but need not invent an anonymous browser session.

Forbidden as event properties: name, email, phone, address, intake answers, notes, manage-link tokens, payment instrument data, and any free text a customer typed.

### 5. Platform analytics are separated from tenant customer records

Aggregate platform analytics (§27.3) live apart from tenant operational data. Access rules:

- The analytics surface exposes aggregates and pseudonymous identifiers. It does not join to customer contact rows.
- **Finance and analyst roles do not automatically receive booking PII.** Reading an individual customer record requires a tenant-scoped capability, or an audited support session under [ADR-0008](./0008-privacy-retention-and-support-access.md) — the finance role is not a back door around the classification table.
- Cross-tenant aggregates are computed by the platform and are never exposed inside a tenant Dashboard.
- A metric must remain computable after a customer is anonymized. Any metric that breaks when contact data is removed is defined wrongly.

### 6. Bare counters are forbidden as KPIs

A number with no denominator is not a key performance indicator and must not be presented as one, set as a target, alerted on, or written into a contract. This covers "bookings", "cancellations", "page views", "requests", "emails sent", and "no-shows" standing alone.

Counters are permitted only as: (a) an explicit numerator or denominator of a defined ratio, (b) a volume figure displayed beside its ratio for context, or (c) an operational health count such as queue depth or dead-letter count, which is a system signal rather than a product KPI.

**Exception: monetary and volume totals are reported figures, not ratios.** Revenue, average order value, refunds, fees, outstanding payments, and GMV in [runbooks](../runbooks.md) §5.2–5.3, and the gross and net revenue reported in [journeys](../journeys.md), are legitimate KPIs and are not covered by the prohibition above. A total is an amount of something that happened; it is complete on its own terms and does not imply a comparison. Such a figure is permitted as a KPI, a target, and a contract term **provided it is always displayed with its period and its scope** — "net revenue, August 2026, Riyadh location, SAR" is a KPI; "revenue: 412,900" is not. AOV is already a fraction (net revenue ÷ confirmed bookings in the same period and scope) and states both sides like any other metric here.

The prohibition stays where it belongs: on **ratio-shaped claims presented as a bare count**. "No-shows: 43" invites the reader to supply a denominator and every reader supplies a different one; "43 no-shows out of 512 confirmed bookings starting in August (8.4%)" does not. Counts of bookings, cancellations, requests, page views, emails sent, and no-shows are the cases this rule exists for.

A ratio computed on fewer than 20 denominator events is displayed as "insufficient data", not as a percentage. Totals have no minimum — a total of three is simply three.

### Alternatives rejected

- **Define metrics later, in the BI tool.** Rejected: the definition then lives in a query nobody reviews, and each new report re-derives it slightly differently.
- **Client-side funnel as the source of truth.** Rejected by §27.1 — retries are overcounted and asynchronous confirmations are lost.
- **Keying cancellation rate on cancellation date.** Rejected: the numerator and denominator would then be drawn from different booking populations, and the rate would move when nothing changed.
- **Raw booking counts for round-robin fairness.** Rejected explicitly by §27.2; it penalizes part-time staff for being part-time.
- **A single global timezone for windows.** Rejected: it produces utilization above 100% on the days a location's schedule crosses the boundary.

## Consequences

### Positive

- One number, one definition, one place — reconciliation arguments end before they start.
- Denominators fix the shape of the event schema, so the required identifiers are known before the first table is written.
- Metrics survive the ADR-0008 anonymization path, so privacy operations do not distort reporting.
- Excluding buffer minutes from utilization keeps the metric honest as buffer policy changes.
- The "no bare counters" rule stops vanity numbers reaching contracts and pricing.

### Negative / cost

- Cohort-closed windows mean the most recent period is deliberately incomplete, which reads as "missing data" until it is explained in the interface.
- Location-timezone bucketing is more expensive to compute than UTC and needs its own DST test cases.
- Requiring the full identifier set at ingestion rejects events that would previously have been stored, so instrumentation gaps surface as errors rather than as quiet zeros.
- Fairness needs a minimum sample before it reports, so small tenants see it blank for weeks.
- Changing any definition later invalidates history, which is a migration and a communication, not a config edit.
- A resolution-independent no-show denominator keeps unresolved past-start bookings in the denominator, where they count as not-a-no-show. A tenant that never completes bookings will under-report no-shows. That is the accepted trade: a stable denominator that reads slightly low beats an unstable one that moves when staff habits change.
- The `offered_minutes` materialization is a job with a backfill story, a 13-month retention row, and a re-materialization procedure — capacity denominators stop being a query and become stored data.
- Only 2 days separate the 28-day windows from the 30-day raw-event retention, so a job outage longer than two days loses a window permanently, and aggregates can never be recomputed.

## Revisit triggers

- Two surfaces report different values for the same metric name.
- A tenant contract or an SLA quotes a metric, which raises the cost of changing its definition.
- Group occurrences (#42) or waitlist (#43) ship, adding occupancy and offer-fill metrics with new denominators.
- Assignment fairness sits outside 0.80–1.25 for a full pool over two consecutive windows.
- A metric is requested that cannot be expressed as a fraction, or a window longer than 28 days is requested for a raw-event metric — the second is a retention change in ADR-0008 before it is a query change.
- `completion.auto_complete_after_minutes` is set to a non-null value, and the no-show rate moves. It must not.
- A schedule edit changes a historical utilization, fill-rate, or fairness figure — the materialization is being bypassed.
- Advanced or scheduled analytics (#53) moves this catalog into a warehouse.
- A finance or analyst role requests booking PII to compute a number.

## References

- [Architecture spec](../../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md) — §25.1 correlation, §27.1 event design, §27.2 tenant KPIs, §27.3 platform KPIs
- [Architecture overview](../architecture.md)
- [Glossary](../glossary.md) — booking, hold, allocation, occurrence, resource, staff
- [Runbooks](../runbooks.md) — §5 analytics and KPIs, telemetry and correlation
- [Journeys](../journeys.md) — reported revenue figures; cancellation and no-show denominators are defined here, not there
- [Security and privacy](../security-and-privacy.md) — §8 data classification, no PII in analytics
- [Release scope](../release-scope.md)
- [ADR-0005: Booking policy defaults](./0005-booking-policy-defaults.md) — manual completion, and why the no-show denominator cannot key on resolution
- [ADR-0008: Privacy, retention, and support access](./0008-privacy-retention-and-support-access.md) — 30-day raw / 13-month aggregate retention, including the `offered_minutes` snapshot
- [ADR-0010: Deferred scope](./0010-deferred-scope.md)
- [References](../references.md)
