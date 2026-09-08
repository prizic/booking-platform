# Platform-owned Edge Functions

This directory is the central source surface for verified provider webhooks,
short provider calls, queue workers, and the Supabase Auth email hook.

Functions are deployed only by the private platform release pipeline. A
generated instance repository never receives this directory, function secrets,
or deployment authority. Every function added here must be restartable,
idempotent, tenant-explicit, and safe to retry; durable business state remains
in Postgres rather than in background execution.

Provider-specific functions land with their owning integration issues.

| Function              | Owner     | What it does                                                                                                                                                                                                                                                                                                                                        |
| --------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `notification-worker` | issue #19 | Dispatches due outbox intents into messages, claims a bounded batch under a visibility timeout, renders a platform-owned template, calls the Resend adapter, and records every attempt durably. Reads `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `NOTIFICATION_SENDER`, and `NOTIFICATION_BRAND_NAME` from its own environment. |
| `resend-webhook`      | issue #19 | Verifies the provider callback over the unmodified raw body, then applies it idempotently. Reads `RESEND_WEBHOOK_SECRET`. A forged, stale, or malformed delivery is refused identically.                                                                                                                                                            |

Every decision either function makes lives in `packages/email`, where it is unit
tested with an injected transport, so neither function needs a network to be
verified.
