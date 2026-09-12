# Platform-owned Edge Functions

This directory is the central source surface for verified provider webhooks,
short provider calls, queue workers, and the Supabase Auth email hook.

Functions are deployed only by the private platform release pipeline. A
generated instance repository never receives this directory, function secrets,
or deployment authority. Every function added here must be restartable,
idempotent, tenant-explicit, and safe to retry; durable business state remains
in Postgres rather than in background execution.

Provider-specific functions land with their owning integration issues.

| Function              | Owner     | What it does                                                                                                                                                                                                                                                                                                                                           |
| --------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `notification-worker` | issue #19 | Dispatches due outbox intents into messages, claims a bounded batch under a visibility timeout, renders a platform-owned template, calls the Resend adapter, and records every attempt durably. Reads `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `NOTIFICATION_SENDER`, and `NOTIFICATION_BRAND_NAME` from its own environment.    |
| `resend-webhook`      | issue #19 | Verifies the provider callback over the unmodified raw body, then applies it idempotently. Reads `RESEND_WEBHOOK_SECRET`. A forged, stale, or malformed delivery is refused identically.                                                                                                                                                               |
| `stripe-checkout`     | issue #22 | Creates the provider checkout session for an attempt the database has already priced, then records the reference so an inbound event can be matched to it. Reads the amount, currency, connected account and address from `get_checkout_intent_v1`, never from its caller. Reads `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `STRIPE_SECRET_KEY`. |
| `reminder-scheduler`  | issue #20 | Calls `schedule_booking_reminders_v1` in bounded batches on a short Cron interval. Idempotent on the outbox intent key, so running it twice schedules nothing twice, and it supersedes reminders whose booking moved.                                                                                                                                  |
| `auth-mail-hook`      | issue #20 | The Supabase Send Email Hook. Resolves tenant branding through `resolve_auth_mail_context_v1`, which reads membership and invitation records only; an ambiguous or unknown address gets a generic message. Never trusts user metadata, a redirect URL, or a claimed hostname.                                                                          |
| `stripe-webhook`      | issue #22 | Verifies the signed callback over the unmodified raw body, normalizes the event, and hands it to `record_payment_event_v1`, which is idempotent on the provider's own event id. Reads `STRIPE_WEBHOOK_SECRET`. A forged, stale, replayed or malformed delivery is refused identically.                                                                 |

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
