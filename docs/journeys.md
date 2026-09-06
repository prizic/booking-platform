# Journeys and State Models

Purpose: every MVP booking journey and every booking state resolved to implementation-ready detail — who acts, what guards the transition, what it changes, and how it recovers when it fails.

Authoritative source: §6, §7, §15 of [the architecture spec](../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md). Also drawn on: §17.3 (notifications), §18.3 (payment lifecycle), §19.4 (calendar conflict), §27 (analytics), §31 (production acceptance).

Related: [docs/README.md](./README.md) · [architecture](./architecture.md) · [glossary](./glossary.md) · [security-and-privacy](./security-and-privacy.md) · [release-scope](./release-scope.md) · [runbooks](./runbooks.md) · [adr/README.md](./adr/README.md)

## Locked decisions assumed here

Set by issue #2; the ADRs are the record, this document is the behavior that follows from them.

| Decision | Effect on journeys | ADR |
| --- | --- | --- |
| US / USD, integer minor units (cents) | Every amount in this document is USD cents; no rounding at display time changes a stored amount | [adr/0002-region-currency-and-money-representation.md](./adr/0002-region-currency-and-money-representation.md) |
| Tenant is merchant of record, Stripe Connect first adapter | Charges and refunds settle on the tenant's connected account; refund liability is the tenant's; SaaS subscription billing never touches these flows | [adr/0003-merchant-of-record-and-payments.md](./adr/0003-merchant-of-record-and-payments.md) |
| Guest-first, expiring scoped management links, email OTP for sensitive actions | No account required to book; every sensitive action needs its own intent-scoped token **plus** an OTP bound to that token and intent — never a session | [adr/0004-guest-first-booking-and-management-links.md](./adr/0004-guest-first-booking-and-management-links.md) |
| No group classes in v1 | Every allocation in v1 is capacity-one and guarded by the exclusion constraint (§15.2); no `occurrence_inventory` path is reachable | [adr/0001-lighthouse-vertical-and-v1-scope.md](./adr/0001-lighthouse-vertical-and-v1-scope.md) |
| One-way add-to-calendar only | The platform emits `.ics` / add-to-calendar links; it never reads or writes an external calendar in v1 | [adr/0010-deferred-scope.md](./adr/0010-deferred-scope.md) |
| Policy is snapshotted on the booking | A later tenant edit never rewrites an existing booking's price, tax, duration, buffers, cancellation terms, consent text, intake schema/answers, locale, or timezone | [adr/0006-policy-snapshot-rules.md](./adr/0006-policy-snapshot-rules.md) |

## Policy keys the journeys consult

Values are locked in [adr/0005-booking-policy-defaults.md](./adr/0005-booking-policy-defaults.md). This document names the key and the moment it is read; it does not restate the value.

| Key | Read at |
| --- | --- |
| `service.duration_minutes`, `service.buffer_before_minutes`, `service.buffer_after_minutes` | Availability computation; range construction on hold and on reschedule |
| `service.assignment_mode` (`fixed_staff` / `any_available` / `customer_choice` / `round_robin`) | Availability computation; staff resolution at hold. `round_robin` uses deterministic offered-hours-normalized rank; every mode is revalidated atomically |
| `service.approval_required` (boolean) | `held → confirmed` vs `held → requested` |
| `service.payment_mode` (`none` / `deposit` / `full`) + `service.deposit_rule` (percent or fixed) | `held → pending_payment` vs direct confirm |
| `hold.ttl_seconds` (within platform min/max bounds) | Hold creation; expiry job; **and the payment window — the time to complete payment is the remaining TTL on the hold, and no separate payment-window key exists** |
| `booking.minimum_notice_minutes`, `booking.horizon_days`, `service.slot_interval_minutes`, `booking.daily_limit_per_staff` | Availability computation; re-validated inside the atomic confirm |
| `service.request_holds_allocation` (default `false`) | Whether a `requested` booking reserves anything before acceptance |
| `request.response_sla_hours` (default `48`, **wall-clock** — no business-hours pause) | Auto-expiry of an undecided `requested` booking; staff breach alert |
| `request.proposal_ttl_hours` (default `24`) | Expiry of a staff-proposed alternative; never extends the request SLA |
| `cancellation.cutoff_minutes` + `refund.schedule` + `refund.deposit_non_refundable` | Cancellation eligibility and refund amount |
| `reschedule.cutoff_minutes`, `reschedule.max_per_booking` (default `2`) | Reschedule eligibility; the customer-initiated reschedule allowance |
| `payment.late_settlement_policy` (`reallocate_then_refund` / `reallocate_then_staff_resolve`) + `payment.late_settlement_resolve_hours` | Payment settled after the hold was lost and re-allocation failed |
| `checkin.window_opens_minutes_before`, `checkin.window_closes_minutes_after` | When check-in opens and when it closes |
| `no_show.grace_minutes`, `no_show.fee_rule` (`none` / `forfeit_deposit`) | When a no-show becomes markable, and what it costs |
| `completion.auto_complete_after_minutes` (`null` = manual completion only) | Auto-completion |
| `checkin.required_before_completion`, `booking.status_correction_window_hours` | Completion guard and audited correction window |
| `staff.deactivation_future_bookings` (`reassign_then_defer` / `defer_until_resolved`) | Staff deactivated with future bookings |

---

# State models

Booking state, payment state, refund state, notification state, and calendar-export state are **separate columns on separate rows** (§7.1). A booking may be `confirmed` while its confirmation email is `failed`, or `cancelled` while its refund is `pending`. Nothing in this document overloads one status.

## Booking state machine (§7.1)

Actor column: **C** customer (guest link or account), **S** staff with the named capability, **SYS** a scheduled job, worker, or verified webhook. All guards are re-evaluated **inside** the atomic transaction (§15.6); the UI check is advisory only.

| From | Event | To | Actor | Guard / precondition | Side effects |
| --- | --- | --- | --- | --- | --- |
| — | `hold.create` | `held` | C, S (`booking.create_on_behalf`) | Slot passes availability composition (§15.1); exclusion constraint accepts `[start−buffer_before, end+buffer_after)`; active-hold cap per IP / session / customer not exceeded; idempotency record claimed | `resource_reservations` row `state='held'`, `expires_at = now() + hold.ttl_seconds`; draft booking attempt without a contractual snapshot; booking event and analytics `hold_created` |
| `held` | `checkout.create` | `pending_payment` | C, SYS | `service.payment_mode ≠ none`; hold still valid; resolved price recorded on the hold. In request flow a request snapshot already exists and the hold must match it | Stripe Checkout Session created on the tenant's connected account from the frozen amount (never inside the DB transaction, never from a live catalog read); payment ledger row `requires_payment`; **no new deadline is created — the payment window is the hold's remaining `hold.ttl_seconds`** |
| `held` (when allocation is retained), otherwise — | `request.submit` | `requested` | C | `service.approval_required = true`; intake and consent captured. With `service.request_holds_allocation = true`, the checkout hold is atomically converted to `provisional_request` expiring at request SLA; with `false`, it is released and the slot remains public | Snapshot revision 1 written from request-time terms; booking event `requested`; Dashboard pending-action queue; outbox `staff_request_alert` + `customer_request_received` |
| `held` | `booking.finalize` | `confirmed` | C, S | `service.approval_required = false` **and** `service.payment_mode = none`; hold not expired; all §15.6 validations pass | Reservation `state='confirmed'`; snapshot revision 1 written in the same transaction and **must equal the hold's resolved price or the confirmation fails**; outbox `booking_confirmed` (customer) + `staff_new_booking`; add-to-calendar payload generated; analytics `booking_confirmed` |
| `held` | `hold.expire` | `expired` | SYS | `expires_at < now()`; no successful payment recorded | Reservation deleted / marked `expired` so the exclusion constraint releases the range; booking event `hold_expired`; no email |
| `held` | `hold.preempt` | `expired` | SYS | A competing confirm transaction synchronously expires this stale hold before retrying its own allocation (§15.4) | Same as `hold.expire`; the competing booking proceeds |
| `held` | `booking.abandon` | `expired` | C | Customer leaves checkout explicitly | Immediate release, no waiting for TTL |
| `pending_payment` | `payment.succeeded` (verified webhook or reconciliation) | `confirmed` | SYS | Signature verified; event not already applied; hold still valid; amount and currency match the hold's resolved price | Reservation `confirmed`; payment ledger `succeeded`; snapshot revision 1 written and **must equal the hold's resolved price or the confirmation fails** into the exception path; outbox `booking_confirmed` with receipt; analytics `booking_confirmed` |
| `pending_payment` | `payment.failed` | `held` | SYS | Hold TTL remains | Payment ledger `failed` with provider decline code; customer offered another payment method on the same hold |
| `pending_payment` | `hold.expire` | `expired` | SYS | The hold's `expires_at < now()` — there is no second clock, including during 3DS or another asynchronous provider flow | Reservation released unconditionally; provider-session cancellation requested asynchronously on a best-effort basis; outbox `checkout_expired` with a rebook link |
| `expired` | `payment.late_success` | `expired` | SYS | A durable payment attempt settles after release; atomic re-attempt of the identical allocation succeeds | Expired row remains closed. A **new confirmed booking** is created and linked to the expired attempt, using its frozen terms; outbox `booking_confirmed` with receipt |
| `expired` | `payment.late_success` | `expired` | SYS | A durable payment attempt settles after release and atomic re-allocation fails | Expired row remains closed. A separate payment-exception task/record runs the configured refund or staff-resolution policy; it is not a booking status and cannot occupy capacity |
| `requested` | `request.accept` | `confirmed` | S (`booking.approve`) | Same atomic allocation check as instant booking (§6.2 step 5) — run fresh when `service.request_holds_allocation = false`, re-validated against the provisional hold when `true`; `service.payment_mode = none` | Reservation `confirmed`; outbox `request_accepted`; analytics `booking_confirmed` |
| `requested` | `request.accept` | `pending_payment` | S (`booking.approve`) | Allocation check passes; `service.payment_mode ≠ none`; amount matches request snapshot | Existing provisional allocation is converted—or a new allocation is taken—as a fresh checkout hold; payment link expires with that hold's `hold.ttl_seconds` |
| `requested` | `request.propose_time` | `requested` | S (`booking.approve`) | Proposed slot is currently available | Original request and SLA remain unchanged; proposal stored separately with `request.proposal_ttl_hours`; outbox `alternative_time_proposed` with a `request_alternative` link |
| `requested` | `request.alternative_accept` | `requested` (revision +1) | C | Intent token + OTP valid; proposal unexpired; slot passes atomic availability check | New allocation is acquired before the original provisional allocation is released, in one transaction; revision N+1 records customer acceptance, then ordinary confirmation or fresh-payment-hold path runs |
| `requested` | `request.alternative_decline` | `requested` | C | Intent token + OTP valid; proposal unexpired | Proposal closes; original request remains pending under its original SLA |
| `requested` | `request.reject` | `rejected` | S (`booking.approve`) | Reason recorded | Any provisional allocation released; outbox `request_declined` with alternatives; **no charge was ever created** |
| `requested` | `request.withdraw` | `cancelled` | C | Intent-scoped token + OTP valid; decision not yet made | **Always free and never subject to `cancellation.cutoff_minutes`** because no service was confirmed and no charge captured; snapshot remains immutable evidence; any provisional allocation released; outbox `request_withdrawn` to staff |
| `requested` | `request.sla_expire` | `expired` | SYS | `request.response_sla_hours` (default 48, **wall-clock** — weekends and holidays do not pause it) elapsed with no decision | Any provisional allocation released; outbox `request_expired` to customer and `sla_breached` alert to staff, keyed on the same `request.response_sla_hours`; counted against response-time KPI |
| `confirmed` | `booking.reschedule` | `confirmed` (revision +1) | C (intent-scoped token + OTP), S (`booking.reschedule`) | Actor permitted; `reschedule.cutoff_minutes` and the **snapshotted** `reschedule.max_per_booking` both satisfied — the count guard reads the value snapshotted onto the booking, not the current setting, and **a staff reschedule never consumes the customer's allowance and is never blocked by an exhausted one**; new slot passes availability; **new allocation is taken before the old one is released, in one transaction** (§15.7); **no repricing in v1 — the price delta is always zero** | Lineage row linking revisions; old time, price, policy snapshot, actor, and reason preserved; outbox `booking_rescheduled` keyed by `(booking_id, revision)`; superseding add-to-calendar payload |
| `confirmed` | `booking.cancel` | `cancelled` | C (intent-scoped token + OTP), S (`booking.cancel`) | `cancellation.cutoff_minutes` evaluated against the **snapshotted** policy; actor holds the capability; booking not already terminal | Allocation released; refund eligibility and amount computed and recorded on a separate refund ledger row; outbox `booking_cancelled` (customer + staff); analytics `booking_cancelled` with lead time |
| `confirmed` | `booking.check_in` | `checked_in` | S (`booking.check_in`); outside the window additionally S (`booking.check_in_override`) | Now ≥ `start − checkin.window_opens_minutes_before` **and** now ≤ `start + checkin.window_closes_minutes_after`; booking not cancelled. Outside that window the action is shown with its reason and completes only for a holder of `booking.check_in_override`, with a **mandatory recorded reason** | Booking event `checked_in` with actor and timestamp; an override additionally writes an audit row with actor, timestamp, reason, and the booking's scheduled start; Dashboard day view updates; no customer email by default |
| `confirmed` | `booking.no_show` | `no_show` | S (`booking.mark_no_show`) | Now ≥ `start + no_show.grace_minutes`; no check-in recorded. Never automatic | Booking event `no_show`; `no_show.fee_rule` applied from the snapshot — `forfeit_deposit` retains the captured deposit and issues no refund, `none` retains nothing; **no charge beyond what was already captured**, which would need card-on-file (Phase 2); outbox `no_show_recorded` |
| `confirmed` | `booking.auto_complete` | `completed` | SYS | `checkin.required_before_completion = false`; `completion.auto_complete_after_minutes` non-null and now ≥ `end +` that value; not cancelled or no-show | Booking event `completed`; enters utilization and revenue reporting |
| `confirmed` | `booking.complete` | `completed` | S (`booking.complete`) | `checkin.required_before_completion = false`; now ≥ end, or earlier with reason | Booking event `completed`; enters utilization and revenue reporting |
| `checked_in` | `booking.complete` | `completed` | S (`booking.complete`) | Now ≥ `end` (staff may complete early with a reason) | Booking event `completed`; enters utilization and revenue reporting |
| `checked_in` | `booking.cancel` | `cancelled` | S (`booking.cancel`, plus `refund.issue` to issue the refund) | Service abandoned after arrival; reason mandatory | Refund decided by staff, not by the cutoff table; audit event flags the manual override |
| `checked_in` | `booking.check_in_undo` | `confirmed` | S (`booking.correct_status`) | Within snapshotted correction window; reason mandatory | Audited correction; no money effect |
| `completed` | `booking.status_correct` | `checked_in` or `confirmed` | S (`booking.correct_status`) | Within snapshotted correction window; reason mandatory; target obeys check-in policy | Audited old/new-state event; KPI recomputed |
| `no_show` | `booking.status_correct` | `checked_in` or `completed` | S (`booking.correct_status`) | Within snapshotted correction window; reason mandatory | Audited correction; KPI recomputed; returning forfeited money separately requires `refund.issue` |
| `expired`, `rejected`, `cancelled` | — | terminal | — | A customer who wants the slot again starts a **new** booking with new lineage | Nothing; refund and notification ledgers may continue to settle |

**There is no `rescheduled` status.** §15.7 is explicit: rescheduling is lineage plus a new revision on a booking that stays `confirmed`. A terminal `rescheduled` state would break utilization and cancellation denominators and lose the guarantee that a failed reschedule leaves the original booking valid.

### Side-state machines (kept separate on purpose)

| Ledger | States | Owner |
| --- | --- | --- |
| Payment | `requires_payment → processing → succeeded / failed / cancelled`, plus `disputed` | Verified webhook + reconciliation job (§18.3) |
| Refund | `eligible → pending → succeeded / failed / manual_review` | Refund worker + webhook reconciliation |
| Notification | `queued → sending → delivered / bounced / complained / failed` | Outbox → queue → Edge worker → Resend → inbox (§17.3) |
| Calendar export | `pending → generated / stale` (stale after a reschedule supersedes it) | Confirmation and reschedule workers; one-way only in v1 |

### Booking state diagram

```
   ( — ) ─hold.create─► [ held ] ─checkout.create─► [ pending_payment ]
                           │                              │
                           ├─expire/abandon───────────────┼────► [ expired ]
                           │                              │
                           └─finalize─────────────────────┴────► [ confirmed ]

   ( — / held* ) ─request.submit─► [ requested ]
                                      ├─reject───────────► [ rejected ]
                                      ├─withdraw─────────► [ cancelled ]
                                      ├─SLA expire───────► [ expired ]
                                      └─accept (+ optional payment hold)─► [ confirmed ]

   [ confirmed ] ─reschedule─► [ confirmed ] (revision + 1)
        ├─cancel──────────────────────────────► [ cancelled ]
        ├─check_in─► [ checked_in ] ─complete► [ completed ]
        ├─no_show─────────────────────────────► [ no_show ]
        └─complete/auto_complete when check-in is not required─► [ completed ]

   [ checked_in ], [ completed ], and [ no_show ] have only the audited
   corrections listed in the transition table. [ expired ], [ rejected ],
   and [ cancelled ] are terminal. A late payment creates a new linked booking
   on successful re-allocation or a separate exception task; it never reopens
   the expired booking attempt.
```

\* The `held` predecessor exists only when `service.request_holds_allocation = true`. With the default `false` a submission goes straight to `requested`, reserves nothing, and the allocation is attempted at acceptance.

## Provisioning state (§7.2)

Linear sequence; **every** step independently carries `pending | running | succeeded | failed | skipped`, attempt count, and sanitized error detail. Retry resumes from the failed step; it never restarts the sequence.

| Step | Completes when | Failure recovery |
| --- | --- | --- |
| `requested` | Operator submits tenant, plan, owner, locale, timezone, instance request | Edit and resubmit; nothing external created yet |
| `validated` | Slug globally unique; requested domains well-formed and unclaimed | Operator corrects slug/domain; step is re-runnable |
| `tenant_created` | Tenant, owner membership, and defaults exist | Retry is idempotent on the tenant key; never creates a second tenant |
| `repository_seeded` | Private instance repo seeded from the approved white-label release | Retry reuses the existing repo if the seed commit matches; otherwise operator resolves manually |
| `config_committed` | `instance/` config and AI brief committed; default branch protected | Retry re-commits deterministically |
| `projects_created` | Two Vercel projects with Client and Dashboard root directories | Retry matches on project name before creating |
| `environment_configured` | Env var references and non-secret public config installed | Retry overwrites references; secrets are never logged or echoed |
| `domain_pending` / `domain_deployed` | Platform subdomain live; custom DNS waits in a resumable state | `domain_pending` is a normal resting state, not a failure; operator resumes when DNS is delegated |
| `health_checked` | Smoke, contract, security-header, tenant-resolution, health checks pass | Retry after fixing; activation is blocked while any required check fails |
| `active` | Operator activates | — |

Automated rollback **deactivates new infrastructure only**. It never deletes repositories, tenants, domains, or data. See [runbooks](./runbooks.md).

## Instance release state (§7.3)

| State | Meaning | Exit |
| --- | --- | --- |
| `current` | Instance is on the latest release its contract range allows | → `upgrade_available` when a newer release is published |
| `upgrade_available` | A newer release exists and the backend contract is compatible | → `PR_open` when the update PR is raised |
| `PR_open` | Update pull request open on the instance repo | → `checks_failed` or `ready` |
| `checks_failed` | Instance CI failed on the update | Fix or abandon; instance stays on its current version and remains deployable |
| `ready` | Checks green, awaiting approval | → `approved` |
| `approved` | Approved for deploy | → `deployed_canary` |
| `deployed_canary` | Client and Dashboard deployed as a recorded logical pair to a canary ring | → `active` or `rolled_back` |
| `active` | Promoted to the full ring | → `current` at the next release cycle |
| `rolled_back` | Pair reverted together | Investigate, then re-enter at `PR_open` |

Platform Admin displays **code version** and **backend contract version** separately. An instance may deploy only when its supported contract range includes the current backend contract.

---

# Journeys

## J1 — Instant-confirmation booking

- **Preconditions:** Instance active; tenant published a service with `service.approval_required = false`; at least one eligible staff member or resource has published availability; if `service.payment_mode ≠ none`, the tenant's Stripe Connect account has active charge capability.
- **Actor / capability:** Customer, unauthenticated. No capability needed beyond public catalog read (RLS `published = true`).
- **Happy path:**
  1. Client resolves the tenant from the hostname; loads published brand and catalog config.
  2. Customer picks service, location, optional staff preference, and date.
  3. Server computes availability from the intersection in §15.1; timezone label is shown beside the slots.
  4. Customer picks a slot → atomic `hold.create` with a platform-generated idempotency key.
  5. Customer supplies contact + intake data and accepts the policies; consent text version is captured.
  6. `service.payment_mode ≠ none` → Stripe Checkout Session and underlying PaymentIntent created on the tenant's connected account from the hold's resolved price, linked to the hold. The customer's payment window is the hold's remaining `hold.ttl_seconds`; nothing else times it.
  7. Verified webhook (or, with no payment, the finalize call) runs the §15.6 algorithm and commits.
  8. Same transaction writes status history, snapshot, and notification/audit outbox rows.
  9. Workers send email and generate the add-to-calendar payload asynchronously.
  10. Client renders confirmation from **authoritative booking state**, never from the payment redirect.
- **State transitions:** `— → held → (pending_payment) → confirmed`.
- **Policy consulted:** `service.duration_minutes`, buffers, `service.assignment_mode`, `booking.minimum_notice_minutes`, `booking.horizon_days`, `service.slot_interval_minutes`, `booking.daily_limit_per_staff`, `hold.ttl_seconds`, `service.payment_mode`, `service.deposit_rule`.
- **Side effects:** Email `booking_confirmed` (customer) + `staff_new_booking`; Stripe charge on the connected account in USD cents; audit `booking.created` with actor, IP hash, and idempotency key; add-to-calendar link (one-way); analytics `hold_created → payment_started → booking_confirmed`.
- **Exceptions:** slot taken during checkout → CONFLICT-1; payment declined → `pending_payment → held`, retry on the same hold; hold expires mid-checkout, including during 3DS → `expired` with a one-click rebook if still free; late success is handled from the durable payment attempt under FAILED-4 without reopening the expired booking; email fails → booking stands, Dashboard shows delivery state and an authorized resend (§17.3).
- **Acceptance outcome:** 100 concurrent attempts on one capacity-one slot yield exactly one `confirmed` booking and 99 `slot_unavailable` responses; a duplicate submit with the same idempotency key returns the original booking and creates exactly one charge and one email.

## J2 — Request-to-book: approval and decline

- **Preconditions:** Service has `service.approval_required = true`; at least one staff member holds `booking.approve`; `request.response_sla_hours` configured (default 48, wall-clock).
- **Actor / capability:** Customer (public) submits; staff with `booking.approve` decides.
- **Happy path:**
  1. Customer picks a requested time or window and completes intake.
  2. System creates `requested` — **never** `confirmed` — and writes snapshot revision 1 from the request-time terms, intake, consent, locale, and timezone. With `service.request_holds_allocation = false`, nothing remains reserved. With `true`, the checkout hold is atomically converted to `provisional_request` and expires on the request SLA rather than the checkout TTL.
  3. Dashboard pending-action queue shows the request with an SLA countdown.
  4. Staff accepts, proposes an alternative, or rejects with a reason. A proposal is separate, expires under `request.proposal_ttl_hours`, requires a `request_alternative` token + OTP to accept or decline, and never extends the original request SLA.
  5. Acceptance runs the **same** atomic allocation check as J1 — approval is not a bypass.
  6. If payment is required, acceptance takes a fresh hold and the customer receives a payment link that expires with that hold's `hold.ttl_seconds`; booking sits in `pending_payment` until the verified webhook lands.
- **State transitions:** `— → requested → confirmed` with `service.request_holds_allocation = false`, or `— → held → requested → confirmed` with `true` (each also `→ pending_payment → confirmed`, `→ rejected`, `→ expired`, `→ cancelled`).
- **Policy consulted:** request snapshot, `service.approval_required`, `service.request_holds_allocation`, `request.response_sla_hours`, `request.proposal_ttl_hours`, `service.payment_mode`, `hold.ttl_seconds` (fresh only when payment begins).
- **Side effects:** Emails `customer_request_received`, `staff_request_alert`, then one of `request_accepted` / `request_accepted_pay_now` / `alternative_time_proposed` / `request_declined`; **no charge exists before acceptance**; audit records the deciding actor, decision, and reason; analytics `booking_requested` with time-to-decision.
- **Exceptions:** slot gone between request and acceptance → acceptance fails atomically, request stays `requested`, staff is offered alternatives to propose; proposal declines/expires → original request stays pending without extending its SLA; SLA elapses → auto `expired`; customer withdraws → `cancelled`, free because nothing was confirmed or charged; payment link expiry closes the payment attempt without rewriting the request-time terms.
- **Acceptance outcome:** No `requested` booking ever occupies a confirmed allocation; every decision has a named actor, timestamp, and reason in the audit trail; a rejected request has produced zero charges.

## J3 — Guest management-link access

- **Preconditions:** Booking exists; customer email captured at booking; link signing key present.
- **Actor / capability:** Guest holding a token. Every token is scoped to **one booking and one intent** — never to a customer's whole history and never to another tenant.
- **Happy path:**
  1. Every booking email carries a scoped, expiring **view** token (opaque, single booking, no PII in the URL).
  2. Opening it shows read-only booking detail: time with timezone, price, snapshotted cancellation terms, location.
  3. Each **sensitive action is its own intent with its own token**: `reschedule`, `cancel`, `refund_request`, `request_alternative`, `data_export`, `data_correction_request`, `data_deletion_request`, `data_restriction_request`. A view token cannot be replayed as any of them ([adr/0004](./adr/0004-guest-first-booking-and-management-links.md) decision 6).
  4. Requesting a sensitive action issues that intent's token and emails an OTP to the address on the booking. The OTP is bound to **that token and that intent**, so an OTP issued for `cancel` cannot authorize `reschedule`.
  5. Token and OTP are verified together at the moment of the action, and the action token is consumed on success. **No session is created and no elevated state survives the action** — a general-purpose grant is precisely the defect ADR-0004 decision 6 forbids. A second sensitive action means a second intent-scoped token and a second OTP.
  6. The action then proceeds through the same guards a staff actor would face.
- **Intents and where each lands:** `view` → read only; `reschedule` → J4; `cancel` → J5; `refund_request` → staff-reviewed refund; `request_alternative` → J2; and each `data_*` intent → the export/correction/deletion/restriction workflow in [adr/0008](./adr/0008-privacy-retention-and-support-access.md). Privacy intents create requests and never directly mutate an immutable snapshot. A verified correction updates canonical contact data and revokes outstanding tokens; historical snapshot data changes only through the retention/redaction job.
- **State transitions:** None by itself; it is the gate in front of J4 and J5.
- **Policy consulted:** per-intent token TTL, OTP TTL, OTP attempt cap, re-issue cooldown ([adr/0004](./adr/0004-guest-first-booking-and-management-links.md)).
- **Side effects:** OTP email; audit `manage_link.opened`, `otp.issued`, `otp.verified`, `otp.failed`, and the action taken — each carrying the intent and a hashed IP, never the token; no analytics event carries a token. Every outstanding token for the booking is revoked when the booking changes state or its email address changes.
- **Out of reach from any of these tokens:** any other booking, any other customer, any stored payment instrument or the ability to charge one, staff personal data, tenant operational data, and every Dashboard surface (ADR-0004 decision 14).
- **Exceptions:** expired token → self-service re-issue to the address on file (the new link is emailed, never displayed on screen); wrong OTP → attempts capped then cooled down; email changed at the mailbox level → staff-mediated verification, never a link sent to an unverified new address; token in a shared inbox → it grants read of one booking and nothing more, because every mutation needs a fresh intent-scoped token **and** an OTP delivered to the booking's address.
- **Acceptance outcome:** A link or token from tenant A resolves nothing under tenant B; no sensitive mutation completes on a token alone; a verified OTP leaves behind nothing reusable for a second action; token compromise grants read of one booking and mutation of none.

## J4 — Reschedule

- **Preconditions:** Booking `confirmed`; the snapshotted policy permits change at this lead time; the customer's snapshotted `reschedule.max_per_booking` allowance is not exhausted; a valid alternative slot exists.
- **Actor / capability:** Customer via J3 (a `reschedule` intent token + OTP), or staff with `booking.reschedule` within their scope (assigned / location / tenant).
- **Happy path:**
  1. Availability is recomputed using the **snapshotted duration** and current buffers/current feasibility rules. Buffers are operational and may change for the new resource or time.
  2. Server locks the booking revision.
  3. New allocation is inserted, then the old one released — **one transaction** (§15.7).
  4. Revision increments; old time, actor, and reason are preserved in lineage.
  5. **No repricing.** A v1 reschedule carries the snapshotted price forward unchanged — the delta is always zero, so no additional charge and no partial refund is created ([adr/0006](./adr/0006-policy-snapshot-rules.md)).
  6. Notification and calendar idempotency keys include the new revision.
- **State transitions:** `confirmed → confirmed` at revision +1. No intermediate cancelled state ever exists.
- **Policy consulted:** snapshotted duration, cancellation/reschedule entitlement and price; current buffers, minimum notice, horizon, opening hours, blackouts, and conflicts; and the **snapshotted** `reschedule.max_per_booking` (default 2). Staff reschedules do not consume the customer's allowance.
- **Side effects:** Email `booking_rescheduled` to customer and staff; superseding add-to-calendar payload, old export marked `stale`; audit with both times and the actor; analytics `booking_rescheduled` with lead time.
- **Exceptions:** new slot taken in the race → transaction rolls back, **original booking remains valid and confirmed**, customer is shown fresh availability; staff-side conflict → the assignment is offered, not forced; repeated failure → staff can hold the new slot manually and complete the move from the Dashboard.
- **Acceptance outcome:** A reschedule that fails leaves the original allocation intact and the customer notified of nothing; a reschedule that succeeds leaves exactly one active allocation and full history of the previous time.

## J5 — Cancellation and refund

- **Preconditions:** Booking in `confirmed`, `requested`, or `checked_in`; actor permitted.
- **Actor / capability:** Customer via J3 (a `cancel` intent token + OTP); staff with `booking.cancel`; refund issuance additionally requires `refund.issue`.
- **Happy path:**
  1. Server evaluates the **snapshotted** cancellation cutoff, the actor's permission, and current state.
  2. Booking is cancelled atomically and the allocation released, freeing the slot for others immediately.
  3. Refund eligibility and amount are computed from the snapshotted `refund.schedule` — applied to the amount actually captured — and recorded on a **separate** refund ledger row in USD cents.
  4. The provider executes the refund asynchronously against the tenant's connected account; webhook reconciliation sets the final refund status.
  5. Customer and staff receive state-specific notifications; the customer email states the refund amount and expected timing without asserting it has settled.
- **State transitions:** `confirmed | requested | checked_in → cancelled`; refund ledger `eligible → pending → succeeded / failed / manual_review`.
- **Policy consulted:** `cancellation.cutoff_minutes`, `refund.schedule`, `refund.deposit_non_refundable`, `cancellation.customer_self_service`, staff override permission. A requested booking has a snapshot, but withdrawal is free because it was never confirmed and no payment was captured.
- **Side effects:** Email `booking_cancelled` (+ `refund_issued` when the refund settles); Stripe refund on the connected account; audit with actor, reason, computed tier, and amount; analytics `booking_cancelled` with lead time; slot returns to availability.
- **Exceptions:** refund fails for insufficient connected balance → refund ledger `manual_review`, Dashboard task, tenant alerted, customer told it is in progress — the **booking stays cancelled** either way; partial refund → recorded as its own ledger row, not by editing the charge; dispute opens → dispute state tracked separately, no automatic second refund; cancellation after the cutoff → the request is not silently rejected: the customer sees the terms that apply and can send a staff-reviewed request.
- **Acceptance outcome:** Cancellation never blocks on the payment provider; every cancelled booking has exactly one refund ledger outcome, including "not eligible"; refund amount is reproducible from the snapshot alone.

## J6 — Check-in

- **Preconditions:** Booking `confirmed`; now inside the check-in window — at or after `start − checkin.window_opens_minutes_before` and at or before `start + checkin.window_closes_minutes_after`.
- **Actor / capability:** Staff with `booking.check_in` (assigned staff or front desk in scope). Outside the window the action is shown with its reason and completes only for a holder of `booking.check_in_override`.
- **Happy path:** Day view lists today's bookings in the location's timezone → staff taps check-in → booking event written with actor and timestamp → row moves to an "in progress" group.
- **State transitions:** `confirmed → checked_in`.
- **Policy consulted:** `checkin.window_opens_minutes_before`, `checkin.window_closes_minutes_after`, snapshotted `checkin.required_before_completion`, and snapshotted `booking.status_correction_window_hours`. The closing bound is what stops a check-in being recorded three days after the appointment.
- **Side effects:** Audit `booking.checked_in`; an out-of-window check-in additionally writes an override audit row with actor, timestamp, **mandatory reason**, and the booking's scheduled start; no customer email by default; analytics feeds attendance and no-show denominators.
- **Exceptions:** arrival outside the window → check-in requires `booking.check_in_override` and a reason; wrong booking checked in → a holder of `booking.correct_status` may run `booking.check_in_undo` within the snapshotted correction window, retaining both events; customer arrives after no-show → J8 correction path.
- **Acceptance outcome:** Every completed booking has either a check-in event or an explicit tenant setting that check-in is not required; no-show and attendance rates reconcile against the booking event ledger.

## J7 — Completion

- **Preconditions:** Booking `checked_in`, or `confirmed` with check-in not required.
- **Actor / capability:** Staff with `booking.complete`; or SYS auto-completion.
- **Happy path:** At or after the end time, staff marks complete. Auto-completion may run only when `checkin.required_before_completion = false` and `completion.auto_complete_after_minutes` is non-null. The booking enters revenue and utilization reporting.
- **State transitions:** `checked_in → completed`, or `confirmed → completed` (auto).
- **Policy consulted:** `completion.auto_complete_after_minutes`, snapshotted `checkin.required_before_completion`, and snapshotted `booking.status_correction_window_hours`.
- **Side effects:** Audit `booking.completed`; contributes booked minutes to the utilization numerator (§27.2).
- **Exceptions:** completed in error → holder of `booking.correct_status` corrects to `checked_in` or `confirmed` within the snapshotted window, with reason and KPI recomputation; service ended early → completion requires a reason; job outage → idempotent catch-up without duplicate events.
- **Acceptance outcome:** Where auto-completion is configured **and check-in is not required**, no booking sits `confirmed` beyond the configured delay; utilization equals completed booked minutes ÷ offered minutes with no double counting of rescheduled revisions.

## J8 — No-show

- **Preconditions:** Booking `confirmed`; `no_show.grace_minutes` past scheduled start elapsed with no check-in.
- **Actor / capability:** Staff with `booking.mark_no_show`. **Never automatic** — an unattended booking is not evidence of a no-show.
- **Happy path:** Dashboard flags past bookings with no check-in once `no_show.grace_minutes` has elapsed → staff marks no-show → the snapshotted `no_show.fee_rule` is applied: `forfeit_deposit` retains the deposit already captured and issues no refund, `none` retains nothing. **Forfeiture only — nothing is charged.** Charging beyond what was captured needs card-on-file, which is Phase 2 and which the manage-link surface is forbidden from reaching (ADR-0004 decision 14.3) → customer notified.
- **State transitions:** `confirmed → no_show`; audited correction `no_show → checked_in | completed`.
- **Policy consulted:** `no_show.grace_minutes`, snapshotted `no_show.fee_rule`, `refund.deposit_non_refundable`, and snapshotted `booking.status_correction_window_hours`.
- **Side effects:** Email `no_show_recorded` stating whether the deposit was retained; the forfeiture is recorded on the existing payment ledger row — **no new charge is created**; audit with the deciding actor; analytics no-show rate — denominator is bookings that reached `confirmed` and whose start has passed, **excluding cancellations** (§27.2, [adr/0009](./adr/0009-analytics-definitions.md)). The exclusion runs one way only: a no-show reached `confirmed`, so it stays in the **cancellation** denominator.
- **Exceptions:** marked in error → `booking.correct_status` records the corrected attendance state and both events remain; if money must be returned, `refund.issue` creates a separate refund ledger action; customer disputes → staff can correct or refund without editing history; staff forgets to mark → the flag persists rather than auto-resolving.
- **Acceptance outcome:** No-show rate reconciles to the event ledger; every forfeiture is traceable to a snapshotted `no_show.fee_rule` and a named actor, and no no-show ever produces a charge larger than the amount already captured; a correction leaves an auditable pair of events, not an overwrite.

## J9 — Staff-created booking on behalf of a customer

- **Preconditions:** Staff authenticated with a live membership; customer contact details available (existing directory record or new).
- **Actor / capability:** `booking.create_on_behalf` within scope — staff: assigned only; scheduler: tenant; location manager: their locations; tenant admin: tenant. Scope is resolved from **current database state**, not from a JWT claim (§4.2).
- **Happy path:**
  1. Staff selects customer (or creates a directory record), service, resource, and time.
  2. Staff may override advisory constraints — outside published hours, inside minimum notice — where the capability permits; the override reason is mandatory and audited.
  3. The **exclusion constraint is never overridable**: a double-booking is rejected for staff exactly as for customers.
  4. Payment handling: mark as paid offline, send a payment link, or waive per policy.
  5. Consent and intake are recorded as staff-captured, attributed to the staff actor.
- **State transitions:** `— → held → confirmed` (or `→ pending_payment` when a link is sent).
- **Policy consulted:** capability scope, override permissions, `service.payment_mode`, `service.deposit_rule`, snapshot rules (the snapshot is taken here exactly as in J1).
- **Side effects:** Email `booking_confirmed` to the customer, sent from the tenant's brand — with a management link so the guest keeps self-service; audit `booking.created` records `on_behalf_of` and any override; analytics tags the booking `source = staff` so it does not distort funnel conversion.
- **Exceptions:** customer has no email → booking allowed, notification suppressed, Dashboard flags that the customer cannot self-manage; staff scope insufficient → the action is not shown and is refused server-side; the customer's contact detail is a duplicate → directory merge is offered rather than silently creating a second record.
- **Acceptance outcome:** A staff-created booking is indistinguishable from a customer-created one in correctness guarantees and distinguishable in reporting; no staff role can create an overlapping allocation on a capacity-one resource.

---

# Non-happy states

"Show an error" is not a recovery path. Every row states what the customer sees, what staff sees, what the system does, and what returns the user to a working outcome.

| Class | Case | Customer sees | Staff sees | System does | Recovery path |
| --- | --- | --- | --- | --- | --- |
| EMPTY-1 | No published services | A branded page explaining that online booking is not yet available, with the tenant's phone and email | Dashboard onboarding checklist with "publish your first service" as the blocking step | Suppresses the booking entry point rather than rendering an empty picker; no analytics funnel is started | Staff publishes a service; the Client page is revalidated on publish, not on a timer |
| EMPTY-2 | Service exists but no staff or resource is eligible | "This service isn't bookable online right now" plus the contact fallback | Warning on the service: "no eligible resource — this service is invisible to customers" | Refuses to show slots that cannot be allocated; records `none_available` with reason `no_eligible_resource` | Staff assigns a resource or unpublishes the service; the warning clears automatically |
| EMPTY-3 | No slots in the requested range | The next available date is offered explicitly ("next opening: Tue 14 Oct"), plus a wider-range jump | Availability diagnostics naming the binding constraint: schedule, buffer, notice, horizon, or a blackout | Computes time-to-next-slot server-side and records `slots_none_available` with the binding reason (§27.2) | Customer jumps to the offered date; staff sees which rule suppressed the day and can adjust it |
| PENDING-1 | Awaiting staff approval | Status page reading "awaiting confirmation", the tenant's typical response time, and a withdraw button | Pending-action queue with an SLA countdown and one-click accept / propose / decline | Nothing is charged; the SLA timer runs; a staff reminder fires before breach | Staff decides; SLA breach auto-expires the request and notifies both sides — it never sits silently |
| PENDING-2 | Awaiting payment | Countdown driven by the **remaining `hold.ttl_seconds` on the hold** — the only clock there is — plus the amount in USD and a resume-payment button | Booking listed as `pending_payment` with the same remaining hold time | Holds the allocation for the hold's remaining TTL and nothing longer; cancels the intent at the provider on expiry | Customer resumes on the same hold; after expiry, the confirmation email is replaced by a rebook link that pre-fills the same service and time if still free |
| PENDING-3 | 3DS or async payment in flight | "Confirming your payment" — never a confirmation, with the same hold countdown | Booking stays provisional only until the hold deadline | The redirect never marks it paid. At `expires_at` the hold releases unconditionally and provider cancellation is requested; a later verified success follows FAILED-4 | Webhook confirms before expiry, or late-settlement reconciliation resolves the durable payment attempt afterward |
| FAILED-1 | Payment provider unavailable | "We can't take payment right now"; where the tenant permits, a pay-later hold is offered instead of losing the booking | Alert on payment provider health; affected bookings listed | Retries with backoff; keeps the hold alive to its bound; never confirms without verified payment | Customer retries or takes the pay-later path; staff can send a payment link once the provider recovers |
| FAILED-2 | Connected account capability suspended or disconnected | Paid services are hidden, free/pay-on-site services stay bookable | Prominent banner: "payments disabled — reconnect Stripe", with the affected service list | Automatically degrades paid services rather than failing at checkout | Tenant reconnects; services restore automatically; existing bookings are unaffected |
| FAILED-3 | Email provider down | Confirmation shown on screen with a "resend email" control and a downloadable calendar file | Booking is confirmed and marked `notification: failed` with a resend action (§17.3) | **Booking commits anyway.** Outbox retries with backoff; bounces and complaints suppress future sends | Automatic retry, or authorized manual resend from the Dashboard; the customer never loses the booking because email failed |
| FAILED-4 | Payment succeeded after the hold was lost | If identical re-allocation fails: "Your payment went through but the time was taken", with refund timing or offered alternatives | Separate payment-exception task with customer, amount, and original slot; expired attempt remains closed | Never overbooks or reopens the expired row. Re-attempts identical allocation atomically; success creates a new linked confirmed booking. Failure runs `payment.late_settlement_policy` in a separate exception record | New linked booking confirms, automatic refund settles, or staff creates a customer-approved alternative booking and attaches the payment reference |
| FAILED-5 | Booking transaction deadlock or serialization failure | Nothing — the retry is invisible | Nothing unless retries are exhausted | Bounded retries with jitter (§15.6); the exclusion constraint remains the final guard | On exhaustion the customer is returned to fresh availability with the slot still selected; the incident raises an alert |
| CONFLICT-1 | Slot taken during checkout | "That time was just booked" with the three nearest alternatives on the same day already loaded, and intake answers preserved | Nothing — this is the constraint working | Translates SQLSTATE `23P01` to `slot_unavailable` without disclosing the conflicting booking (§15.2) | One tap moves to an alternative; no re-entry of intake or contact data |
| CONFLICT-2 | Allocation conflict on the staff side (manual entry vs a live customer hold) | Nothing | "This time is held by a customer checking out" with the hold's remaining seconds | Blocks the overlapping write; the exclusion constraint applies equally to staff | Staff waits out the hold, picks another slot, or — with capability — cancels the held checkout with an audited reason |
| CONFLICT-3 | Calendar conflict (external edit or a stale export) | Their calendar entry may be stale after a reschedule | Booking detail marks the previous calendar export `stale` and offers a re-send | v1 is one-way: an external calendar edit **never** mutates a platform booking (§19.4). Two-way sync and external busy-time blocking are deferred | Re-sending the invite supersedes the stale entry; the platform booking stays authoritative |
| CONFLICT-4 | Staff deactivated with future bookings | Nothing yet — no customer email until a resolution is chosen | Blocking task listing every future booking for that staff member, with reassign / reschedule / cancel per booking | Login and new availability stop immediately; state remains `deactivation_pending` until all future bookings resolve. Policy chooses automatic reassignment attempt or deliberate deferral | Staff reassigns, reschedules, or cancels with J5; only then may the staff/resource become inactive |
| RECOVERY-1 | Expired management link or intent token | "This link has expired — send me a new one" | Nothing | Issues a fresh, intent-scoped token **only** to the address already on the booking; the reissued token still requires its own OTP | Customer clicks through the new email; no support ticket needed |
| RECOVERY-2 | Duplicate submit or double-click | One confirmation | One booking | Idempotency record returns the original result for same-key/same-payload; same-key/different-payload is rejected (§15.5) | Nothing needed — one booking, one charge, one email |
| RECOVERY-3 | Provisioning step failed | Instance not yet live; no customer impact | Platform Admin shows the failed step, attempt count, and sanitized error | Every step is idempotent; retry resumes at the failed step | Operator fixes the cause and retries; rollback deactivates infrastructure only (§7.2) |

---

# Worked examples

The verification artifact required by issue #2: one instant-confirmation and one request-to-book walkthrough, each traced through booking → payment → email → cancellation → refund → privacy → reporting.

## Example A — Instant confirmation with a deposit

Tenant: a salon in `America/New_York`. Service: 60-minute colour, $120.00 (`12000` cents), `service.deposit_rule = percent 30` → `3600` cents, 15-minute after-buffer, `cancellation.cutoff_minutes = 1440` (24 h), `refund.schedule` paying 100% at or before the cutoff.

| # | Step | Result |
| --- | --- | --- |
| 1 | Guest picks Thu 09:00 with Dana | `hold.create` → `held`, range `[09:00, 10:15)` including the buffer; TTL running |
| 2 | Intake + consent accepted | Consent text **version** captured; intake answers stored against the snapshotted schema |
| 3 | Deposit checkout | Checkout Session and underlying PaymentIntent for `3600` USD cents are built from the hold's resolved price on the salon's connected account; state `pending_payment`. The payment window is whatever remains of `hold.ttl_seconds` |
| 4 | 3DS challenge | Booking stays provisional; the redirect proves nothing |
| 5 | Verified webhook | §15.6 runs: hold valid, snapshot revision 1 written and matched against the hold's resolved `12000` cents (a mismatch would fail the confirmation), allocation inserted, outbox rows queued → `confirmed`, revision 1 |
| 6 | Email | `booking_confirmed` with the time in `America/New_York`, deposit paid, `8400` cents due at the visit, snapshotted cancellation terms, a management link, and an add-to-calendar link |
| 7 | Cancellation, 40 hours ahead (2400 minutes) | Guest opens the view link, requests cancellation, receives a `cancel` intent token and an OTP bound to it, and cancels. No session is created. Cutoff evaluated against the **snapshot** (`1440` minutes), not against the salon's policy edit made yesterday; 2400 ≥ 1440, so the 100% tier applies. `confirmed → cancelled`; the slot returns to availability immediately |
| 8 | Refund | Refund ledger `eligible → pending`, `3600` cents against the connected account. Provider webhook sets `succeeded`; `refund_issued` email follows. Had the balance been insufficient, the row would sit `manual_review` — the cancellation would still have completed |
| 9 | Privacy | Contact is anonymized 24 months after last booking activity; sensitive intake/rendered consent is removed 12 months after completion/cancellation; financial and minimal consent evidence follows the seven-year evidence clock. A verified deletion request accelerates personal redaction subject to legal hold. No PAN is ever stored. Exact periods require independent legal review |
| 10 | Reporting | Funnel: `service_view → availability_requested → slots_shown → slot_selected → hold_created → intake_completed → payment_started → booking_confirmed`. Then: 1 confirmed, 1 cancelled with a 40-hour lead time, `3600` cents gross and `3600` cents refunded — net zero revenue; **zero** booked minutes toward utilization because the booking never completed; excluded from the no-show denominator because it was cancelled |

## Example B — Request-to-book with full payment on approval

Tenant: a photography studio in `America/Los_Angeles`. Service: 3-hour session, $450.00 (`45000` cents), `service.approval_required = true`, `service.payment_mode = full` on approval, `cancellation.cutoff_minutes = 2880` (48 h), `refund.schedule` paying 50% inside that cutoff, `request.response_sla_hours = 24` (inside the 1–168 range; the platform default is 48).

| # | Step | Result |
| --- | --- | --- |
| 1 | Guest requests Sat 13:00; `service.request_holds_allocation = false` (the default) | `— → requested`; snapshot revision 1 captures the $450 terms, consent, intake schema/answers, locale, and timezone. No allocation remains, so the slot stays publicly bookable until acceptance |
| 2 | Notifications | `customer_request_received` (states "not yet confirmed") + `staff_request_alert`; SLA countdown starts |
| 3 | Staff accepts 6 hours later, well inside the 24 h wall-clock SLA | The **same** atomic allocation check runs for the first time; the slot was still free → allocation taken as a fresh hold; `service.payment_mode = full` → `pending_payment` |
| 4 | Payment link | `request_accepted_pay_now` email for `45000` cents on the studio's connected account; the link expires with that hold's `hold.ttl_seconds`, not on a separate payment window |
| 5 | Guest pays; verified webhook | `pending_payment → confirmed`; request snapshot revision 1 remains authoritative, because acceptance and payment use **request-time** commercial terms |
| 6 | Email | `booking_confirmed` with the time in `America/Los_Angeles`, receipt, snapshotted terms, a management link, an add-to-calendar link |
| 7 | Cancellation, 12 hours ahead — 720 minutes, inside the `2880`-minute cutoff | Guest requests cancellation, receives a `cancel` intent token plus an OTP bound to it, and cancels; the token is consumed and no session remains. `confirmed → cancelled`; refund tier resolves to 50% of the `45000` captured = `22500` cents. The customer is shown the applicable term **before** confirming the cancellation, and can instead reschedule at no price change if `reschedule.cutoff_minutes` and the snapshotted `reschedule.max_per_booking` still allow it |
| 8 | Refund | Refund ledger row for `22500` cents; the retained `22500` cents stays on the studio's connected account. Partial refund is its own ledger row — the original charge is never edited. A later dispute would open a separate dispute state, not a second refund |
| 9 | Privacy | Same classes as Example A plus the request/decision correspondence. The accept/reject decision, actor, and reason are audit evidence and survive a customer deletion request in de-identified form. Support access to any of this requires an approved, time-limited, banner-visible session with an append-only trail; there is no silent impersonation (§4.3) |
| 10 | Reporting | Request funnel: `booking_requested → request_accepted` with a 6-hour time-to-decision against the 24-hour SLA. Approval-rate denominator is requests **decided**, excluding those the customer withdrew. Revenue `45000` cents gross, `22500` cents refunded, `22500` cents net. Cancellation-rate denominator excludes never-confirmed requests; no-show is not applicable |

Both examples confirm the required property: **the booking record, not the payment redirect and not the email, is authoritative at every step**, and no journey depends on a provider being up to reach a correct state.

---

# Acceptance criteria trace (§31)

## Product

| §31 criterion | Where satisfied | Evidence to produce |
| --- | --- | --- |
| A customer can discover, book/request, pay when enabled, confirm, reschedule, and cancel under snapshotted policy | J1, J2, J4, J5; instant snapshot at confirmation and request snapshot at submission | E2E covering both worked examples end to end, including a policy edit between request/booking and cancellation that must **not** change the applied terms |
| Dashboard staff can operate the full daily workflow without database or Platform Admin access | J2 (approve/decline), J4, J5, J6, J7, J8, J9; CONFLICT-2, CONFLICT-4, FAILED-3, FAILED-4 queues | Dashboard-only walkthrough of a full operating day: create, approve, reschedule, check in, complete, mark no-show, correct it, cancel with refund, resend a failed email |
| Empty / no-slot, pending approval / payment, provider failure, and conflict states have useful recovery paths | The non-happy states table — EMPTY-1..3, PENDING-1..3, FAILED-1..5, CONFLICT-1..4, RECOVERY-1..3 | One test per row asserting the stated customer view, staff view, and recovery — not merely a non-500 response |
| English and Arabic functionally complete; RTL, keyboard, focus, mobile, validation, screen-reader pass WCAG 2.2 AA | Every customer-visible string in J1–J8 and every non-happy row; see [design-system](./design-system.md) | Localization parity check plus the agreed accessibility review over the booking, management-link, and Dashboard queue flows |

## Isolation and booking correctness

| §31 criterion | Where satisfied | Evidence to produce |
| --- | --- | --- |
| Automated tests demonstrate zero cross-tenant access for every principal/operation surface | J3 (per-intent token scoping, no session), J9 (capability scope resolved from live membership, §4.2) | RLS matrix, positive and negative, for guest link, customer, staff, scheduler, location manager, tenant admin, and support session |
| 100 concurrent capacity-one attempts produce exactly one active allocation | `hold.create` guard and the §15.2 exclusion constraint; CONFLICT-1, CONFLICT-2 | Concurrency test asserting exactly one `confirmed` allocation and 99 `slot_unavailable`, with no `23P01` detail leaked to the client |
| Idempotent retry produces one logical booking / payment / message | RECOVERY-2; idempotency claim in `hold.create` and §15.6 step 2; notification keys include `(booking_id, revision)` | Same-key/same-payload retry returns the original result; same-key/different-payload is rejected; exactly one charge and one email exist afterwards |
| Reschedule failure leaves the original booking valid | J4 — new allocation inserted before the old is released, in one transaction (§15.7) | Test that races a reschedule against a competing booking and asserts the original allocation, revision, and snapshot are untouched |
| DST gap / duplicate and timezone display tests pass | §15.8 applied at availability, hold range construction, reschedule, email, calendar export, and Dashboard detail | Spring-forward nonexistent-time and fall-back duplicated-time tests; timezone label asserted at slot selection, review, confirmation, email, export, and Dashboard |
| Booking commits while providers are unavailable, where business rules permit | FAILED-1, FAILED-2, FAILED-3; §17.3 outbox model | Provider-outage simulation: email down → booking still confirms; payments down → paid services degrade rather than fail at checkout |
| Payment redirect cannot falsely mark a booking paid; reconciliation detects provider success after timeout | PENDING-3, FAILED-4; payment transitions are webhook- or reconciliation-driven only | Forged/replayed redirect leaves the booking provisional; expiry releases the hold even during 3DS; late success creates a new linked booking only after successful atomic allocation, otherwise a separate exception task—never an overbooked slot or reopened expired row |
