# 0003. Merchant of record and payments

Purpose: lock who is merchant of record for booking payments, how the payment provider is abstracted, and which events are allowed to change payment state.

Authoritative source: [the architecture spec](../../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md) §18.1–§18.4, §23.4, §29, §30, §31. This ADR does not depart from it.

- **Owner:** @SEIFSEIF4
- **Status:** Accepted
- **Date:** 2026-09-04
- **Supersedes / Superseded by:** —

## Context

The merchant model is the decision with the largest regulatory and financial blast radius in the product, and §18.1 requires it to be settled before any payment code is written. §29 lists "wrong merchant-of-record model" as a top risk with regulatory and financial exposure.

The forces in play:

- If the platform collects customer funds and remits proceeds to tenants, it takes on materially different payment, refund, dispute, tax, KYC, and licensing responsibilities (§18.1). That is a company-shaped decision, not an engineering preference.
- Stripe distinguishes direct, destination, and separate charge-and-transfer models; the choice changes who appears on the customer's statement, who owns the dispute, and where the funds land (§18.1).
- Booking money (customer to tenant) and SaaS money (tenant to platform) are two commercial systems. §18.1 requires them kept separate; mixing them corrupts both revenue reporting and refund liability.
- Provider availability is regional. §18.4 warns against making one provider the only provider if other regions are targeted, which forces a provider-neutral seam even with one implementation today.
- Payment providers are eventually consistent. §18.3 and §31 require that a browser redirect never proves payment, that every webhook is signature-verified and deduplicated, and that reconciliation catches "provider succeeded but our response timed out".
- PCI scope is set by where card data flows (§23.4). Architecture can reduce scope; it cannot self-declare compliance.

## Decision

1. **The tenant is merchant of record for booking payments.** The tenant contracts directly with the payment provider, appears on the customer's statement, owns the underlying goods-and-services obligation, and carries the refund and chargeback liability for bookings.
2. **The platform does not hold tenant customer funds by default.** Booking funds settle to the tenant's connected account. Any future model in which the platform receives, holds, or remits customer funds is a different decision requiring a superseding ADR and independent legal review.
3. **Stripe Connect is the first provider. V1 uses Stripe Accounts v2 merchant accounts and direct charges created on the tenant's connected account.** Stripe-hosted onboarding and the connected-account status API establish whether payments may be enabled. The charge model is platform-fixed, never tenant-editable. It requires independent legal, tax, finance, and provider review before the first production charge; a review that rejects the model requires a superseding ADR, rather than an implementer choosing another charge type.
4. The adapter implements the `PaymentProvider` contract of §18.2 and nothing else may talk to a provider SDK. Its responsibilities are exactly: onboard and report connected-account status; create a checkout or payment intent; retrieve and reconcile a payment; capture or cancel an authorization; refund fully or partially; retrieve dispute and payout status; and verify and normalize an inbound webhook into a provider-neutral event.
5. The adapter returns provider-neutral types. Provider identifiers are stored in a provider object map on the canonical commerce tables; no provider-specific field name, status string, or error code leaks into booking domain code, the database schema outside that map, the API, or the UI.
6. **Platform SaaS subscription and usage billing is a separate billing system** with its own tables, its own provider account, its own webhooks, and its own reporting. Booking payments and SaaS billing never share a ledger, an invoice, a webhook endpoint, a reconciliation job, or a revenue report. A code path that reads both is a defect.
7. Payment is optional per service and configurable as **deposit or full payment**. A deposit is stored as its own amount in minor units with the currency (see ADR 0002), alongside the total, so the balance due is always derivable and never inferred from a percentage at read time. The deposit rule, the total, and the currency are snapshotted onto the booking at creation and are not affected by later tenant price edits.
8. `payment_status` and `booking_status` are separate state machines on separate columns (§18.2). A booking may be confirmed and unpaid, or paid and cancelled; no code may derive one from the other.
9. **A payment redirect can never mark a booking paid.** The browser return URL is untrusted input. Only a signature-verified provider webhook or a server-side reconciliation call against the provider API may move `payment_status` to a paid state. The confirmation page renders authoritative booking state read from the database (§6.1, §18.3, §31).
10. Every inbound webhook is signature-verified with the provider's documented scheme before the payload is parsed for business meaning. A request that fails verification is rejected, counted, and alerted on; it never reaches the state machine.
11. Every verified webhook event is written to an append-only event ledger keyed by the provider event identifier, and processing is idempotent on that key. Redelivered events are no-ops. Out-of-order events are applied through the state machine, which ignores transitions that move backwards.
12. Reconciliation runs on a schedule and on demand, and resolves: payments the provider succeeded but we never recorded, payments we hold as pending past their provider timeout, refunds whose final status never arrived, and amounts that disagree with the provider. Discrepancies route to an operator exception queue rather than auto-correcting silently.
13. If payment arrives after its hold expired, the booking is not silently overbooked. The defined policy runs: attempt re-allocation, and on failure route to the refund and manual-resolution path with both customer and staff notified (§18.3).
14. **Refund authority:** the tenant authorizes refunds. Refund eligibility and amount are computed from the cancellation terms snapshotted onto the booking and are recorded as a separate commerce action before any provider call. The platform does not issue refunds on a tenant's behalf except under a documented, audited, time-boxed support-access grant, and never as a routine operation. A refund is only final when the provider confirms it via verified webhook or reconciliation.
15. **Dispute handling:** disputes belong to the tenant as merchant of record. The platform surfaces dispute state, deadlines, and the booking evidence it holds — policy snapshot, consent record, notification delivery events, and booking history — and never submits evidence or accepts liability on the tenant's behalf.
16. **PCI scope reduction: the system never touches card data.** Card entry happens only in provider-hosted checkout or provider-hosted isolated payment components. No card number, CVC, expiry, or full PAN is accepted by our forms, transmitted through our servers, written to our database, or emitted to logs, traces, error reports, or analytics. The correct SAQ and scope must be confirmed with the acquirer and a QSA; this architecture reduces scope but makes no compliance claim (§23.4).
17. Payment provider credentials and webhook signing secrets are held as secret references in the platform's secret store, never in an instance repository, never in client-side code, and never in an ADR.
18. Tax obligations, information reporting (including any 1099-K style obligation), settlement liability, and consumer-protection duties follow the merchant-of-record model in decision 1 and rest with the tenant. Platform-side obligations — including any obligation arising from facilitating payments — are undetermined by this ADR and **require independent legal review** before the first production charge.
19. **Checkout Sessions is the first web checkout adapter.** It creates a provider-hosted checkout on the connected account and stores the Checkout Session, underlying PaymentIntent, charge, refund, dispute, and payout identifiers only in the provider object map. The platform never handles raw card data.
20. **V1 takes no application fee on booking payments.** Platform SaaS subscription and usage billing remains the separate system in decision 6. Adding an application fee, changing who bears provider fees or negative balances, or moving the platform into the booking funds flow requires a superseding ADR and independent legal review.

### Stripe implementation profile

Direct charges keep the booking charge, balance transaction, refund, and dispute on the tenant's connected account. Provider processing fees and negative balances follow Stripe's connected-account configuration and contract; the platform does not promise a liability outcome that the provider agreement or applicable law does not support. Onboarding readiness, charges-enabled state, payout status, disputes, and negative-balance conditions are therefore explicit adapter outcomes surfaced to the tenant and to platform operations.

Issues #21 and #22 may design and implement against this profile. Production enablement remains gated by the independent reviews in decisions 3, 18, and 20 and by Stripe approval of the platform and connected-account configuration.

Alternatives considered:

- **Platform as merchant of record.** Rejected for v1: it makes the platform responsible for customer funds, refunds, disputes, KYC, licensing, and tax across every tenant's business — a materially different company (§18.1, §29).
- **Direct provider SDK calls from booking code.** Rejected: it welds the domain to one provider and blocks the regional adapter §18.4 requires.
- **One billing system for both booking payments and SaaS fees.** Rejected: it mixes tenant revenue with platform revenue, corrupts reporting, and creates the appearance of the platform holding customer funds.
- **Trusting the redirect for a fast confirmation UI.** Rejected: it is forgeable and is an explicit production acceptance failure in §31.

## Consequences

### Positive

- Direct charges keep booking funds and provider objects on the tenant's connected account and keep platform SaaS revenue out of the booking ledger.
- The provider seam makes a second, regional provider an adapter implementation rather than a rewrite.
- Separate payment and booking state machines make "paid but not confirmed" and "confirmed but unpaid" representable instead of impossible-but-happening.
- Never touching card data is the single largest PCI scope reduction available.

### Negative / cost

- Tenants must complete provider onboarding and KYC before they can take payment; onboarding state becomes a first-class provisioning concern with its own failure and resume paths.
- The platform has limited leverage over customer refund outcomes, which becomes a support burden when a tenant is unresponsive.
- Webhook ledger, idempotency, reconciliation, and the exception queue are real infrastructure that must exist before the first production charge, not after.
- The provider-neutral adapter costs translation work and loses access to provider-specific conveniences.
- Tax, information reporting, provider-fee, negative-balance, and liability allocation require independent legal, finance, tax, and provider review before production enablement.

## Revisit triggers

- A proposal is made for the platform to receive, hold, or remit customer funds, or to charge an application fee that changes the merchant model.
- A second payment provider or a new payment jurisdiction is targeted, including any KSA work under ADR 0002.
- The selected Stripe Connect charge model, Accounts v2 configuration, or Checkout Sessions integration is proposed to change.
- An application fee on booking payments is proposed.
- Any card data is found in a log, trace, error report, database column, or support ticket.
- A verified-webhook signature failure rate above the agreed alert threshold, or any reconciliation run that finds a discrepancy the exception queue cannot resolve.
- Legal review returns a platform-side tax, information-reporting, or licensing obligation.
- A booking is ever marked paid by anything other than a verified webhook or server-side reconciliation.

## References

- [Architecture spec](../../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md) §6.1, §6.4, §18.1, §18.2, §18.3, §18.4, §23.4, §29, §30, §31
- [Architecture overview](../architecture.md)
- [Glossary](../glossary.md) — merchant of record, deposit, payment status, dispute
- [Release scope](../release-scope.md)
- [Security and privacy](../security-and-privacy.md)
- [References](../references.md) — Stripe charge models, direct charges, Accounts v2, Checkout Sessions, global availability, and SAMA sources; all point-in-time
- [ADR index](./README.md)
- ADR [0002](./0002-region-currency-and-money-representation.md) — region, currency, and money representation
- GitHub issue #2
