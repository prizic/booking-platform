-- Separate personal channel payload from minimal consent evidence. Erasure
-- clears phone/text but retains version, locale, time and a non-reversible hash.
alter table app.booking_whatsapp_consents add column consent_text_hash text;
-- The append-only guard permits only the central privacy operation to redact.
do $$ begin
  perform set_config('app.erasure_request_id',gen_random_uuid()::text,true);
  update app.booking_whatsapp_consents set consent_text_hash=
    encode(sha256(convert_to(consent_text,'UTF8')),'hex');
  perform set_config('app.erasure_request_id','',true);
end $$;
alter table app.booking_whatsapp_consents alter column consent_text_hash set not null;
alter table app.booking_whatsapp_consents add constraint booking_whatsapp_consents_hash_check
  check (consent_text_hash ~ '^[a-f0-9]{64}$');
alter table app.booking_whatsapp_consents alter column phone_e164 drop not null;
alter table app.booking_whatsapp_consents alter column consent_text drop not null;
-- Future confirmation inserts continue to use the existing signature.
create function private.hash_whatsapp_consent_v1()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.phone_e164 is null or new.consent_text is null then
    raise exception using errcode='22023',message='whatsapp_consent_invalid';
  end if;
  new.consent_text_hash:=encode(sha256(convert_to(new.consent_text,'UTF8')),'hex');
  return new;
end;
$$;
revoke all on function private.hash_whatsapp_consent_v1() from public,anon,authenticated,service_role;
create trigger booking_whatsapp_consents_hash before insert on app.booking_whatsapp_consents
  for each row execute function private.hash_whatsapp_consent_v1();

create or replace function private.erase_customer_records_v1(
  p_tenant_id uuid, p_customer_id uuid, p_request_id uuid)
returns table (subsystem text, affected integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_contacts integer;
  v_intake integer;
  v_notes integer;
  v_customer integer;
  v_consents integer;
begin
  perform pg_catalog.set_config('app.erasure_request_id', p_request_id::text, true);
  delete from app.booking_intake_answers ia
  where ia.tenant_id = p_tenant_id and ia.booking_id in (
    select bc.booking_id from app.booking_contacts bc
    where bc.tenant_id = p_tenant_id and bc.customer_id = p_customer_id);
  get diagnostics v_intake = row_count;
  delete from app.booking_notes n
  where n.tenant_id = p_tenant_id and n.visibility = 'sensitive' and n.booking_id in (
    select bc.booking_id from app.booking_contacts bc
    where bc.tenant_id = p_tenant_id and bc.customer_id = p_customer_id);
  get diagnostics v_notes = row_count;
  update app.notification_messages m
  set status = 'failed', last_error_code = 'customer_erased',
    dead_lettered_at = statement_timestamp(), locked_until = null,
    payload = '{}'::jsonb, updated_at = statement_timestamp()
  where m.tenant_id = p_tenant_id and m.recipient_kind = 'customer'
    and m.status in ('queued','sending') and m.booking_id in (
      select bc.booking_id from app.booking_contacts bc
      where bc.tenant_id = p_tenant_id and bc.customer_id = p_customer_id);
  update app.booking_whatsapp_consents c set phone_e164=null,consent_text=null
  where c.tenant_id = p_tenant_id and c.booking_id in (
    select bc.booking_id from app.booking_contacts bc
    where bc.tenant_id = p_tenant_id and bc.customer_id = p_customer_id)
    and (c.phone_e164 is not null or c.consent_text is not null);
  get diagnostics v_consents = row_count;
  update app.booking_contacts bc set full_name = 'redacted', email = 'redacted@invalid', phone = null
  where bc.tenant_id = p_tenant_id and bc.customer_id = p_customer_id;
  get diagnostics v_contacts = row_count;
  update app.customers c set
    full_name = null, email = null, phone = null, tags = '{}'::text[],
    email_hash = pg_catalog.encode(pg_catalog.sha256(
      pg_catalog.convert_to(pg_catalog.gen_random_uuid()::text,'UTF8')),'hex'),
    erased_at = statement_timestamp(), revision = c.revision + 1,
    updated_at = statement_timestamp()
  where c.tenant_id = p_tenant_id and c.id = p_customer_id;
  get diagnostics v_customer = row_count;
  perform pg_catalog.set_config('app.erasure_request_id', '', true);
  return query select 'sensitive_records'::text, v_intake + v_notes + v_consents
    union all select 'postgres_primary'::text, v_contacts + v_customer;
end;
$$;

-- Recheck a claimed recipient immediately before provider handoff. Erasure
-- cancels claims, but a worker may already hold their old phone in memory.
create function private.authorize_whatsapp_delivery_v1(
  p_message_id uuid,p_attempt integer,p_phone_e164 text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from app.notification_messages m
    join app.booking_whatsapp_consents w on w.tenant_id=m.tenant_id and w.booking_id=m.booking_id
    join app.booking_contacts bc on bc.tenant_id=m.tenant_id and bc.booking_id=m.booking_id
    join app.customers c on c.tenant_id=bc.tenant_id and c.id=bc.customer_id
    where m.id=p_message_id and m.channel='whatsapp' and m.status='sending'
      and m.attempts=p_attempt and m.locked_until>statement_timestamp()
      and m.dead_lettered_at is null and c.erased_at is null
      and w.phone_e164=p_phone_e164
  );
$$;
revoke all on function private.authorize_whatsapp_delivery_v1(uuid,integer,text)
  from public,anon,authenticated,service_role;
grant execute on function private.authorize_whatsapp_delivery_v1(uuid,integer,text) to service_role;
create function api_v1.authorize_whatsapp_delivery_v1(
  p_message_id uuid,p_attempt integer,p_phone_e164 text)
returns boolean language sql security invoker set search_path = '' as $$
  select private.authorize_whatsapp_delivery_v1(p_message_id,p_attempt,p_phone_e164);
$$;
revoke all on function api_v1.authorize_whatsapp_delivery_v1(uuid,integer,text)
  from public,anon,authenticated,service_role;
grant execute on function api_v1.authorize_whatsapp_delivery_v1(uuid,integer,text) to service_role;

-- Earlier completed erasures cannot be re-run through the request API. Repair
-- their remaining channel payload now, without bypassing any later legal hold.
do $$ begin
  perform set_config('app.erasure_request_id',gen_random_uuid()::text,true);
  update app.booking_whatsapp_consents w set phone_e164=null,consent_text=null
  from app.booking_contacts bc join app.customers c
    on c.tenant_id=bc.tenant_id and c.id=bc.customer_id
  where w.tenant_id=bc.tenant_id and w.booking_id=bc.booking_id and c.erased_at is not null
    and not private.has_legal_hold_v1(c.tenant_id,c.id)
    and (w.phone_e164 is not null or w.consent_text is not null);
  update app.notification_messages m set status='failed',last_error_code='customer_erased',
    dead_lettered_at=statement_timestamp(),locked_until=null,payload='{}'::jsonb,
    updated_at=statement_timestamp()
  from app.booking_contacts bc join app.customers c
    on c.tenant_id=bc.tenant_id and c.id=bc.customer_id
  where m.tenant_id=bc.tenant_id and m.booking_id=bc.booking_id
    and m.recipient_kind='customer' and m.status in ('queued','sending')
    and c.erased_at is not null and not private.has_legal_hold_v1(c.tenant_id,c.id);
  perform set_config('app.erasure_request_id','',true);
end $$;
