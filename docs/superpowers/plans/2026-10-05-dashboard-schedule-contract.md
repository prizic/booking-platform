# Dashboard schedule mutations — Task 10 refinement

The existing `save_schedule_config_v1` owns validation and schedule state. The
current caller replaces the user's revision with a freshly read one, defeating
conflict recovery. The RPC also replays a request before authorization and does
not compare its payload. There is no versioned remove operation.

Prepare a central additive migration that checks current scope authority before
replay, records a hash of operation/payload/revision/actor, serializes tenant
request IDs, and refuses changed replay input. Preserve historical requests
without inventing their missing payload hashes; they cannot be replayed through
the hardened path. Keep existing validation in its original private function.

Add `remove_schedule_record_v1` for its whitelisted existing schedule kinds.
Read the target's actual tenant/location/staff/resource, authorize that scope,
lock the record and parent scope, compare both applicable revisions, delete,
bump the parent revision, and append a redacted audit event in one transaction.
Deleting weekly hours must not orphan a break; a populated scope cannot be
deleted. No public raw-table write or allocation mutation is introduced.

The UI posts the revision it rendered and keeps the same request ID during a
retry. It converts local inputs through the shared civil-time resolver, refuses
DST gaps, and requires an earlier/later choice for overlaps. Named choices come
from an authorized workspace projection, never a typed operator UUID.

Queue positive, stale, cross-tenant/location, revoked, changed-replay, remove,
break-containment, gap and overlap tests for the final campaign.
