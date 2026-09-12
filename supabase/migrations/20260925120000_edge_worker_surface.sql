-- Issue #101: the Data API surface the platform's own Edge workers call.
--
-- This migration exists because of a bug, so the bug is worth stating plainly:
-- every `api_v1` function granted to `service_role` was unreachable. The
-- wrappers are SECURITY INVOKER by contract — an exposed definer function is
-- refused by `tenant_schema_contract_test.sql` — which means the *caller* needs
-- EXECUTE on the `private` function underneath, and `service_role` had no USAGE
-- on `private` at all. Calling `api_v1.record_payment_event_v1` as the platform
-- returned `permission denied for schema private`.
--
-- That was true for the Stripe webhook, the Stripe checkout call, the reminder
-- scheduler and the Auth mail hook: the entire Edge surface. Nothing caught it
-- because every test drives those paths as `postgres`, which owns everything.
--
-- The fix is one grant in the shared place rather than a workaround in each
-- wrapper, plus a contract test that makes the invariant general: if an `api_v1`
-- function is callable by `service_role`, every `private` function it calls must
-- be too.
--
-- `service_role` is not an application role. It is the platform's own key, it
-- already bypasses row level security, and it never reaches a browser.
--
-- `private` was never hidden by its schema grant: `anon` and `authenticated`
-- already have USAGE on it, and what bounds them is the per-function EXECUTE
-- grant every migration writes by hand. This adds `service_role` to the same
-- arrangement and widens nothing for anybody else.

grant usage on schema private to service_role;

-- Narrow and explicit rather than blanket: these are the functions the exposed
-- service-role wrappers actually call.
grant execute on function
  private.attach_checkout_reference_v1(uuid,uuid,text),
  private.claim_refund_batch_v1(integer,integer),
  private.get_checkout_intent_v1(uuid,uuid),
  private.get_commerce_health_v1(),
  private.reconcile_commerce_v1(uuid,integer),
  private.record_commerce_event_v1(uuid,text,text,text,text,text,text,bigint,text,timestamptz,text),
  private.record_payment_event_v1(uuid,text,text,text,text,text,bigint,text,text,timestamptz),
  private.record_refund_result_v1(uuid,uuid,text,text,text),
  private.resolve_auth_mail_context_v1(text),
  private.schedule_booking_reminders_v1(uuid,integer)
to service_role;

-- ---------------------------------------------------------------------------
-- The notification worker's own surface
-- ---------------------------------------------------------------------------

-- Four calls, in the order the worker makes them. Each is a thin invoker
-- wrapper over the engine that was already written and tested in issue #19;
-- none of them adds a decision, because a decision in a wrapper is a decision
-- that is not in the tested path.

create or replace function api_v1.dispatch_notifications_v1(
  p_tenant_id uuid default null, p_limit integer default 200)
returns table (dispatched integer, suppressed integer)
language sql volatile security invoker set search_path = '' set statement_timeout = '20s'
as $$ select * from private.dispatch_notifications_v1(p_tenant_id,p_limit); $$;

create or replace function api_v1.claim_notification_batch_v1(
  p_limit integer default 20, p_visibility_seconds integer default 120)
returns table (
  message_id uuid, tenant_id uuid, booking_id uuid, template_key text,
  template_locale text, template_version integer, booking_revision bigint,
  attempt integer, correlation_id uuid, payload jsonb, recipient_email text)
language sql volatile security invoker set search_path = '' set statement_timeout = '20s'
as $$ select * from private.claim_notification_batch_v1(p_limit,p_visibility_seconds); $$;

create or replace function api_v1.record_notification_attempt_v1(
  p_message_id uuid, p_attempt integer, p_outcome text, p_started_at timestamptz,
  p_provider_reference text default null, p_error_code text default null)
returns table (status text, next_attempt_at timestamptz, dead_lettered boolean)
language sql volatile security invoker set search_path = '' set statement_timeout = '20s'
as $$ select * from private.record_notification_attempt_v1(
  p_message_id,p_attempt,p_outcome,p_started_at,p_provider_reference,p_error_code); $$;

create or replace function api_v1.record_notification_event_v1(
  p_provider text, p_provider_event_reference text, p_event_type text,
  p_occurred_at timestamptz, p_provider_message_reference text default null)
returns table (applied boolean, message_id uuid)
language sql volatile security invoker set search_path = '' set statement_timeout = '20s'
as $$ select * from private.record_notification_event_v1(
  p_provider,p_provider_event_reference,p_event_type,p_occurred_at,
  p_provider_message_reference); $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant execute on function
  private.dispatch_notifications_v1(uuid,integer),
  private.claim_notification_batch_v1(integer,integer),
  private.record_notification_attempt_v1(uuid,integer,text,timestamptz,text,text),
  private.record_notification_event_v1(text,text,text,timestamptz,text)
to service_role;

-- A queue worker's surface is not a customer's. Claiming a batch, recording an
-- attempt and applying a provider event are platform operations, and a signed-in
-- member has no business with any of them.
revoke all on function
  api_v1.dispatch_notifications_v1(uuid,integer),
  api_v1.claim_notification_batch_v1(integer,integer),
  api_v1.record_notification_attempt_v1(uuid,integer,text,timestamptz,text,text),
  api_v1.record_notification_event_v1(text,text,text,timestamptz,text)
from public, anon, authenticated;

grant execute on function
  api_v1.dispatch_notifications_v1(uuid,integer),
  api_v1.claim_notification_batch_v1(integer,integer),
  api_v1.record_notification_attempt_v1(uuid,integer,text,timestamptz,text,text),
  api_v1.record_notification_event_v1(text,text,text,timestamptz,text)
to service_role;

-- ---------------------------------------------------------------------------
-- The one thing the worker needs that no existing function gives it
-- ---------------------------------------------------------------------------

-- Which name signs the email. `get_brand_presentation_v1` is member-facing and
-- refuses a worker, and a platform constant in `NOTIFICATION_BRAND_NAME` would
-- put our name on every tenant's mail — which is the one thing a white-label
-- product must never do. So: the published brand's own name when it has one,
-- and the tenant's business name when it does not.
create or replace function private.get_notification_brand_v1(p_tenant_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select nullif(pg_catalog.btrim(revision.content ->> 'brandName'),'')
     from app.instances as instance
     join app.brand_revisions as revision
       on revision.tenant_id = instance.tenant_id
      and revision.id = instance.published_brand_revision_id
     where instance.tenant_id = p_tenant_id
     order by revision.published_at desc nulls last
     limit 1),
    (select tenant.name from app.tenants as tenant where tenant.id = p_tenant_id));
$$;

create or replace function api_v1.get_notification_brand_v1(p_tenant_id uuid)
returns text
language sql stable security invoker set search_path = '' set statement_timeout = '5s'
as $$ select private.get_notification_brand_v1(p_tenant_id); $$;

revoke all on function
  private.get_notification_brand_v1(uuid),
  api_v1.get_notification_brand_v1(uuid)
from public, anon, authenticated;
grant execute on function
  private.get_notification_brand_v1(uuid),
  api_v1.get_notification_brand_v1(uuid)
to service_role;

-- ---------------------------------------------------------------------------
-- One more thing the platform could not reach
-- ---------------------------------------------------------------------------

-- Found while wiring the functions above: `stripe-webhook` resolved the owning
-- tenant by querying `app.provider_object_mappings` through PostgREST with an
-- `accept-profile: app` header. Only `api_v1` is an exposed schema, so that
-- request could never have succeeded — the one lookup standing between a
-- verified payment and the booking it pays for.
--
-- The lookup is one row by the provider's own reference, and it is deliberately
-- not a general table read: a webhook needs to know which tenant owns an object
-- it already holds a reference to, and nothing else.
create or replace function private.resolve_provider_object_tenant_v1(
  p_object_kind text,
  p_provider_object_reference text
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select mapping.tenant_id
  from app.provider_object_mappings as mapping
  where mapping.object_kind = p_object_kind
    and mapping.provider_object_reference = p_provider_object_reference
  limit 1;
$$;

create or replace function api_v1.resolve_provider_object_tenant_v1(
  p_object_kind text, p_provider_object_reference text)
returns uuid
language sql stable security invoker set search_path = '' set statement_timeout = '5s'
as $$ select private.resolve_provider_object_tenant_v1(
  p_object_kind,p_provider_object_reference); $$;

revoke all on function
  private.resolve_provider_object_tenant_v1(text,text),
  api_v1.resolve_provider_object_tenant_v1(text,text)
from public, anon, authenticated;
grant execute on function
  private.resolve_provider_object_tenant_v1(text,text),
  api_v1.resolve_provider_object_tenant_v1(text,text)
to service_role;
