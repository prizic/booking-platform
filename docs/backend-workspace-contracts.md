# Backend workspace contracts

Purpose: describe the additive backend contracts for issue #134 and their
application integration boundaries. Related: [architecture](./architecture.md),
[security and privacy](./security-and-privacy.md),
[guest management ADR](./adr/0004-guest-first-booking-and-management-links.md).

## Published site content

Keep `title: {en, ar}`, `contact.email`, and `legal.privacyUrl/termsUrl` on the
existing `app.brand_revisions.content`. Optional additions:

```ts
contact?: { email?: string; phone?: string; whatsapp?: string };
about?: {
  experience?: { en: string; ar: string };
  whyChooseUs?: { en: string; ar: string };
  address?: { en: string; ar: string };
  mapUrl?: string;
};
appStores?: { appStoreUrl?: string; googlePlayUrl?: string };
```

Phone and WhatsApp are E.164 numbers, not URLs. About text is plain text in both
languages: maximum 4,000 characters per language, or 1,000 for address. URLs
are HTTPS, at most 2,048 characters, without authority credentials or executable
content. Absence hides the corresponding channel or store control. No install
URL is inferred or hardcoded. The existing PWA install flow is independent.

Use `parsePublishedBrandContentV1` at the server boundary. It projects recognized
fields and rejects malformed recognized fields. SQL validates additive fields
on revision writes and publication; existing safe legacy fields can remain in
storage but are not spread into the public projection. Public
`get_published_brand_v1(p_hostname text,p_application text)` keeps its existing
row shape and now selects the routed brand, returning only published allowed
content. Authoring stays on `save_brand_editor_v1` and
`publish_brand_revision_v1`. Application publication invalidation must include
tenant + locale + revision/config tags; authorization reads remain request-scoped.

## Email-only recovery

```sql
api_v1.request_booking_recovery_v1(
  p_hostname text, p_application text, p_email text, p_request_id uuid
) returns jsonb
```

The only response is `{contractVersion: 1, outcome: "accepted"}`. Call with
`p_application='client'`, the resolved request hostname, normalized email and a
stable UUID per submission. Retrying the same UUID never adds a delivery;
reusing it with another payload does not expose a match or create more work.
Use `parseBookingRecoveryV1Response`, constant application status/body, and the
bilingual equivalent of “If a booking exists, we've sent a link.” Do not display
delivery state or vary acknowledgment by database/provider result.

Admission is bounded before any matching: maximum 3 normalized-email requests
per 15 minutes, 20 network-actor requests per 10 minutes, and 100 tenant requests
per hour, serialized by the tenant/action transaction lock. These are **stored
request and uniform audit** limits, not just delivery limits. Excess requests
allocate no row, audit, limiter key or replay receipt, returning the same
accepted JSON. Only admitted UUIDs have seven-day replay receipts. A previously
dropped UUID can be admitted on an explicit later submission after capacity
returns; acknowledgment never promised delivery. Raw email is checked at 1,280
bytes before normalization/hashing, normalized email at 320 characters; route
selectors are bounded at 320 bytes. Oversized/malformed inputs are accepted
without persistence. Trusted `request.headers` metadata is parsed only up to
4,096 bytes, with network actor labels bounded at 64 bytes; oversized/missing
metadata shares the restrictive unknown bucket. Parent/server ingress still
owns request body size, connection limits and trustworthy IP extraction.

No new Edge invocation or email template is required. Existing
`claim_notification_batch_v1` drains the private digest queue in bounded batches
and sends one existing requested/confirmed message per eligible booking. A
request with more than 50 eligible bookings continues from its cursor in later
claims, rather than silently dropping later bookings. Messages and tokens are
deduplicated per request/booking; raw credentials are minted only at delivery.
The existing action-link and OTP RPCs remain authoritative. Canonical customer
correction/restriction/erasure revokes old links and changes the delivery address
without changing historical booking contacts.

## Booking detail context

```sql
api_v1.get_booking_context_v1(p_tenant_id uuid,p_booking_id uuid) returns jsonb
```

Use alongside existing `get_booking_detail_v1`. `parseBookingContextV1` describes
the DTO: `contractVersion`, `bookingId`, `contactAccess`, discriminated `intake`
and `customer` access, and `request` facts. Allowed intake includes immutable
`schema` and `answers`; denied intake returns only `{access:'restricted'}`.
Allowed customer includes `customerId`, state (`active`, `restricted`, `erased`)
and at most 20 other bookings ordered newest first. History follows both contact
and booking RLS; no hidden location booking or other tenant is returned. A
missing/denied booking returns SQL NULL. No public guest access is granted.

## Private operator contracts

All new operator RPCs below return JSON and have matching `control_plane`
implementations. `api_v1` wrappers require the end-user authenticated operator
session; live operator authority is read in SQL. Reads require viewer + AAL2;
writes require admin + fresh AAL2 within 900 seconds, except existing operator
workflows whose own minimum role remains unchanged. Private DTOs and validation
schemas belong in Platform Admin, never shared `api-contracts`.

```sql
get_instance_configuration_v1(p_instance_id uuid)
update_instance_configuration_v1(p_instance_id uuid,p_display_name text,
  p_expected_revision bigint,p_reason text,p_idempotency_key text)
deactivate_instance_by_id_v1(p_instance_id uuid,p_reason text,
  p_expected_state text,p_idempotency_key text)
request_instance_closure_v1(p_instance_id uuid,p_reason text,
  p_confirmation text,p_idempotency_key text)
request_domain_retirement_v1(p_domain_id uuid,p_replacement_domain_id uuid,
  p_reason text,p_idempotency_key text)
list_operator_reviews_v1(p_status text default 'pending',p_kind text default null,
  p_limit integer default 25,p_offset integer default 0)
get_operator_review_v1(p_kind text,p_id uuid)
decide_operator_review_v1(p_kind text,p_id uuid,p_decision text,
  p_reason text,p_idempotency_key text)
```

Configuration returns `{instance_id, tenant_id, display_name, revision,
deployment_state}`; an absent configuration has revision **0**. Only display
name is writable, optionally NULL, maximum 160 characters. Mutation reason is
10–500 characters. Deactivation returns `{instance_id, deployment_state:
'suspended', run_id}`. Closure confirmation is the instance UUID string, and
both tenant and instance must first be suspended. Closure/retirement requests
return `{job_id, status:'awaiting_approval'}`; no route or infrastructure is
deleted at request time.

Review `kind` is `job` or `support`; list status is `pending`, `approved`,
`rejected`, or NULL for history. List result is `{items, total_count}`. Each
item has `kind`, `id`, `tenant_id`, `instance_id`, `status`, `requested_by`,
`requested_at`, `reason`, `action`, `tenant_name`. Detail adds `detail`,
`history` and `can_decide`. Job detail reuses `get_job_v1` (including job
events); support detail includes scope, location, ticket, approval and expiry.
History records decision ID/action/operator/reason/outcome/time. A decision
(`approve`/`reject`) returns `{kind,id,status}` and requires a different fresh
administrator for both approval and rejection. Support approval preserves the
existing read-only 60-minute grant. Rejection marks the original grant revoked
or job cancelled; evidence remains in the ledger.

Domain replacement must be verified production routing for the same tenant,
instance and application. Active routes on active instances require an explicit
replacement. Retirement approval performs the SQL cutover and records the job
succeeded, retaining both domain rows. Generic `approve_operator_job_v1` and
worker completion refuse `retire_domain`; use the Review decision RPC. Closure
continues through existing service-role-only `claim_job_v1`/
`complete_job_v1`, and cannot complete before infrastructure's desired and
observed `active` values are false. No unsupported remote executor is invented;
an unimplemented external worker remains pending until it reports evidence.

### Domain read lineage (private additive fields)

Existing `api_v1.get_tenant_v1(p_tenant_id uuid) returns jsonb` keeps its shape;
each `domains[]` item now adds nullable `retired_at` (timestamp),
`replacement_domain_id` (UUID), and `pending_retirement_job_id` (UUID). Its job
summaries recognize `retire_domain` as requiring approval. Tenant detail only
joins its requested tenant's domains/jobs.

Existing `api_v1.list_domains_v1(p_search text default null,p_status text default
null,p_limit integer default 25,p_offset integer default 0)` keeps every old
argument, result field and verification-status filter, appending the same three
nullable fields. `pending_job_id` continues to mean pending **verification**;
it is independent of pending retirement. The migration explicitly recreates
both table-returning functions without CASCADE and restores authenticated-only
wrapper execution plus live viewer/AAL2 authorization. Generated SQL function
types gain the three fields; the JSON tenant DTO remains private app validation,
not a distributed admin contract.

Retired verified rows stay inspectable. The admin candidate filter must require
`retired_at == null`, the same tenant/instance/application, `kind=production`,
verified status/evidence, and a different domain ID. Never filter out history
from the read contract or treat verification as proof that a retired domain can
route again. Pending retirement is an original-domain workflow identifier;
review approval revalidates both rows. Approval retires the outgoing route
**before** replacement activation under the existing immediate unique index;
transaction rollback restores the old route if the second write fails.

Reuse existing APIs for tenant creation/rename/suspension/reactivation/closure,
provisioning request/retry/activation/deactivation, domain add/verification,
job retry/cancel/approval, and plan save (`active=false` deactivates). Existing
subscribers and unchanged entitlements survive plan inactivity. Fresh step-up
is now also enforced on existing tenant create/rename, provisioning
request/retry/activation, domain add/verification, and job retry/cancel writes.
Old provisioning deactivation is state/reason-idempotent and refuses closed
instances. Pending closure prevents tenant reactivation. No arbitrary job
creation or entity CRUD is exposed.

Error vocabulary: `policy_denied` / `recent_authentication_required` (42501),
`second_operator_required` (42501), `tenant_context_mismatch` (42501),
`not_found` (P0002), `reason_required` / `settings_invalid` /
`transition_not_allowed` / `replacement_domain_invalid` /
`active_route_requires_replacement` / `suspend_before_closure` /
`confirmation_mismatch` / `review_required` (22023), `stale_revision` (40001),
`idempotency_conflict` (23505), `unfinished_job_conflict` /
`infrastructure_not_deactivated` (55000), `secret_rejected` (22023).

## Verification status

Database and contract tests are authored for the new boundaries. They have not
been executed by the implementation stream: the parent runs the combined ordered
verification after every implementation agent finishes. The additive committed
database type entries are prepared from SQL signatures; regenerate them from the
parent's isolated migrated local stack before the type-consistency gate. No
retained local stack was reset and no remote database operation was performed.
