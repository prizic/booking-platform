# Read-only audit projection

The invoker API delegates to a hardened private helper with live direct audit.read checks. Tenant readers receive a union of booking events, settings events, published brand history, staff/resource events, membership access events, catalog events, schedule events and integration events. Location readers receive only events with authoritative permitted location ownership; streams without safely persisted location identity are omitted.

Only time, actor/effective actor IDs and a permitted staff display name, action, target ID/reference, outcome and correlation are projected. No notes, intake, contacts, authorization material, provider response, request hash, or source JSON is returned. Published brand history is identified as history rather than an invented immutable draft-edit ledger. Cursor order is immutable event time + stream + UUID, with a bounded page and explicit next cursor.

Cases: admin positive, revoked/no-capability/anonymous/cross-tenant negative; assigned location cannot read tenant-wide streams; source fields remain absent; equal timestamps paginate without duplication; event update remains refused.
