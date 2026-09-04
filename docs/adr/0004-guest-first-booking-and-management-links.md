# 0004. Guest-first booking and management links

Purpose: lock guest checkout as the default booking path, and lock the security properties of the links that let a guest manage a booking without an account.

Authoritative source: [the architecture spec](../../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md) §5.1, §8.1, §22.1–§22.3, §22.6, §23, §30. This ADR does not depart from it.

- **Owner:** @SEIFSEIF4
- **Status:** Accepted
- **Date:** 2026-09-04
- **Supersedes / Superseded by:** —

## Context

Forcing account creation before a first booking is the largest single drop-off in a booking funnel, and §5.1 already requires that optional account creation must not be mandatory unless the tenant chooses it. §30 records the default as guest booking with a scoped management link.

The forces in play:

- A guest has no session and no password, so the link *is* the credential. Anything the link can do, anyone holding the link can do — and links leak through forwarded email, shared screens, referrer headers, browser history, and support tickets.
- §22.2 already constrains the shape: signed, scoped, expiring, revocable, with email OTP for sensitive views and actions.
- §22.3 forbids customer PII in URL paths and query strings, and requires rate limits by IP, session, tenant, account, and action on public endpoints.
- §22.6 requires the system to survive identifier guessing and enumeration attempts without leaking existence.
- Privacy rights (§23.2) include export and deletion. A guest must be able to exercise them, which makes those actions reachable from a link — and therefore makes them exactly the actions that need step-up.
- Making accounts optional does not make them useless: repeat customers benefit, and the tenant may want them. Optional must mean genuinely optional in both directions.

## Decision

1. **Guest checkout is the default booking path.** A customer completes discovery, slot selection, intake, policy acceptance, payment where required, and confirmation with an email address and the fields the tenant marked required. No password, no account, no email verification step before the booking is created.
2. **Customer account creation is optional** and offered only after confirmation, never as a gate. A tenant may not configure v1 to require an account to book.
3. If a customer later creates an account with the same verified email address, prior guest bookings for that tenant are linked to the account. Linking happens only after email verification, never on unverified claim.
4. A guest manages a booking through a **manage-booking link**: a URL carrying an opaque token that is scoped to exactly one booking, expiring, single-purpose, and revocable.
5. **Entropy and storage:** the token carries at least 128 bits of entropy from a cryptographically secure random source. Only a hash of the token is stored; the plaintext exists in the delivered email and nowhere else — not in the database, not in logs, not in analytics, not in error reports, not in this or any other document.
6. **Single-purpose:** each token authorizes one intent — `view`, `reschedule`, `cancel`, `refund_request`, `request_alternative`, `data_export`, `data_correction_request`, `data_deletion_request`, or `data_restriction_request` — and one booking. A view token cannot be replayed as a cancel token. Privacy intents create a verified privacy-request workflow; they never directly rewrite an immutable snapshot. Issuing a general-purpose token is a defect.
7. **TTL:** a link expires at the earlier of its purpose-specific maximum lifetime or the completion of the booking's lifecycle. View links live at most until a short window after the booking's end time; every action link lives at most 24 hours from issue. Exact values are tenant-visible configuration with these bounds as hard caps enforced server-side.
8. **Single use for actions:** an action token is consumed on successful use and cannot be replayed. View tokens may be reused within their TTL.
9. **Step-up:** every action intent in decision 6 requires an email OTP delivered to the booking's current verified email address, in addition to a valid token. The OTP is short-lived, single-use, rate-limited, and bound to the token and intent, so an OTP issued for one action cannot authorize another.
10. **Revocation on state change:** all outstanding tokens for a booking are revoked when the booking changes state (confirmed, rescheduled, cancelled, completed, no-show), when verified correction changes the canonical contact address, when the customer requests deletion, and when a tenant administrator revokes access. A new link is issued with the notification for the new state. Revocation is enforced server-side at use time against current booking state, never by relying on TTL alone. Historical snapshot contact data is not edited through this surface; correction and erasure follow ADR-0008.
11. **Rate limiting** applies per token, per booking, per email address, per IP, and per tenant, on link redemption, OTP request, and OTP verification, with exponential backoff and lockout after a small number of failed OTP attempts. Bot protection is applied to the public booking and link endpoints. Limits are enforced server-side; the UI never carries the guarantee.
12. **Enumeration resistance:** an invalid, expired, revoked, consumed, or non-existent token produces one identical response — same status, same body, same timing characteristics. The response never discloses whether the booking exists, whether the token existed, or why it failed. The same rule applies to OTP verification and to any "look up my booking" form, which never confirms whether an email address has bookings; it always reports that a message was sent if one exists.
13. No customer PII appears in the link URL path or query string (§22.3), and the manage-booking pages set a referrer policy that prevents token leakage to third parties and are excluded from indexing.
14. **A manage-booking link may NOT expose, under any circumstance:**
    1. Any other booking, past or future, for the same customer or any other customer.
    2. Any other customer's identity, contact details, or intake answers.
    3. Any stored payment instrument, card number or fragment, or the ability to charge a stored instrument.
    4. Staff personal data beyond the display name and role the tenant publishes for booking purposes — no staff email, phone, address, schedule outside the booking, or employment data.
    5. Tenant operational data: other bookings' load, utilization, revenue, customer lists, or configuration.
    6. Any Dashboard or Platform Admin surface, or any capability beyond its single declared intent.
15. The link surface is served by the same server-side authorization path as every other read: token validity establishes *which booking*, and the database still enforces tenant scope and row-level security. A valid token for one tenant can never read another tenant's row.
16. Every link issue, redemption, OTP request, OTP failure, and action taken through a link is written to the append-only audit trail with the booking, tenant, intent, outcome, and request identifier — and never the token itself.

Alternatives considered:

- **Require accounts to book.** Rejected: it contradicts §5.1 and §30 and adds the largest funnel drop-off in the product for no v1 benefit.
- **A long-lived permanent manage link.** Rejected: a forwarded email becomes a permanent credential with no revocation story.
- **A short numeric booking reference as the credential.** Rejected: guessable and enumerable, failing §22.6.
- **Token alone, no OTP, for cancel and refund.** Rejected: anyone with the forwarded email could cancel a booking or trigger a refund and a personal-data export.
- **A magic link that creates a full customer session.** Rejected: it converts a single-purpose grant into a general-purpose one, which is exactly what decision 6 forbids.

## Consequences

### Positive

- The booking funnel has no account wall, which is the main conversion argument for the product.
- A leaked or forwarded link cannot cancel a booking, obtain a refund, or export personal data on its own.
- Revocation on state change means a link found in an old email is inert rather than dangerous.
- Uniform failure responses make automated enumeration uninformative.

### Negative / cost

- Email deliverability becomes load-bearing for booking management: if the OTP does not arrive, the customer cannot self-serve and calls the tenant. This raises the priority of the sending-domain and suppression work.
- Extra friction on cancel and reschedule will produce some support contacts and some abandoned self-service.
- Token issue, hashing, revocation, OTP, rate limiting, and audit are real infrastructure that must ship with the first bookable release, not after.
- Uniform error responses make legitimate customer support harder — staff cannot tell a customer why their link failed and must reissue instead.
- Optional accounts mean two customer-identity paths (guest email and account) that both need privacy, export, and deletion handling.

## Revisit triggers

- A proposal to make customer accounts mandatory, or a tenant contract that requires it.
- Any manage-booking token is found in a log, analytics payload, error report, support ticket, or referrer header.
- Observed link-guessing, OTP-brute-force, or enumeration traffic above the agreed alert threshold, or any confirmed unauthorized access through a link.
- OTP delivery success rate falls below the agreed threshold, or support contacts about failed link access exceed the agreed rate.
- A new action is proposed for the link surface that is not one of the intent-scoped booking, request-alternative, or privacy-right actions in decision 6.
- Any requirement to show a customer more than one booking from a single link.
- A change to the payment model that would put a stored payment instrument within reach of the link surface (see ADR 0003).

## References

- [Architecture spec](../../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md) §5.1, §6.3, §6.4, §8.1, §22.1, §22.2, §22.3, §22.6, §23.1, §23.2, §30, §31
- [Architecture overview](../architecture.md)
- [Glossary](../glossary.md) — guest booking, manage-booking link, step-up authentication
- [Release scope](../release-scope.md)
- [Security and privacy](../security-and-privacy.md)
- [References](../references.md) — vendor and standards sources, all point-in-time
- [ADR index](./README.md)
- ADR [0003](./0003-merchant-of-record-and-payments.md) — merchant of record and payments
- GitHub issue #2
