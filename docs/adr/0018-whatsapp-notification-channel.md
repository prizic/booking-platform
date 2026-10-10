# ADR-0018: WhatsApp notification channel

Purpose: records the owner decision to add Meta WhatsApp Cloud API as an optional second notification channel, and the rules that keep it subordinate to email.

Authoritative source: [the architecture spec](../../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md) §8.2 (SMS/WhatsApp in Phase 2), §19 (notifications and the outbox), §23 (security and privacy). This ADR moves the WhatsApp half of the Phase 2 item forward; it departs from §8.2's ordering on purpose, as recorded in [ADR-0010](./0010-deferred-scope.md).

- **Owner:** @SEIFSEIF4
- **Status:** Accepted
- **Date:** 2026-10-07

## Context

[ADR-0010](./0010-deferred-scope.md) deferred "SMS and WhatsApp notifications" to Phase 2 (#51) because per-market consent, sender registration and template approval are legal work, not an adapter. On 2026-10-07 the owner decided to bring WhatsApp forward: in the launch markets customers expect booking confirmations and reminders in WhatsApp, and email alone is read late or not at all.

The forces that made the original deferral correct still apply, so the decision is about *how little* to build and *how firmly* to bound it:

- Email is the primary channel and must keep working whatever happens to WhatsApp. A booking commits even when every provider is degraded (invariant 9).
- Meta only delivers business-initiated messages outside a 24-hour customer-service window as **pre-approved templates**. Free-form text is impossible for our use case and would be a policy violation.
- A WhatsApp access token is a provider secret. It must never reach Client, Dashboard, or the database in plaintext.
- The tenant, not the platform, is the WhatsApp Business account holder and sender. The platform owns one Meta app (webhook signing secret) and the delivery machinery.
- Consent to be messaged on WhatsApp is separate from booking consent and differs per market.

## Decision

We add WhatsApp as an **optional, off-by-default** notification channel through the **Meta WhatsApp Cloud API** (Graph API pinned at `v25.0`), with these rules:

1. **Three gates, all required.** A WhatsApp message is enqueued only when (a) the runtime entitlement `whatsapp_notifications` allows it — the control plane overrides local configuration (invariant 6); (b) the tenant has enabled and configured the channel (phone-number id, business-account id, token reference, an approved template per message type); and (c) the customer explicitly opted in **for that booking** with a separate, unticked checkbox and an E.164 phone number.
2. **Consent is snapshotted.** The consent text, its version, the locale and the time are written once on the booking (`app.booking_whatsapp_consents`, append-only) by the confirmation path and never rewritten by later tenant edits (invariant 5).
3. **Email is always sent.** WhatsApp is a separate outbox row (`channel = 'whatsapp'`) next to the email for the same event, never a replacement. Enqueueing never blocks or fails the booking transaction.
4. **Templates only.** The adapter (`packages/integrations/src/whatsapp`) can build only a `type: "template"` message: a template name, a language and positional body text parameters, fixed per message type by the platform. There is no code path that sends free-form text. Only customer-facing types flagged `whatsapp_capable` in `private.notification_type_catalog_v1()` can use the channel; staff, payment, management-OTP and Auth messages stay on email.
5. **No bearer links over WhatsApp.** Management and proposal links are credentials ([ADR-0004](./0004-guest-first-booking-and-management-links.md)); template parameters never include them. Templates point the customer to the email that carries the link.
6. **Secret references only.** The tenant's configuration stores `access_token_secret_ref = env:WHATSAPP_TOKEN_<TENANT ID HEX>[_<SUFFIX>]`, the name of a platform Edge Function secret set by a platform operator. The worker refuses any reference that does not carry the tenant's own id, so one tenant cannot point at another tenant's token or at a platform key. `vault:` references are accepted by the schema but **not resolved** by the worker until a tenant-bound Vault resolver exists (see Revisit triggers).
7. **Verified delivery status.** `whatsapp-webhook` answers Meta's verify-token handshake and verifies `X-Hub-Signature-256` (HMAC-SHA256 of the raw body with the platform app secret, constant-time compare). Status events (`sent`, `delivered`, `read`, `failed`) are recorded idempotently on `<message id>:<status>`. Inbound customer messages are ignored and never stored.
8. **Same retry semantics as email.** The worker claims under a visibility timeout and records `accepted`, `retryable_error` (HTTP 429/5xx, network, Meta throughput, pair-rate and transient codes) or `permanent_error` (invalid recipient, template missing/unapproved/paused/disabled, policy, 24-hour window, opt-out, configuration). The database owns backoff and dead-lettering.

**Legal:** Per-market consent, sender registration and template approval requires independent legal review. Nothing in this ADR, the product, or its help text claims compliance with any messaging, privacy or consumer law.

### Alternatives rejected

Implementation clarification for issue #130: append-only consent snapshots
remain immune to tenant edits. Verified erasure under ADR-0008 clears their
phone and rendered text, retaining only version, locale, timestamp and text hash
as minimal evidence. It cancels pending customer deliveries; the worker rechecks
the current claim, consent and non-erased identity before provider handoff.
See [notification delivery](../notification-delivery.md) for the external-provider
race and verification boundary.

- **Keep WhatsApp deferred until #51.** Rejected by owner decision on 2026-10-07; the deferral reasons are addressed by gates 1–3 and the legal statement instead.
- **A Business Solution Provider (BSP) such as Twilio or 360dialog.** Rejected for now: a second processor of customer phone numbers, a second bill, and no capability we need beyond Meta's own API. Revisit if a market requires a BSP.
- **Free-form session messages.** Rejected: outside the 24-hour window Meta refuses them (error 131047), and inside it they would let tenant-authored text reach customers without template review.
- **Storing the token in the database, encrypted.** Rejected: the brief and invariant forbid plaintext provider secrets in the database, and a decrypting RPC reachable from tenant-controlled input would make the reference a cross-tenant lever.
- **Including the manage link as a template URL button.** Rejected for now (decision 5); a future ADR may add a dynamic URL button with a WhatsApp-specific, single-purpose token.

## Consequences

### Positive

- Customers in the launch markets can receive confirmations and reminders in the channel they read, without weakening the email path.
- The template-only adapter makes "send arbitrary text to a customer" structurally impossible.
- The tenant-bound secret name closes the obvious cross-tenant token-reference attack without new database machinery.

### Negative / cost

- A platform operator must set one Edge Function secret per tenant (`supabase secrets set`) and redeploy nothing; onboarding is not self-service.
- The Cloud API has no idempotency key. A send that reached Meta but whose answer was lost (timeout, crash before recording) can be retried and delivered twice. The worker records an unrecognisable 2xx as permanent to avoid compounding this.
- Each tenant must get every template approved by Meta in both Arabic and English before the channel is useful; a paused or rejected template silently degrades to email only.
- The webhook records status per message; Meta's redeliveries cost one idempotent RPC each.
- WhatsApp phone numbers become a new personal-data field on bookings, inside the existing retention and erasure rules ([ADR-0008](./0008-privacy-retention-and-support-access.md)).

## Revisit triggers

- A tenant needs self-service token rotation, or the number of `WHATSAPP_TOKEN_*` secrets becomes an operational burden — design a tenant-bound Vault resolver (service-role RPC that only decrypts the secret named for that tenant) and then resolve `vault:` references.
- Meta deprecates Graph API `v25.0` (announced availability until 2028-07-29) or changes the template message shape.
- A duplicate WhatsApp delivery is reported by a customer or tenant.
- A market requires a BSP, local sender registration, or a consent record we do not capture.
- SMS is brought forward — it needs its own ADR; this one does not cover it.

## References

- [ADR-0010: Deferred scope](./0010-deferred-scope.md) — the WhatsApp row this decision amends
- [ADR-0004: Guest-first booking and management links](./0004-guest-first-booking-and-management-links.md)
- [ADR-0006: Policy snapshot rules](./0006-policy-snapshot-rules.md)
- [ADR-0008: Privacy, retention, and support access](./0008-privacy-retention-and-support-access.md)
- [WhatsApp operator guide](../whatsapp.md)
- [Security and privacy](../security-and-privacy.md)
- Meta, WhatsApp Cloud API error codes — https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes (retrieved 2026-10-07)
- Meta, Webhooks getting started (verification and `X-Hub-Signature-256`) — https://developers.facebook.com/docs/graph-api/webhooks/getting-started (retrieved 2026-10-07)
- Meta, status webhook reference — https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/reference/messages/status (retrieved 2026-10-07)
- Meta, Graph API changelog (version availability) — https://developers.facebook.com/docs/graph-api/changelog (retrieved 2026-10-07)
