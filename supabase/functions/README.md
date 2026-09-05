# Platform-owned Edge Functions

This directory is the central source surface for verified provider webhooks,
short provider calls, queue workers, and the Supabase Auth email hook.

Functions are deployed only by the private platform release pipeline. A
generated instance repository never receives this directory, function secrets,
or deployment authority. Every function added here must be restartable,
idempotent, tenant-explicit, and safe to retry; durable business state remains
in Postgres rather than in background execution.

No function is implemented by issue #4. Provider-specific functions land with
their owning integration issues.
