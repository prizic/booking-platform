# ADR-0016: Civil-time schedules and bounded policy overrides

- Status: Accepted
- Date: 2026-09-06
- Deciders: SEIFSEIF4

## Context

Working hours are recurring civil-time rules, not UTC instants. A location can
change its IANA timezone, staff and resources can be scoped more narrowly, and
date-specific closures, holidays, time off, blackouts, and maintenance must be
auditable independently. A browser must not be able to widen a tenant's
booking constraints or inspect private reasons.

## Decision

The platform stores schedule scopes and normalized schedule records in the
central `app` schema. `schedule_scopes` identifies a location, staff member, or
resource and carries the IANA timezone and a monotonic revision. Weekly rules,
breaks, exceptions, time off, holidays, blackouts, and resource maintenance are
separate tables. Each row carries `tenant_id`, and all tenant-owned tables have
RLS and authenticated-only grants.

Weekly and exception intervals use half-open local civil minutes `[start,end)`;
overlaps and breaks outside working hours are rejected. A closed exception has
no interval. A date-specific override may record an explicit DST fold (`0` or
`1`). Local times in a DST gap are rejected by the timezone resolver; ambiguous
times require an explicit fold. Once a booking is committed, its allocation UTC
instants and original timezone are immutable snapshots and are not rewritten by
schedule edits.

Policy values follow ADR-0005's most-specific-wins order (tenant, location,
service, staff, resource), while schedule constraints intersect and never widen
an inherited constraint. The supported keys are `minimum_notice_minutes`
(0–43,200; default 120), `horizon_days` (1–365; default 60),
`slot_interval_minutes` (5/10/15/20/30/60; default 15),
`daily_limit_per_staff` (1–50 or null), `buffer_before_minutes` and
`buffer_after_minutes` (0–120), plus `turnover_minutes` and `travel_minutes`
(0–1,440; both default 0). Invalid values are rejected with actionable error
codes; they are never silently clamped.

Dashboard authoring uses the versioned invoker API
`api_v1.save_schedule_config_v1` and compare-and-swap revisions. The API may
return scoped workspace rows to an authorized Dashboard operator, but Client
and anonymous callers receive no schedule tables, time-off rows, reasons, or
provider/internal details. Public derived availability is a later contract
(issue #10).

## Consequences

- Schedule correctness remains testable without a framework and can be reused
  by Dashboard and future availability computation.
- A schedule edit can conflict instead of overwriting another operator's edit.
- UTC conversion and DST behavior are deterministic, but availability must
  retain both the local rule and the resolved instant for explanations/audit.
- New policy keys or changes to these bounds require an ADR and corresponding
  contract, domain, and database tests.

## Verification

Domain tests cover overlap rejection, break subtraction, and policy precedence.
Database tests cover RLS in both directions, scoped authoring, invalid values,
revision conflicts, and the absence of anonymous raw schedule access.
