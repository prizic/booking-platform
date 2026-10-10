-- A purged rendition must never be regenerated under its old message key,
-- even if an administrator later replays the failed notification.
alter table app.notification_messages add column delivery_invalidated_at timestamptz;

create table private.notification_delivery_envelopes (
  tenant_id uuid not null,
  message_id uuid not null,
  encrypted_payload text not null check (length(encrypted_payload) between 40 and 2000000),
  authority_hash text not null,
  expires_at timestamptz not null default (statement_timestamp() + interval '24 hours'),
  primary key (tenant_id,message_id),
  foreign key (tenant_id,message_id) references app.notification_messages(tenant_id,id) on delete cascade
);
alter table private.notification_delivery_envelopes enable row level security;
revoke all on private.notification_delivery_envelopes from public,anon,authenticated,service_role;

create function private.prepare_notification_delivery_v1(
  p_message_id uuid, p_attempt integer, p_recipient_email text,
  p_claim_payload jsonb, p_encrypted_payload text default null)
returns table (encrypted_payload text)
language plpgsql security definer set search_path = '' as $$
declare
  v_message app.notification_messages%rowtype;
  v_authority text;
  v_envelope private.notification_delivery_envelopes%rowtype;
  v_otp_id uuid;
  v_outbox_payload jsonb;
begin
  select * into v_message from app.notification_messages m where m.id = p_message_id
    and m.channel = 'email' and m.status = 'sending' and m.attempts = p_attempt
    and m.locked_until > statement_timestamp() and m.dead_lettered_at is null
    and m.delivery_invalidated_at is null for update;
  if v_message.id is null then
    raise exception using errcode = '42501', message = 'notification_delivery_unavailable';
  end if;
  select o.payload into v_outbox_payload from app.outbox_events o
  where o.id=v_message.outbox_event_id;
  if v_message.recipient_kind = 'customer' then
    select encode(sha256(convert_to(bc.email,'UTF8')),'hex') into v_authority
    from app.booking_contacts bc join app.customers c
      on c.tenant_id = bc.tenant_id and c.id = bc.customer_id
    where bc.tenant_id = v_message.tenant_id and bc.booking_id = v_message.booking_id
      and c.erased_at is null and bc.email=p_recipient_email;
  else
    select encode(sha256(convert_to(
      au.email || private.notification_claim_payload_v1(v_message,v_outbox_payload)::text,'UTF8')),'hex')
    into v_authority
    from app.memberships mem join auth.users au on au.id = mem.auth_user_id
    where mem.tenant_id = v_message.tenant_id and mem.id = v_message.recipient_membership_id
      and mem.status = 'active' and au.email=p_recipient_email
      and private.notification_claim_payload_v1(v_message,v_outbox_payload)=p_claim_payload
      and (v_message.booking_id is null or exists (
        select 1 from app.bookings b where b.tenant_id=v_message.tenant_id and b.id=v_message.booking_id
          and private.member_scope_covers_booking_v1(
            private.member_permission_scope_v1(mem.tenant_id,mem.id,
              array['booking.view.any','booking.view.own']),
            mem.tenant_id,mem.id,b.location_id,b.hold_id)));
  end if;
  if v_authority is null then
    raise exception using errcode = '42501', message = 'notification_delivery_unavailable';
  end if;
  if v_message.template_key = 'management.otp_requested' and not v_message.is_test then
    select coalesce(v_message.payload->>'otp_id',o.payload->>'otp_id')::uuid into v_otp_id
    from app.outbox_events o where o.id = v_message.outbox_event_id;
    if not exists (
      select 1 from app.management_otps otp join app.management_tokens token on token.id = otp.token_id
      where otp.id = v_otp_id and otp.tenant_id = v_message.tenant_id
        and token.booking_id = v_message.booking_id and otp.verified_at is null
        and otp.expires_at > statement_timestamp() and token.expires_at > statement_timestamp()
        and token.revoked_at is null and token.consumed_at is null
    ) then
      raise exception using errcode = '42501', message = 'notification_delivery_unavailable';
    end if;
  end if;
  if p_encrypted_payload is not null then
    insert into private.notification_delivery_envelopes(tenant_id,message_id,encrypted_payload,authority_hash)
    values (v_message.tenant_id,v_message.id,p_encrypted_payload,v_authority)
    on conflict (tenant_id,message_id) do nothing;
  end if;
  select * into v_envelope from private.notification_delivery_envelopes e
  where e.tenant_id = v_message.tenant_id and e.message_id = v_message.id;
  if v_envelope.message_id is not null and (
    v_envelope.authority_hash <> v_authority or v_envelope.expires_at <= statement_timestamp()
  ) then
    raise exception using errcode = '42501', message = 'notification_delivery_unavailable';
  end if;
  return query select v_envelope.encrypted_payload;
end;
$$;
revoke all on function private.prepare_notification_delivery_v1(uuid,integer,text,jsonb,text)
  from public,anon,authenticated,service_role;
grant execute on function private.prepare_notification_delivery_v1(uuid,integer,text,jsonb,text) to service_role;

create function api_v1.prepare_notification_delivery_v1(
  p_message_id uuid, p_attempt integer, p_recipient_email text,
  p_claim_payload jsonb, p_encrypted_payload text default null)
returns table (encrypted_payload text)
language sql security invoker set search_path = '' as $$
  select * from private.prepare_notification_delivery_v1(
    p_message_id,p_attempt,p_recipient_email,p_claim_payload,p_encrypted_payload);
$$;
revoke all on function api_v1.prepare_notification_delivery_v1(uuid,integer,text,jsonb,text)
  from public,anon,authenticated,service_role;
grant execute on function api_v1.prepare_notification_delivery_v1(uuid,integer,text,jsonb,text) to service_role;

create function private.mint_notification_otp_v1(p_message_id uuid,p_attempt integer)
returns table (code text,expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_message app.notification_messages%rowtype;
  v_otp_id uuid;
begin
  select * into v_message from app.notification_messages m where m.id = p_message_id
    and m.channel = 'email' and m.template_key = 'management.otp_requested' and not m.is_test
    and m.status = 'sending' and m.attempts = p_attempt
    and m.locked_until > statement_timestamp() and m.dead_lettered_at is null for update;
  if v_message.id is null or exists (select 1 from private.notification_delivery_envelopes e
    where e.tenant_id = v_message.tenant_id and e.message_id = v_message.id) then
    raise exception using errcode = '42501', message = 'notification_delivery_unavailable';
  end if;
  select coalesce(v_message.payload->>'otp_id',o.payload->>'otp_id')::uuid into v_otp_id
  from app.outbox_events o where o.id = v_message.outbox_event_id;
  if not exists (select 1 from app.management_otps otp
    join app.management_tokens token on token.id = otp.token_id
    where otp.id = v_otp_id and otp.tenant_id = v_message.tenant_id
      and token.booking_id = v_message.booking_id) then
    raise exception using errcode = '42501', message = 'notification_delivery_unavailable';
  end if;
  return query select minted.code,minted.expires_at
    from private.mint_management_otp_code_v1(v_otp_id) minted;
end;
$$;
revoke all on function private.mint_notification_otp_v1(uuid,integer)
  from public,anon,authenticated,service_role;
grant execute on function private.mint_notification_otp_v1(uuid,integer) to service_role;

create function api_v1.mint_notification_otp_v1(p_message_id uuid,p_attempt integer)
returns table (code text,expires_at timestamptz)
language sql security invoker set search_path = '' as $$
  select * from private.mint_notification_otp_v1(p_message_id,p_attempt);
$$;
revoke all on function api_v1.mint_notification_otp_v1(uuid,integer)
  from public,anon,authenticated,service_role;
grant execute on function api_v1.mint_notification_otp_v1(uuid,integer) to service_role;

create function private.purge_erased_notification_envelopes_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- A digest can contain names from several bookings but has no booking_id.
  -- Invalidate all tenant digest envelopes on erasure; deleting ciphertext
  -- without cancelling its active message would allow a different rendition
  -- to reuse the same provider key.
  update app.notification_messages m set delivery_invalidated_at=statement_timestamp()
  where m.tenant_id=new.tenant_id and m.recipient_kind='staff'
    and m.template_key='staff.daily_digest';
  update app.notification_messages m set status='failed',last_error_code='customer_erased',
    dead_lettered_at=statement_timestamp(),locked_until=null,payload='{}'::jsonb,
    updated_at=statement_timestamp()
  where m.tenant_id=new.tenant_id and m.recipient_kind='staff'
    and m.template_key='staff.daily_digest' and m.status in ('queued','sending');
  delete from private.notification_delivery_envelopes e using app.notification_messages m
  where e.tenant_id=new.tenant_id and m.tenant_id=e.tenant_id and m.id=e.message_id
    and m.recipient_kind='staff' and m.template_key='staff.daily_digest';
  delete from private.notification_delivery_envelopes e
  using app.notification_messages m,app.booking_contacts bc
  where e.tenant_id = new.tenant_id and m.tenant_id = e.tenant_id and m.id = e.message_id
    and bc.tenant_id = m.tenant_id and bc.booking_id = m.booking_id and bc.customer_id = new.id;
  return new;
end;
$$;
revoke all on function private.purge_erased_notification_envelopes_v1()
  from public,anon,authenticated,service_role;
create trigger customers_purge_notification_envelopes
  after update of erased_at on app.customers
  for each row when (new.erased_at is not null)
  execute function private.purge_erased_notification_envelopes_v1();
