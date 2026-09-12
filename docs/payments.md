# Booking payments

Issue #21 establishes the canonical commerce boundary. Booking payments are
tenant-as-merchant-of-record funds and are never combined with platform SaaS
subscriptions or usage billing.

The `PaymentProvider` interface in `@wlbp/integrations` is the only contract
booking code consumes. A provider adapter translates its own SDK objects into
the neutral onboarding, payment, refund, dispute, payout, and verified webhook
types. Stripe is the first adapter profile: Accounts v2, Stripe-hosted
onboarding, Checkout Sessions, direct charges on the tenant connected account,
and no booking application fee. No Stripe SDK import belongs in booking-domain
packages.

The database stores integer minor units beside an ISO 4217 currency, provider
object references, payment state, and an append-only commerce ledger. It does
not store PAN, CVC, expiry, provider credentials, webhook signing secrets, or
an unverified webhook payload. `payment_status` remains independent of
`booking_status`; only a verified webhook or server reconciliation may move a
payment to a settled state.

Onboarding and payout/provider-credential changes require a current tenant
administrator or billing/integration capability, recent authentication, and
MFA/step-up. The status RPC exposes only the narrow authoritative account
projection. Provider references are never shown as credentials in Platform
Admin or an instance application.

## Taking a payment (issue #22)

`payment_mode` on the published service revision is the rule: `none`, `deposit`,
or `full`. Nothing else decides whether money is owed, and a browser decides
nothing at all.

The journey is `create_hold_v1` → `begin_checkout_v1` → the `stripe-checkout`
Edge Function → the `stripe-webhook` Edge Function → `settle_payment_v1`. The
hold stays authoritative for capacity and verified provider state stays
authoritative for money; neither is inferred from the other.

- **The server prices it.** `resolve_payment_amounts_v1` is immutable and is the
  only place a deposit, balance, or tax figure is decided. A fixed
  `deposit_minor_units` wins over `deposit_percent_bps`, both are clamped to the
  total, and an unpublished rule falls back to half. An amount submitted by a
  client is read by nothing.
- **A draft carries the booking across the round trip.** Contact, intake,
  consent, locale and the request context are captured before the customer
  leaves, because settlement runs with no browser present and a value that
  arrives after payment is a value an attacker chose after paying. The draft is
  deleted the moment the booking holds those values immutably.
- **One confirmation engine.** `confirm_booking_v1` gained one optional argument
  and keeps every check it already made. A paid booking and an unpaid one are
  confirmed by the same code. A verified payment substitutes for the browser
  session as proof that the caller owns the hold, and only because it can only
  reach `succeeded` through a signed event for that exact hold.
- **The hold is never extended.** A checkout that outlives its hold is the
  late-success case, not a reason to deny capacity to somebody else for longer.
- **Late success is an exception, never an overbooking.** Money that arrives for
  capacity that is gone sets `payment_attempts.status='exception'` with a named
  `exception_code` (`hold_lost`, `slot_taken`, `policy_changed`,
  `draft_missing`), records the charge in the ledger because it really did move,
  and queues a refund in `app.payment_refunds` for the provider call that
  happens outside the transaction.
- **Idempotent at every layer.** The provider event id, the checkout
  idempotency key, the provider's own idempotency header, and a partial unique
  index that permits one live attempt per hold. Twenty simultaneous deliveries
  of one payment produce one booking, one charge, one ledger entry and one
  allocation; the concurrency gate asserts exactly that.
- **An unknown event is ignored, not failed.** A provider sends far more than a
  booking platform needs, and treating noise as failure would turn it into
  refunds. `checkout.session.completed` for an unpaid asynchronous session is
  likewise not a success, and is settled by the later event that is.

## After the payment (issue #23)

Issue #15 decided *whether* a cancellation earns a refund and *how much*, from
the snapshotted policy. Issue #23 executes that and handles everything that can
go wrong afterwards. It recomputes no eligibility and invents no amount.

- **One logical refund per eligible cancellation.** `request_refund_v1` is
  idempotent on its key, partial refunds accumulate, and together they can never
  exceed the charge. Issuing money needs `refund.issue`, which is an approval
  grant for most roles and therefore carries a step-up.
- **A refund is a durable job.** `claim_refund_batch_v1` claims it under a
  visibility timeout, exactly like the notification worker, so a crashed worker's
  claim expires and the refund is retried rather than stranded. Retries back off
  exponentially and are bounded; past the bound a human owns it, because
  unreturned money is not something to give up on quietly.
- **One webhook intake for every provider object.** Issue #22's
  `record_payment_event_v1` was generalized rather than duplicated. Dedup is on
  the provider's own event id, and **a terminal state is never walked backwards
  by an older event** — providers reorder, and a redelivered "won" arriving after
  "lost" would otherwise silently reverse a real outcome.
- **One queue, not five.** `app.payment_exceptions` carries refund failures,
  unmatched refunds, disputes, payout failures, restricted accounts, orphaned
  payments and reconciliation mismatches, keyed so the same problem found ten
  times is one row. It holds stable codes and amounts and is incapable of
  carrying customer data, which is why it is gated on a finance capability rather
  than on `customer.pii.view`.
- **Reconciliation is safe to run on any schedule.** `reconcile_commerce_v1`
  mutates no money; it finds records that have been waiting too long to still be
  explainable and says so. Running it repeatedly produces the same one row.
- **The ledger never changes its mind.** `app.commerce_ledger_entries` is
  append-only. A correction is a compensating entry, never an edit, because the
  ledger is the explanation of what happened rather than a summary of what we
  currently believe.
- **Money state never becomes booking state.** A disputed charge does not
  un-happen a booking (invariant 9).

Stripe charge liability, tax/KYC duties, PCI SAQ and scope, and production
enablement all require independent provider, legal, finance, and tax review.
This document is an architecture contract, not a compliance conclusion.
