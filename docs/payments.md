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

Stripe charge liability, tax/KYC duties, PCI SAQ and scope, and production
enablement all require independent provider, legal, finance, and tax review.
This document is an architecture contract, not a compliance conclusion.
