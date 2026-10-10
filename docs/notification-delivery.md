# Notification authorization, privacy and retries

Remediation issues #127–#131 extend existing modules; no package or distribution
allowlist change is needed. These are central platform migrations and workers,
never tenant-instance code.

## Read authority

Booking RLS requires an active membership with a direct `booking.view.any` or
`booking.view.own` grant. The grant scope intersects effective membership
location access; an `own` grant also requires assignment to the booking's hold.
Scoped, audited support access remains a separate fallback for non-members.
Booking child reads and Today/Calendar invoker RPCs inherit booking RLS.

Staff digests use the same scope intersection, including membership location
restrictions on a tenant-scoped Scheduler. Customer first-name visibility still
requires its separate PII capability. Permissions are checked at claim and
delivery preparation, not trusted from a browser or an earlier role snapshot.

## Production OTP and stable email delivery

The production worker calls `mint_notification_otp_v1` for a live claimed
`management.otp_requested` message. The database stores only the OTP hash in
the challenge; the worker renders the six-digit code in either locale. Test
sends use synthetic samples and never mint a real challenge.

Before sending, the worker persists the exact provider input (recipient,
sender/reply-to, subject, HTML, text, tags and stable message key) encrypted with
AES-256-GCM. The ciphertext is bound to tenant and message ID through
authenticated additional data. `private.notification_delivery_envelopes` has
RLS and no direct app or worker privileges. Only narrow service-role RPCs can
load or save an envelope under the current, unexpired claim/attempt. The first
successful write wins; a lost provider or database acknowledgement replays that
input rather than minting a new management URL or OTP.

Preparation refuses a changed recipient or erased customer. Staff delivery
also rechecks the freshly authorized payload; permission/content changes fail
closed rather than replacing content under the same provider key. OTP envelopes
require a live, unused challenge and action token. Envelopes expire after 24
hours; an expired active envelope is refused, not replaced. The central Cron
schedule prunes expired envelopes only after messages have settled. Erasure
purges all customer envelopes immediately, subject to the existing legal-hold
workflow. Plaintext bearer material must never be logged or put in an outbox,
audit DTO, application table or distributed bundle.

## Deployment and key operations

1. Apply the three October 10 forward migrations through the central pipeline,
   replay them on an isolated synthetic database, and regenerate/verify the
   published `api_v1` database types.
2. Set `NOTIFICATION_DELIVERY_ENCRYPTION_KEY` in platform-only Edge Function
   secret storage: a cryptographically generated 32-byte key encoded as 64 hex
   characters. Never put its value in a repository, instance, log or ticket.
3. Deploy the regenerated shared email bundle and both notification workers;
   apply `supabase/cron/schedule.sql`, including envelope pruning.
4. Verify sandbox OTP delivery in EN/AR and retry after a lost acknowledgement.

Missing/invalid key material makes the email worker fail configuration checks
before dispatch or claim. Keep the same key on all workers while any envelope
may be retried. This implementation has no multi-key keyring: do not rotate the
key in place during active retries. Drain/settle old messages, wait for expiry
and pruning, then replace the key and verify sandbox delivery. Loss of the key
is an operational incident, not permission to regenerate content under an
existing idempotency key. Restored ciphertext must remain protected alongside
other personal backup data; database expiry is not surgical backup deletion.

## Customer erasure and provider boundary

Erasure removes WhatsApp phone/consent payloads while preserving consent
version, locale, timestamp and text hash as minimal evidence; it clears outstanding
customer
notification payloads, cancels queued and sending email/WhatsApp messages, and
purges their encrypted envelopes. Multi-booking staff digest envelopes have no
customer-specific index, so erasure also purges all such envelopes in that tenant
and cancels active digest messages. Their message identities are permanently
invalidated, including after manual replay; a later day gets a new message/key. It does
not rewrite commercial booking
snapshots or financial records. WhatsApp rechecks the current claim, consent and
non-erased customer immediately before provider handoff. A lookup failure is
retryable; a revoked recipient is never sent.

No transaction can retract a request already handed to an external provider.
There remains a narrow race between the final authorization check and network
handoff. Existing provider suppression/deletion and legal-hold steps still apply;
local cancellation is not evidence that a provider erased its logs. The forward
migration also redacts leftover channel payload and cancels outstanding messages
for already-erased customers, excluding records covered by a later legal hold.
Privacy and retention obligations require independent legal review.

## Verification

Email unit tests cover EN/AR OTP rendering, lost acknowledgement and reclaim,
sender/brand/link drift, cross-tenant/message ciphertext rejection, synthetic
test sends and fail-closed storage. Database tests cover scope denial, production
OTP dispatch/claim/mint, first-write-wins ciphertext, stale attempts, worker-only
ACLs/RLS, erasure and post-erasure WhatsApp preflight. These tests are source
coverage, not passing database evidence until run on a freshly replayed stack.

Related: [security and privacy](security-and-privacy.md),
[roles](roles.md), [local setup](local-setup.md),
[guest management ADR](adr/0004-guest-first-booking-and-management-links.md).

Executed checks and remaining blockers are in the
[October 10 verification report](security-remediation-verification-2026-10-10.md).
