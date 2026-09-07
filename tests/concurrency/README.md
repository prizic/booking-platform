# Concurrency tests

`run.mjs` is the executable contention matrix from engineering rules §8. It runs
`pnpm test:concurrency` against a reset local stack, driving one real `psql`
session per attempt and releasing them on a shared wall-clock barrier, so the
database decides every race. Nothing is mocked.

Covered today (issue #11 holds): one hundred simultaneous capacity-one attempts,
adjacent half-open slots, duplicate identical requests, expiry racing creation,
and contention over interchangeable resources. Cases 2, 6, 7, 9, and 10 arrive
with the booking, payment, webhook, and reschedule issues that introduce them.

The gate needs Docker, `psql`, and more than `HOLD_CONTENDERS` (default 100)
spare database connections; it fails with an explicit message rather than
quietly reducing contention. `SUPABASE_DB_URL` overrides the local connection.
Fixtures are synthetic, live under the seeded synthetic tenant, and are removed
before and after every run.
