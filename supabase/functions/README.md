# Platform-owned Edge Functions

The production email worker additionally requires runtime-only
`NOTIFICATION_DELIVERY_ENCRYPTION_KEY`. Migrations and key storage must precede
worker deployment. See [notification delivery](../../docs/notification-delivery.md)
for retry-envelope, OTP, erasure and key rotation contracts.

This directory is the central source surface for verified provider webhooks,
short provider calls, queue workers, and the Supabase Auth email hook.

Functions are deployed only by the private platform release pipeline. A
generated instance repository never receives this directory, function secrets,
or deployment authority. Every function added here must be restartable,
idempotent, tenant-explicit, and safe to retry; durable business state remains
in Postgres rather than in background execution.

Provider-specific functions land with their owning integration issues.

| Function              | Owner     | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `notification-worker` | issue #19 | Dispatches due outbox intents into messages, claims a bounded batch under a visibility timeout, renders a platform-owned template, calls the Resend adapter, and records every attempt durably. Reads `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, and `NOTIFICATION_SENDER` from its own environment. The brand (names in both languages, logo, colours, verified origins, support address) comes from `get_notification_brand_v2`; an unreadable brand is retried, never replaced with a platform name. Test sends (`is_test`) render the fixed preview sample with a test marker. |
| `resend-webhook`      | issue #19 | Verifies the provider callback over the unmodified raw body, then applies it idempotently. Reads `RESEND_WEBHOOK_SECRET`. A forged, stale, or malformed delivery is refused identically.                                                                                                                                                                                                                                                                                                                                                                                                               |
| `stripe-checkout`     | issue #22 | Creates the provider checkout session for an attempt the database has already priced, then records the reference so an inbound event can be matched to it. Reads the amount, currency, connected account and address from `get_checkout_intent_v1`, never from its caller. Reads `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `STRIPE_SECRET_KEY`.                                                                                                                                                                                                                                                 |
| `reminder-scheduler`  | issue #20 | Calls `schedule_booking_reminders_v1` in bounded batches on a short Cron interval; lead times are each tenant's `reminder_offsets_minutes`, read by that function. Idempotent on the outbox intent key, so running it twice schedules nothing twice, and it supersedes reminders whose booking moved.                                                                                                                                                                                                                                                                                                  |
| `auth-mail-hook`      | issue #20 | The Supabase Send Email Hook. Resolves tenant branding through `resolve_auth_mail_context_v1`, which reads membership and invitation records only; an ambiguous or unknown address gets a generic message. Never trusts user metadata, a redirect URL, or a claimed hostname.                                                                                                                                                                                                                                                                                                                          |
| `stripe-webhook`      | issue #22 | Verifies the signed callback over the unmodified raw body, normalizes the event, and hands it to `record_payment_event_v1`, which is idempotent on the provider's own event id. Reads `STRIPE_WEBHOOK_SECRET`. A forged, stale, replayed or malformed delivery is refused identically.                                                                                                                                                                                                                                                                                                                 |

## `_shared` is generated, not written

A Supabase Edge Function may only import files under `supabase/functions/`, and
Deno resolves specifiers literally — so neither `packages/email`'s `./x.js`
imports (correct for the Node build, files that do not exist) nor its bare
`@wlbp/api-contracts` specifier can be followed from here.

`pnpm bundle:edge` copies the modules these functions need into
`_shared/<package>/` and rewrites those specifiers. The logic still lives in
exactly one place; `_shared` is a generated view of it, and `pnpm check` fails
if the two drift. Do not edit anything under `_shared`.

The same applies to `packages/integrations`, for a second reason: its modules
resolve locally through a relative path that climbs out of `supabase/functions`,
but `supabase functions deploy` bundles with that directory as its root and
refuses to follow one.

## Scheduling

`supabase/cron/schedule.sql` holds every scheduled job, applied by the release
pipeline rather than by `supabase db reset`: pg_cron runs jobs in a separate
session against committed state, so scheduling them in a migration would put
background work underneath every local gate. Expiry jobs run as SQL inside the
database; the two that need a provider key go out through an Edge Function, and
the key is read from Vault by name so it never appears in a committed file.

Every decision these functions make lives in a package — `packages/email` for
Resend, `packages/integrations` for Stripe — where it is unit tested with an
injected transport, so none of them needs a network, a provider account, or a
secret to be verified. What remains in each function is transport and secret
handling.

A checkout function never reads an amount from its caller, and a webhook
function never treats a browser redirect as evidence. Both facts are enforced in
the database, not here: `begin_checkout_v1` prices the attempt and
`record_payment_event_v1` is the only path that can confirm a paid booking.

## Dashboard account and integration workers

| Function                  | Owner                             | Behavior                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `staff-invitation-worker` | issue #102 / dashboard completion | Claims a bounded private invitation-delivery batch, asks Auth for an email-bound invitation or magic link, sends a bilingual Resend message, and records dispatch success or retry failure. Requires the existing internal-invocation guard, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, and `NOTIFICATION_SENDER`. Raw links and recipients never enter job or audit DTOs. |
| `payment-onboarding`      | issue #102 / dashboard completion | Accepts a member-authorized intent ID, rechecks its private platform account/domain mapping through the service-only RPC, creates an idempotent Stripe hosted onboarding link, and records its outcome. Requires member Auth plus platform worker credentials and `STRIPE_SECRET_KEY`; return URLs are database owned. A return never implies account readiness.                               |

Invitation dispatch is scheduled by the central platform using the same internal invocation credential as notification dispatch. Recovery redirects in `auth-mail-hook` must match the exact trusted HTTPS origins configured in `DASHBOARD_AUTH_REDIRECT_ORIGINS`; arbitrary Auth return URLs are refused. Sandbox dispatch/delivery and onboarding evidence remain separate from deterministic adapter tests.

## WhatsApp channel (ADR-0018)

Optional and off by default; see [ADR-0018](../../docs/adr/0018-whatsapp-notification-channel.md) and the [operator guide](../../docs/whatsapp.md). The adapter (payload, error classification, signature verification, status parsing) lives in `packages/integrations/src/whatsapp` and is vendored to `_shared/whatsapp`.

| Function           | Owner    | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `whatsapp-worker`  | ADR-0018 | Claims a bounded WhatsApp outbox batch through `claim_whatsapp_batch_v1` under a visibility timeout, resolves the tenant's access token from its `env:WHATSAPP_TOKEN_<TENANT HEX>[_<SUFFIX>]` reference (a reference naming any other secret is refused; `vault:` references are not resolved), sends the tenant's approved template through the Cloud API, and records every attempt through `record_whatsapp_attempt_v1` with the same accepted / retryable / permanent semantics as `notification-worker`. Requires the internal-invocation guard, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and one `WHATSAPP_TOKEN_*` secret per configured tenant. Tokens, phone numbers and provider text never appear in its output. |
| `whatsapp-webhook` | ADR-0018 | Public (`verify_jwt = false`). Answers Meta's `hub.challenge` handshake when `hub.verify_token` matches `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, verifies `X-Hub-Signature-256` over the raw body with `WHATSAPP_APP_SECRET`, and records each `sent` / `delivered` / `read` / `failed` status through `record_whatsapp_provider_event_v1`, idempotent on `<wamid>:<status>`. A forged, oversized or malformed delivery is refused identically; inbound customer messages are ignored.                                                                                                                                                                                                                                                  |

## Branded email, preview and digest

Every template, its English and Arabic copy, the table-based RTL/LTR layout,
the button-contrast fallback, the digest grouping and the preview sample data
live in `packages/email` (vendored to `_shared/email`) and are unit tested
there.

| Function        | Owner             | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `email-preview` | PWA/notifications | Member-facing (Supabase JWT). Accepts exactly `{tenantId, templateKey, locale}`, authorizes the caller with their own JWT through `get_notification_settings_v1`, reads the tenant's brand through `get_notification_brand_v2`, and returns `{subject, html, text}` rendered from fixed, clearly synthetic sample data. Never sends, enqueues or stores anything. CORS is granted only to the tenant's verified Dashboard origin, plus any origin listed in `EMAIL_PREVIEW_DEV_ORIGINS`; a server-side call sends no Origin. Requires `SUPABASE_URL` and `SUPABASE_ANON_KEY`. |
| `staff-digest`  | PWA/notifications | Calls `enqueue_staff_daily_digests_v1` every 15 minutes. The database picks opted-in members whose `digest_local_time` has passed in their location's time zone and writes one outbox intent per member per local day; `notification-worker` renders and sends it. Requires the internal-invocation guard, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.                                                                                                                                                                                                                    |
