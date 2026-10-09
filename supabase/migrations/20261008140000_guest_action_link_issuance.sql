-- Management integration: guests can reach cancel/reschedule from the emailed link.
--
-- Accepted end-to-end design (docs/journeys.md J3 step 4, RECOVERY-1; ADR-0004
-- decisions 6 and 9): every booking email carries a `view` link, and requesting
-- a sensitive action issues that intent's own token plus an OTP to the address
-- on the booking. Production only ever minted `view` links
-- (`private.mint_notification_manage_url_v1`), and `request_management_otp_v1`
-- refuses `view` tokens, so a guest holding only the emailed link could never
-- reach either action — the Client rendered "arrives with the next release".
--
-- This migration adds the one missing step: minting a `cancel` or `reschedule`
-- token from a live `view` token, with the step-up challenge and the EXISTING
-- `management.otp_requested` delivery path. No new email type, no new outbox
-- topic, no token-authority change: `act_on_management_link_v1` still requires
-- a live action token with a verified OTP, and the issued plaintext is returned
-- only to the holder of the live view bearer for the same booking — which was
-- itself delivered to the address on file. A forwarded view link still cannot
-- act on its own: the OTP is emailed to the booking address, never displayed.
-- The OTP email template is unchanged (owner B), and no Client/package change
-- outside the manage surface is required.
--
-- Scope: cancel/reschedule only — the two intents the Client implements. Privacy
-- and request_alternative intents have no guest UI and are not minted here.

-- Request an action link from the emailed view link. Every refusal is the same
-- `unavailable` row, exactly like redemption (ADR-0004 decision 12).
create or replace function private.request_management_action_v1(
  p_hostname text,
  p_application text,
  p_token text,
  p_intent text
)
returns table(
  contract_version integer,
  outcome text,
  token text,
  intent text,
  expires_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $function$
#variable_conflict use_column
declare
  v_now timestamptz := statement_timestamp();
  v_request_id uuid := pg_catalog.gen_random_uuid();
  v_tenant_id uuid;
  v_source app.management_tokens%rowtype;
  v_booking app.bookings%rowtype;
  v_email text;
  v_issued_token text;
  v_issued_expires_at timestamptz;
  v_issued_id uuid;
  v_otp_id uuid;
  v_otp_expires_at timestamptz := statement_timestamp() + interval '10 minutes';
  v_recent integer;
  v_forwarded text;
  v_actor_hash text;
  v_cancel_cutoff integer;
  v_reschedule_cutoff integer;
  -- Precedented ceilings, never named in an error or a log line: the actor
  -- ceiling mirrors redemption, the per-booking issuance ceiling mirrors the
  -- OTP-request cooldown (3 per 10 minutes).
  v_actor_limit constant integer := 30;
  v_issuance_limit constant integer := 3;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$'
     or p_intent is null or p_intent not in ('cancel','reschedule') then
    return query select 1,'unavailable'::text,null::text,null::text,null::timestamptz;
    return;
  end if;
  -- The source link must have been opened on the tenant host it was issued
  -- for, exactly like redemption.
  select r.tenant_id into v_tenant_id
  from api_v1.resolve_public_tenant_v1(p_hostname,p_application) r;
  if v_tenant_id is null then
    return query select 1,'unavailable'::text,null::text,null::text,null::timestamptz;
    return;
  end if;

  begin
    v_forwarded := btrim(split_part(
      coalesce(pg_catalog.current_setting('request.headers',true),'{}')::jsonb->>'x-forwarded-for',',',1));
  exception when others then
    v_forwarded := null;
  end;
  v_actor_hash := case when coalesce(v_forwarded,'')='' then null else encode(pg_catalog.sha256(
    pg_catalog.convert_to(v_tenant_id::text||':'||v_forwarded,'UTF8')),'hex') end;

  if v_actor_hash is not null and (
    select count(*) from app.management_access_events e
    where e.tenant_id=v_tenant_id and e.actor_hash=v_actor_hash
      and e.created_at > v_now - interval '10 minutes') >= v_actor_limit then
    insert into app.management_access_events(
      tenant_id,action,outcome,actor_hash,request_id)
    values (v_tenant_id,'denied','failed',v_actor_hash,v_request_id);
    return query select 1,'unavailable'::text,null::text,null::text,null::timestamptz;
    return;
  end if;

  select * into v_source from app.management_tokens t
  where t.tenant_id=v_tenant_id
    and t.token_hash=encode(pg_catalog.sha256(
      pg_catalog.convert_to(v_tenant_id::text||':'||p_token,'UTF8')),'hex');

  -- Only the emailed `view` link can be exchanged, and only a few times per
  -- booking and intent: each issuance supersedes the previous action link, so
  -- the newest email stays authoritative.
  select count(*) into v_recent from app.management_access_events e
  where e.tenant_id=v_tenant_id and e.booking_id=v_source.booking_id
    and e.intent=p_intent and e.action='issued'
    and e.created_at > v_now - interval '10 minutes';
  if v_source.id is null or v_source.intent is distinct from 'view'
     or v_source.expires_at <= v_now
     or v_source.revoked_at is not null or v_source.consumed_at is not null
     or coalesce(v_recent,0) >= v_issuance_limit then
    insert into app.management_access_events(
      tenant_id,booking_id,token_id,intent,action,outcome,actor_hash,request_id)
    values (v_tenant_id,v_source.booking_id,v_source.id,p_intent,'denied','failed',
      v_actor_hash,v_request_id);
    return query select 1,'unavailable'::text,null::text,null::text,null::timestamptz;
    return;
  end if;

  select * into v_booking from app.bookings b
  where b.tenant_id=v_tenant_id and b.id=v_source.booking_id;
  select c.email into v_email from app.booking_contacts c
  where c.tenant_id=v_tenant_id and c.booking_id=v_source.booking_id;
  if v_booking.id is null or v_email is null then
    insert into app.management_access_events(
      tenant_id,booking_id,token_id,intent,action,outcome,actor_hash,request_id)
    values (v_tenant_id,v_source.booking_id,v_source.id,p_intent,'denied','failed',
      v_actor_hash,v_request_id);
    return query select 1,'unavailable'::text,null::text,null::text,null::timestamptz;
    return;
  end if;

  -- Eligibility is evaluated against the snapshotted policy, exactly like
  -- redemption: an ineligible request is refused before anything is minted.
  v_cancel_cutoff := coalesce((v_booking.policy_snapshot->>'cancellation_cutoff_minutes')::integer,1440);
  v_reschedule_cutoff := coalesce((v_booking.policy_snapshot->>'reschedule_cutoff_minutes')::integer,1440);
  if (p_intent = 'cancel' and not (
        v_booking.status in ('confirmed','requested')
        and coalesce((v_booking.policy_snapshot->>'cancellation_customer_self_service')::boolean,true)
        and v_booking.starts_at - make_interval(mins=>v_cancel_cutoff) > v_now))
     or (p_intent = 'reschedule' and not (
        v_booking.status = 'confirmed'
        and coalesce((v_booking.policy_snapshot->>'reschedule_customer_self_service')::boolean,true)
        and v_booking.starts_at - make_interval(mins=>v_reschedule_cutoff) > v_now)) then
    insert into app.management_access_events(
      tenant_id,booking_id,token_id,intent,action,outcome,actor_hash,request_id)
    values (v_tenant_id,v_booking.id,v_source.id,p_intent,'denied','failed',
      v_actor_hash,v_request_id);
    return query select 1,'unavailable'::text,null::text,null::text,null::timestamptz;
    return;
  end if;

  -- The mint supersedes older links of the same intent, so a re-request
  -- retires the forwarded older one. Any failure here must stay uniform.
  begin
    select i.token, i.expires_at into v_issued_token, v_issued_expires_at
    from private.issue_management_token_v1(
      v_tenant_id, v_source.booking_id, p_intent, v_request_id) i;
  exception when others then
    insert into app.management_access_events(
      tenant_id,booking_id,token_id,intent,action,outcome,actor_hash,request_id)
    values (v_tenant_id,v_booking.id,v_source.id,p_intent,'denied','failed',
      v_actor_hash,v_request_id);
    return query select 1,'unavailable'::text,null::text,null::text,null::timestamptz;
    return;
  end;
  select t.id into v_issued_id from app.management_tokens t
  where t.token_hash=encode(pg_catalog.sha256(
    pg_catalog.convert_to(v_tenant_id::text||':'||v_issued_token,'UTF8')),'hex');
  if v_issued_id is null then
    insert into app.management_access_events(
      tenant_id,booking_id,token_id,intent,action,outcome,actor_hash,request_id)
    values (v_tenant_id,v_booking.id,v_source.id,p_intent,'denied','failed',
      v_actor_hash,v_request_id);
    return query select 1,'unavailable'::text,null::text,null::text,null::timestamptz;
    return;
  end if;

  -- The step-up challenge is created now and delivered through the existing
  -- `management.otp_requested` path: the worker mints the code at send time,
  -- so no code plaintext is ever written here (ADR-0004 decision 5 applied to
  -- the step-up code).
  insert into app.management_otps(tenant_id,token_id,expires_at)
  values (v_tenant_id,v_issued_id,v_otp_expires_at)
  returning id into v_otp_id;

  insert into app.outbox_events(tenant_id,booking_id,topic,payload,correlation_id)
  values (v_tenant_id,v_source.booking_id,'management.otp_requested',
    jsonb_build_object('otp_id',v_otp_id,'expires_at',v_otp_expires_at),
    v_request_id)
  on conflict (tenant_id,booking_id,topic,booking_revision) do update
    set payload=excluded.payload, state='pending',
        available_at=statement_timestamp(), updated_at=statement_timestamp();

  insert into app.management_access_events(
    tenant_id,booking_id,token_id,intent,action,outcome,actor_hash,request_id)
  values (v_tenant_id,v_source.booking_id,v_issued_id,p_intent,'otp_requested','succeeded',
    v_actor_hash,v_request_id);

  return query select 1,'issued'::text,v_issued_token,p_intent,v_issued_expires_at;
end;
$function$;
revoke all on function private.request_management_action_v1(text,text,text,text) from public;
grant execute on function private.request_management_action_v1(text,text,text,text) to anon,authenticated;

create or replace function api_v1.request_management_action_v1(
  p_hostname text,
  p_application text,
  p_token text,
  p_intent text
)
returns table(
  contract_version integer, outcome text, token text, intent text,
  expires_at timestamptz
)
language sql volatile security invoker set search_path = '' set statement_timeout = '5s' as $$
  select * from private.request_management_action_v1(
    p_hostname,p_application,p_token,p_intent);
$$;
revoke all on function api_v1.request_management_action_v1(text,text,text,text) from public;
grant execute on function api_v1.request_management_action_v1(text,text,text,text) to anon,authenticated;
