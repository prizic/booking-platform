# ADR-0006: Policy snapshot rules

- **Status:** Accepted
- **Owner:** @SEIFSEIF4
- **Date:** 2026-09-04
- **Supersedes / Superseded by:** —

## Context

A booking is an agreement. The customer agreed to a price, a duration, a cancellation window, a refund schedule, and a consent text that all existed at one instant. Tenants edit those things constantly — a salon raises prices on Tuesday, tightens its cancellation window on Wednesday, adds an intake question on Thursday.

If booking views read live catalog rows, all three edits retroactively rewrite agreements already made. The customer who booked at $90 sees $120 in their confirmation link; a cancellation that was free becomes chargeable; an intake answer is orphaned when its question is deleted. That is not a display bug — it is the platform silently changing a commercial term after the fact, and it is indefensible in a chargeback dispute.

Security invariant SI-7 already states that prices, tax, policies, and customer consent are versioned and snapshotted onto the records they govern. §15.6 step 8 places the instant-booking snapshot inside the atomic confirmation transaction; request-to-book needs the same protection at its earlier durable request state. §15.7 requires reschedule to preserve the old price/policy snapshot in history. This ADR fixes what "snapshot" means precisely enough to build.

ADR-0005 supplies the policy values being captured. This ADR governs their permanence.

## Decision

**A booking snapshots its governing policy at creation. Later tenant edits never rewrite an existing booking.** Every booking-facing read — Client, Dashboard, email, calendar export, CSV export, refund arithmetic, dispute evidence — resolves from the snapshot, never from the live catalog.

### What is snapshotted

Captured in full inside the transaction that creates the first durable booking state: request submission for request-to-book, confirmation for instant booking. Nothing here is a foreign key to a mutable row; each is a copy of the value or a copy plus the id and version it came from.

The capture is split into **three payloads** with different lifecycles. The **terms** payload is the commercial agreement and audit evidence: insert-only during its retention period and the only input to `content_hash`. The **sensitive** payload holds intake answers and rendered/free-text consent content. The **contact** payload holds customer identifiers and contact details. The latter two are separately nullable so the retention and erasure jobs of [ADR-0008](./0008-privacy-retention-and-support-access.md) can apply their different clocks. The `Payload` column below is normative — a field in the wrong payload is a defect.

| Field group | Payload | Contents |
| --- | --- | --- |
| Price | terms | `price_minor` integer minor units, plus every line: base, deposit due, remainder due at venue, discounts applied |
| Currency | terms | ISO 4217 code (`USD` in v1) |
| Tax treatment | terms | `tax_treatment` (inclusive/exclusive), `tax_rate_bps`, computed `tax_minor`, and the taxing location id |
| Duration | terms | `duration_minutes` as sold |
| Buffers | terms | `buffer_before_minutes`, `buffer_after_minutes` as applied |
| Cancellation and lifecycle terms | terms | `cancellation.cutoff_minutes`, `cancellation.customer_self_service`, `reschedule.cutoff_minutes`, `reschedule.max_per_booking`, `no_show.fee_rule`, `checkin.required_before_completion`, `booking.status_correction_window_hours` |
| Refund schedule | terms | The full ordered tier list and `refund.deposit_non_refundable`, copied — not referenced |
| Consent evidence | terms | For each accepted document: `document_key`, `version`, `accepted_at`, and the sha256 of the exact rendered text |
| Consent rendered text | **sensitive** | The rendered text itself for terms and cancellation policy, plus any free text the customer typed or checked into a consent step |
| Intake form schema | terms | The complete field schema JSON as published, plus `intake_schema_id` and `intake_schema_version` |
| Intake answers | **sensitive** | The submitted answers, keyed by the field ids in the captured schema |
| Customer contact fields | **contact** | The name, email, phone, and any address the customer supplied at booking, as shown back to them |
| Locale | terms | BCP-47 tag used to render everything the customer was shown |
| Timezone | terms | IANA zone used for schedule interpretation, plus the customer's display zone if different |
| Assignment basis | terms | `assignment_mode`, resolved `staff_id` / `resource_id` set, and the reason (`customer_choice`, `any_available`, `round_robin`) |
| Policy versions | terms | A map of every source that contributed a value → its integer version, plus the composite `policy_version` string and content hash |

No secrets, no card data, no provider keys ever enter a snapshot (SI-4, §18.2). Payment provider object references are stored on the payment record, not in the snapshot.

### Where snapshots live

A dedicated table, not JSONB welded onto the booking row. Commercial terms are immutable during retention; sensitive and contact payloads have separate, narrowly granted redaction paths:

```
app.booking_snapshots
  (tenant_id, booking_id, revision)     -- composite primary key
  created_at, created_by_actor
  price_minor, currency, duration_minutes, tax_minor   -- promoted columns, indexed/reportable
  terms_payload jsonb not null                         -- the terms half; never mutated
  sensitive_payload jsonb null                         -- 12-month lifecycle
  contact_payload jsonb null                           -- 24-month customer-activity lifecycle
  sensitive_redacted_at, contact_redacted_at timestamptz
  redaction_markers jsonb not null                    -- request/job, actor, reason per payload
  policy_version text, content_hash text               -- hash covers terms_payload ONLY
```

`app.bookings` carries `current_revision` and a foreign key to the matching snapshot row. Rules:

- Snapshot rows are **not deleted by ordinary application roles**. During the stated retention period there is no `DELETE` grant and a trigger rejects it. After the seven-year audit/financial retention expires, the retention job may delete the whole row if no legal hold applies (ADR-0008).
- `terms_payload` and every other commercial column are insert-only during retention. A trigger raises if an `UPDATE` changes any column other than the two nullable personal payloads and their redaction markers.
- The only permitted personal-data updates set `sensitive_payload` and/or `contact_payload` to `NULL` and append the matching marker. The grant is held by the deletion/retention job alone. No tenant role, staff role, or support session may perform it.
- **Redaction never invalidates `content_hash`.** The hash is computed over canonical `terms_payload` only, so commercial terms remain verifiable after personal data is erased. A row with either personal payload nulled and its marker set remains a valid record of the agreement for the rest of its retention period.
- Each redaction marker records **who** ran the erasure, **when**, **which payload**, and **under which request or retention run**. Redaction is an append-only audit event as well as a column write.
- One row per booking revision. Revision 1 is created in the same transaction as the first durable booking state: request submission for request-to-book, or confirmation for instant booking. It is never written afterwards by a job.
- Promoted columns exist so reports and refund arithmetic never parse JSON; the JSON payloads remain authoritative for display. No promoted column ever carries personal data, so promotion survives redaction.
- `tenant_id` is on the row and the RLS policy keys on it like every other table (SI-1).
- Retention follows [ADR-0008](./0008-privacy-retention-and-support-access.md): `sensitive_payload` is nulled **12 months** after completion or cancellation; `contact_payload` is nulled when Personal data is anonymized **24 months after the customer's last booking activity**. A verified deletion request nulls both immediately, subject to legal hold. Commercial terms and minimal consent evidence remain for the seven-year audit/financial period, then the whole snapshot row is eligible for deletion. The jobs process every revision and keep the clocks independent.

Rejected alternative: a JSONB column on the booking row. It cannot hold reschedule history without either overwriting (which breaks §15.7) or growing an unbounded array in a hot row. Rejected alternative: pointing at immutable versioned catalog rows instead of copying. It is cheaper in storage but requires every catalog table to become append-only, spreads the invariant across a dozen tables, and still cannot capture rendered consent text.

### What checkout is built from

For an instant booking, payment is initiated before revision 1 exists, at `held → pending_payment`; the authoritative amount is the hold. For request-to-book, revision 1 already exists from submission and payment after acceptance must use its frozen commercial terms.

- **The hold records the resolved price at creation.** When the hold is taken, the ADR-0005 precedence chain is resolved once and the result — `price_minor`, currency, tax lines, deposit rule, and the `policy_version` string it resolved to — is written onto the hold row.
- **The Checkout Session and its underlying PaymentIntent are built from that resolved price on the hold**, never from a live catalog read at payment time. A catalog edit between hold and payment cannot move the amount the customer is charged.
- **For instant booking, snapshot revision 1 written at confirmation MUST equal the hold's resolved price.** For request-to-book, the fresh payment hold MUST equal the request snapshot. A mismatch fails closed before checkout is created and creates an operational exception; it never charges or confirms at a different price.
- The instant-flow hold's resolved price is an input to revision 1, not a substitute for it. It carries no consent text or intake data and dies with the hold.

### Request-to-book agreement timing

Request submission is the first durable booking state and writes revision 1 from the terms, consent, intake schema, answers, locale, timezone, and proposed allocation shown to the customer. Staff acceptance uses that snapshot, never current tenant policy. If staff needs to change a commercial term, they must propose a revised offer and obtain explicit customer acceptance, producing revision N+1 before confirmation. Withdrawing or rejecting an unconfirmed request remains free because no service was confirmed or payment captured—not because the request lacked a snapshot.

### How a snapshot is versioned

- Each editable policy source — service, location policy set, tenant policy set, consent document, intake schema — carries an integer `version`, incremented on publish. Drafts do not increment.
- The snapshot stores the map of `source_key → version` for every source that contributed a resolved value under the ADR-0005 precedence chain, including the scope each value was resolved from.
- `policy_version` is the deterministic concatenation of that map, sorted by key: e.g. `svc:41@7|loc:3@2|ten:1@19|consent:terms@4|intake:12@3`. It is a human-readable identifier for support and disputes.
- `content_hash` is the sha256 of the canonical (sorted-key, no-whitespace) JSON of the **`terms_payload` only**. Both personal payloads are deliberately outside the hash so erasure cannot invalidate dispute evidence. Two snapshots with the same hash are the same agreement; a hash mismatch on a revision copy is a bug, and the reschedule path asserts on it.
- Snapshot revisions are booking-local and monotonic. They are not global and are never reused.

### How reschedule interacts with the snapshot

Reschedule creates booking revision N+1 and inserts a new snapshot row that is a **copy of revision N with only the re-evaluated fields changed** (§15.7). Revision N stays exactly as it was.

| Frozen — copied unchanged from revision N | Re-evaluated at the new time |
| --- | --- |
| `price_minor`, currency, all price lines | `buffer_before_minutes`, `buffer_after_minutes` |
| Tax treatment, rate, computed tax | Assignment basis (`staff_id` / `resource_id` and reason) |
| `duration_minutes` | Timezone, if and only if the location changed |
| Cancellation terms and refund schedule | Locale, if the customer changed their language |
| Consent documents, versions, hashes, rendered text | — |
| Intake schema and answers | — |
| Original `policy_version` (retained as `origin_policy_version`) | — |

Reasoning for the one non-obvious line: buffers are **operational**, not commercial. They protect the calendar of whoever works the new slot, so the new slot must use current buffers. Duration is commercial — the customer bought 60 minutes and gets 60 minutes. Every other commercial term is frozen.

Further reschedule rules:

- **Terms are frozen; feasibility is live.** Permission to reschedule is gated by the **snapshotted** `reschedule.cutoff_minutes` and `reschedule.max_per_booking`, because those are terms the customer accepted. Whether the requested new slot is bookable at all — minimum notice, horizon, opening hours, buffers, conflicts — is evaluated against **current** values, because those describe physical reality.
- **A reschedule never reprices in v1. The delta is always zero.** No v1 pricing dimension can produce one: a service has a single price, and every catalog input is frozen by the snapshot the moment the booking is made. Revision N+1 therefore always carries revision N's `price_minor`, and any code path that computes a reschedule price difference is a defect. Explicit-acceptance repricing — showing the customer a difference and recording `reprice_accepted_at` — is **out of scope for this ADR** and belongs to whichever future ADR introduces a pricing dimension that can vary by time (peak pricing, staff tiers, demand rules). It is not to be built ahead of that ADR.
- Changing to a **different service** is not a reschedule. It is a cancel plus a new booking, with its own snapshot.
- Refund arithmetic on a rescheduled booking uses the snapshot of the revision that is current at cancellation time, measured against that revision's scheduled start.

### How "terms as booked" is displayed

- The manage-booking page (guest link or account, ADR-0004) renders a **"Your terms as booked"** panel from the snapshot: price and what was paid, duration, cancellation deadline as an absolute local datetime, the refund tiers with the amount each would return, and the consent documents with their version and acceptance timestamp.
- The confirmation, reminder, change, and cancellation emails render the same panel from the same snapshot revision, in the snapshotted locale and timezone.
- Wording is fixed: **"These are the terms that applied when you booked on {date}. Our current terms may differ."** No compliance or legal claim beyond that sentence.
- The Dashboard booking detail renders the snapshot with a **"differs from current catalog"** badge on each field that no longer matches live configuration, so staff can see the divergence without it being editable.
- After a reschedule, the customer sees the current revision by default and can expand a plain history: what changed, when, and who changed it.
- Nothing in any of these surfaces is editable. There is no "correct the snapshot" affordance. A genuine error is fixed by cancelling and rebooking, which leaves both records intact.

### Worked example: a mid-week price rise

Snapshots hold, and both parties can see why.

| When | Event | Snapshot state | What Amina (customer) sees | What the tenant sees |
| --- | --- | --- | --- | --- |
| Mon 10:04 | Amina books "Colour treatment", 90 min, $90.00, cancellation cutoff 24 h, refund 100% / 50% / 0%. Consent `terms@4`. | Booking `b_812` revision 1 written in the confirming transaction. `policy_version = svc:41@7\|ten:1@19\|consent:terms@4`, `price_minor = 9000`. | Confirmation email: **$90.00**, free cancellation until Fri 14:00. | Booking appears at $90.00. |
| Wed 09:30 | Tenant raises the service to $120.00 and tightens the cancellation cutoff to 48 h. | Service version 7 → 8. Tenant policy version 19 → 20. **No existing snapshot row is touched.** | Nothing changes. Manage-booking link still shows $90.00 and the Friday 14:00 deadline. | New bookings from 09:30 onward snapshot `svc:41@8\|ten:1@20` at $120.00 and a 48 h cutoff. |
| Wed 11:00 | Amina opens her manage-booking link. | Read resolves revision 1. | "Your terms as booked — $90.00, paid $22.50 deposit, free cancellation until Fri 14:00. These are the terms that applied when you booked on Mon 6 Sep. Our current terms may differ." | Booking detail shows $90.00 with a "differs from current catalog" badge on price and cancellation cutoff. |
| Wed 15:00 | Amina reschedules to the following Tuesday. Current staff buffers changed from 10 to 15 minutes. | Revision 2 inserted: price **$90.00** frozen, duration **90 min** frozen, cutoff **24 h** frozen, consent `terms@4` frozen; `buffer_after_minutes` re-evaluated to 15, assignment re-resolved to a different colourist. Revision 1 untouched. | Still $90.00. New deadline Mon 14:00, computed from the frozen 24 h against the new start. | Calendar reserves the new slot with 15-minute buffers. History shows both revisions. |
| Thu 08:00 | Amina cancels, 5 days out. | Refund read from revision 2's frozen tier list. | 100% of the $22.50 captured returns. Not 100% of $120.00, and not the tightened 48 h rule. | Refund ledger cites `b_812` revision 2 and its `policy_version`. |

## Consequences

### Positive

- A booking's commercial terms are immutable and citable. A dispute is answered with one snapshot row, a `policy_version`, and a content hash, not by reconstructing what the catalog looked like last Tuesday.
- Tenants can edit prices and policies whenever they like without a "will this break existing bookings?" hesitation. That removes a whole class of support escalation.
- Refund arithmetic has exactly one input: the snapshot. Client, Dashboard, email, and the refund job cannot disagree.
- Intake answers stay meaningful for as long as they are retained, because the schema that produced them travels with them. Deleting a question does not orphan an answer.
- Append-only terms are trivially auditable and back up cleanly; the single narrow update path exists only for redaction and is held by one job role.
- Erasure and dispute evidence stop competing. The retention job can hard-delete customer personal data on schedule while the commercial terms, their `policy_version`, and their content hash survive intact and verifiable.

### Negative / cost

- Storage grows with every reschedule, and the consent text is duplicated per booking. At lighthouse volumes this is negligible; at fleet scale the payload needs a size budget and probably text de-duplication by hash.
- Every booking read path must go through the snapshot. Any code that joins live catalog rows for display is a bug, and only a lint rule plus code review will catch it — the database cannot.
- The frozen/re-evaluated split on reschedule is a genuine subtlety. It will be got wrong at least once; it needs an explicit test per row of that table.
- Catalog corrections cannot be applied retroactively, even when the tenant genuinely mistyped a price. The only remedy is cancel-and-rebook, which is more support work than an edit would have been.
- Consent text and intake answers stored per booking are customer-linked data and inherit the retention, export, and deletion obligations in [security and privacy](../security-and-privacy.md) and [ADR-0008](./0008-privacy-retention-and-support-access.md); the deletion job must reach every revision of every snapshot row, not only the current one.
- The three-payload split is a real correctness burden on writers: every new snapshot field needs a deliberate assignment, and a personal field written into `terms_payload` cannot be independently redacted without a migration. Requires independent legal review of the split before the first production erasure run.

## Revisit triggers

- A dispute or chargeback turns on which policy applied, and the snapshot did not settle it.
- A tenant demands a retroactive correction to existing bookings for a reason cancel-and-rebook does not serve.
- Snapshot payload size exceeds 32 KB at p95, or `booking_snapshots` exceeds 25% of database size.
- A field the customer is shown at booking time is found not to be in the snapshot list.
- Group occurrences, recurring series, packages, memberships, or coupons enter a release — each adds terms this list does not cover.
- A regulator or acquirer requires a retention or evidence format the append-only row cannot produce, or requires the terms half itself to be erasable.
- A pricing dimension that can vary between booking and reschedule is proposed, which is what would reopen reschedule repricing.
- A field is found in `terms_payload` that should have been personal, or a redaction run leaves customer free text behind.
- Reschedule volume exceeds 15% of bookings, making revision growth a real cost rather than a rounding error.

## References

- [Architecture spec](../../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md) — §6.3 reschedule, §6.4 cancellation and refund, §7.1 booking state, §15.6 atomic confirmation, §15.7 rescheduling, §15.8 time and DST, §18.2 provider-neutral interface, §23.2 lifecycle
- [ADR-0005: Booking policy defaults](./0005-booking-policy-defaults.md) — the values being snapshotted
- [ADR-0004: Guest-first booking and management links](./0004-guest-first-booking-and-management-links.md) — where "terms as booked" is shown to a guest
- [ADR-0007: Roles and capabilities](./0007-roles-and-capabilities.md) — who may reschedule, cancel, or refund
- [ADR-0008: Privacy, retention, and support access](./0008-privacy-retention-and-support-access.md) — the independent sensitive/contact redaction clocks and seven-year evidence retention
- [Security and privacy](../security-and-privacy.md) — SI-7, SI-4, retention and deletion
- [Architecture overview](../architecture.md) · [Glossary](../glossary.md) · [Release scope](../release-scope.md)
- [ADR index](./README.md) · [References](../references.md)
