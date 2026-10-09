-- Notification claim settlement: a lapsed WhatsApp claim is settled, not stranded.
--
-- Additive and compatible. Same signature, same returns table, same grants and
-- search_path, so `api_v1` compatibility and the generated database types are
-- untouched. One defect, demonstrated by reading the owning migration
-- (`20261007101000_notification_engine_channels.sql`, section 3).
--
--   `claim_whatsapp_batch_v1` ran a dead-letter sweep over `status = 'queued'`
--   only, then claimed `status in ('queued','sending')` with a lapsed visibility
--   timeout. A `sending` row therefore had two reachable fates, and both were
--   wrong:
--
--     * The tenant lost the channel (plan changed, channel switched off, or the
--       consent snapshot is absent) while a worker held the row. The claim's own
--       filter requires the channel to be available, so the row was never
--       claimed; the sweep ignored it because it was not `queued`. It stayed
--       `sending` for good. `recover_stuck_notifications_v1` would have released
--       it, but nothing schedules it (`supabase/cron/schedule.sql`), so there was
--       no path to an outcome at all.
--
--     * The tenant still had the channel but the booking carries no consent
--       snapshot. Then the row passed the claim filter, was set to `sending`
--       with `attempts + 1`, and was then dropped by the inner join to
--       `booking_whatsapp_consents`. It was handed to no worker and recorded no
--       attempt, so the next poll did the same thing again — until `attempts`
--       reached the `attempts between 0 and 10` check on the table, at which
--       point the whole claim statement raised and the WhatsApp worker could not
--       claim anything for any tenant.
--
--   The sweep now covers a lapsed `sending` row with exactly the three
--   conditions it already used, and it settles it with the same stable
--   `whatsapp_unavailable` code as a queued row. A row whose lock has NOT lapsed
--   is untouched: a live worker still owns it.
--
-- Not changed, and deliberately so:
--
--   * `save_role_v1` replaces a role's whole grant set atomically and validates
--     the replacement against the new mode before touching anything, so the old
--     grant set is not state worth re-checking; `guard_role_permission_v1`
--     re-checks every inserted grant against the role's new mode. Reordering the
--     role row before the grants would make `roles_shape_guard` see the old
--     grants and refuse a legitimate one-call `tenant` -> `assigned` switch.
--     A refusal between the old delete and the old insert cannot strand anything:
--     both statements share one transaction, so the delete rolls back with it.
--
--   * `app.permissions` is written only by migrations. A trigger that refuses a
--     permission without metadata also refuses the legitimate order — metadata
--     first cannot satisfy the foreign key, and the permission first cannot
--     satisfy the trigger — so it would make adding a permission impossible
--     rather than safer.

create or replace function private.claim_whatsapp_batch_v1(
  p_limit integer default 20,
  p_visibility_seconds integer default 120
)
returns table(
  message_id uuid,
  tenant_id uuid,
  booking_id uuid,
  template_key text,
  template_locale text,
  booking_revision bigint,
  attempt integer,
  correlation_id uuid,
  payload jsonb,
  recipient_phone_e164 text,
  phone_number_id text,
  access_token_secret_ref text,
  template_name text,
  template_language text
)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '10s'
as $$
declare
  v_now timestamptz := statement_timestamp();
begin
  if p_limit is null or p_limit not between 1 and 200
     or p_visibility_seconds is null or p_visibility_seconds not between 30 and 900 then
    raise exception using errcode='22023',message='notification_invalid_batch';
  end if;

  -- A claim whose worker died is still this tenant's message to settle. The
  -- lapsed `sending` row is settled here rather than re-claimed, so the join
  -- below can never discard a row this function has just marked `sending`.
  update app.notification_messages m
  set status='failed', dead_lettered_at=v_now, locked_until=null,
      last_error_code='whatsapp_unavailable', updated_at=v_now
  where m.channel='whatsapp' and m.dead_lettered_at is null
    and m.next_attempt_at<=v_now
    and (m.status='queued'
      or (m.status='sending' and m.locked_until is not null and m.locked_until<=v_now))
    and (not (select s.available from private.whatsapp_state_v1(m.tenant_id) s)
      or not exists (select 1 from app.whatsapp_configs w
        where w.tenant_id=m.tenant_id and w.template_map ? m.template_key)
      or not exists (select 1 from app.booking_whatsapp_consents c
        where c.tenant_id=m.tenant_id and c.booking_id=m.booking_id));

  return query
  with claimed as (
    update app.notification_messages m
    set status='sending', attempts=m.attempts+1,
        locked_until=v_now+make_interval(secs=>p_visibility_seconds), updated_at=v_now
    where m.id in (
      select c.id from app.notification_messages c
      where c.channel='whatsapp'
        and c.status in ('queued','sending') and c.dead_lettered_at is null
        and c.next_attempt_at<=v_now
        and (c.locked_until is null or c.locked_until<=v_now)
        and (select s.available from private.whatsapp_state_v1(c.tenant_id) s)
      order by c.next_attempt_at
      limit p_limit
      for update skip locked)
    returning m.*
  )
  select c.id,c.tenant_id,c.booking_id,c.template_key,c.template_locale,c.booking_revision,
    c.attempts,c.correlation_id,
    private.notification_claim_payload_v1(row(c.*)::app.notification_messages,o.payload),
    consent.phone_e164,w.phone_number_id,w.access_token_secret_ref,
    w.template_map->c.template_key->>'name',
    w.template_map->c.template_key->>'language'
  from claimed c
  join app.whatsapp_configs w on w.tenant_id=c.tenant_id
  join app.booking_whatsapp_consents consent
    on consent.tenant_id=c.tenant_id and consent.booking_id=c.booking_id
  left join app.outbox_events o on o.id=c.outbox_event_id;
end;
$$;
revoke all on function private.claim_whatsapp_batch_v1(integer,integer) from public,anon,authenticated;
grant execute on function private.claim_whatsapp_batch_v1(integer,integer) to service_role;