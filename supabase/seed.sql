-- Local and CI seed entry point.
--
-- Keep this file synthetic-only. Issue #6 adds deterministic Tenant A/Tenant B
-- isolation fixtures alongside the first tenant-owned schema. Production and
-- customer-derived rows are forbidden here.

select set_config('booking_platform.seed_class', 'synthetic-only', false);
