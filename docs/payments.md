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

Stripe charge liability, tax/KYC duties, PCI SAQ and scope, and production
enablement all require independent provider, legal, finance, and tax review.
This document is an architecture contract, not a compliance conclusion.
