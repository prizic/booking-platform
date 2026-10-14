-- ADR-0004 email-only recovery: submission has no booking/customer lookup.
-- Admitted submissions store the same bounded digest-only shape. Matching,
-- eligibility, suppression and credential minting happen later in the worker.
create table app.booking_recovery_requests (
  tenant_id uuid not null references app.tenants(id) on delete restrict,
  request_id uuid not null,
  email_hash text not null check (email_hash ~ '^[a-f0-9]{64}$'),
  actor_hash text not null check (actor_hash ~ '^[a-f0-9]{64}$'),
  deliver boolean not null,
  after_booking_id uuid,
  processed_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id,request_id)
);
create index booking_recovery_requests_tenant_rate on app.booking_recovery_requests(tenant_id,created_at);
create index booking_recovery_requests_email_rate on app.booking_recovery_requests(tenant_id,email_hash,created_at);
create index booking_recovery_requests_actor_rate on app.booking_recovery_requests(tenant_id,actor_hash,created_at);
create index booking_recovery_requests_due on app.booking_recovery_requests(created_at) where processed_at is null and deliver;
create index booking_recovery_requests_retention on app.booking_recovery_requests(created_at,tenant_id,request_id);
alter table app.booking_recovery_requests enable row level security;
create policy booking_recovery_requests_select_denied on app.booking_recovery_requests
  for select to anon,authenticated using (false);
create policy booking_recovery_requests_insert_denied on app.booking_recovery_requests
  for insert to anon,authenticated with check (false);
create policy booking_recovery_requests_update_denied on app.booking_recovery_requests
  for update to anon,authenticated using (false) with check (false);
create policy booking_recovery_requests_delete_denied on app.booking_recovery_requests
  for delete to anon,authenticated using (false);
revoke all on app.booking_recovery_requests from public,anon,authenticated;

create or replace function private.prune_booking_recovery_requests_v1(p_limit integer default 1000)
returns integer language sql volatile security definer set search_path = '' set statement_timeout = '5s' as $$
  with removed as (delete from app.booking_recovery_requests where (tenant_id,request_id) in (
    select tenant_id,request_id from app.booking_recovery_requests
      where created_at<statement_timestamp()-interval '7 days' order by created_at
      limit least(greatest(coalesce(p_limit,1000),1),10000)) returning 1)
  select count(*)::integer from removed;
$$;
revoke all on function private.prune_booking_recovery_requests_v1(integer) from public,anon,authenticated;

alter table app.management_access_events drop constraint management_access_events_action_check;
alter table app.management_access_events add constraint management_access_events_action_check
  check (action in ('issued','redeemed','otp_requested','otp_verified','otp_failed','denied','revoked','recovery_requested'));

create or replace function private.booking_management_email_v1(p_tenant_id uuid,p_booking_id uuid)
returns text language sql stable security invoker set search_path = '' as $$
  select lower(btrim(case when bc.customer_id is null then bc.email
    when c.erased_at is null and c.restricted_at is null then c.email end))
  from app.booking_contacts bc left join app.customers c
    on c.tenant_id=bc.tenant_id and c.id=bc.customer_id
  where bc.tenant_id=p_tenant_id and bc.booking_id=p_booking_id;
$$;
-- Serialize issuance/delivery with correction. Snapshot contacts never change.
create or replace function private.lock_booking_management_contact_v1(p_tenant_id uuid,p_booking_id uuid)
returns void language plpgsql volatile security invoker set search_path = '' as $$
begin
  perform c.id from app.customers c join app.booking_contacts bc
    on bc.tenant_id=c.tenant_id and bc.customer_id=c.id
    where bc.tenant_id=p_tenant_id and bc.booking_id=p_booking_id for share of c;
end;
$$;

create or replace function private.revoke_corrected_customer_management_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_token record;
begin
  if old.email is distinct from new.email or old.restricted_at is distinct from new.restricted_at
    or old.erased_at is distinct from new.erased_at then
    for v_token in update app.management_tokens t set revoked_at=statement_timestamp(),
      revoked_reason='contact_corrected'
      where t.tenant_id=new.tenant_id and t.revoked_at is null and t.consumed_at is null
        and exists(select 1 from app.booking_contacts bc where bc.tenant_id=t.tenant_id
          and bc.booking_id=t.booking_id and bc.customer_id=new.id)
      returning t.id,t.booking_id,t.intent
    loop
      insert into app.management_access_events(tenant_id,booking_id,token_id,intent,action,outcome,request_id)
      values(new.tenant_id,v_token.booking_id,v_token.id,v_token.intent,'revoked','succeeded',gen_random_uuid());
    end loop;
  end if;
  return new;
end;
$$;
create trigger customers_revoke_corrected_management
  after update of email,restricted_at,erased_at on app.customers for each row
  execute function private.revoke_corrected_customer_management_v1();

-- Expand safely for existing rows too: a pre-upgrade canonical correction may
-- already have left a live bearer tied to a historical email. Revoke that
-- authority without rewriting any snapshot or retaining plaintext credentials.
with revoked as (
  update app.management_tokens t set revoked_at=statement_timestamp(),revoked_reason='contact_corrected'
  where t.revoked_at is null and t.consumed_at is null and
    (private.booking_management_email_v1(t.tenant_id,t.booking_id) is null or
      t.email_hash is distinct from encode(sha256(convert_to(t.tenant_id::text||':'||
        private.booking_management_email_v1(t.tenant_id,t.booking_id),'UTF8')),'hex'))
  returning t.tenant_id,t.booking_id,t.id,t.intent
)
insert into app.management_access_events(tenant_id,booking_id,token_id,intent,action,outcome,request_id)
  select tenant_id,booking_id,id,intent,'revoked','succeeded',gen_random_uuid() from revoked;

create or replace function private.request_booking_recovery_v1(
  p_hostname text,p_application text,p_email text,p_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' set statement_timeout = '5s' as $$
declare
  v_tenant uuid; v_hash text; v_actor text; v_ip text; v_headers text; v_email text;
  v_now timestamptz := statement_timestamp();
  v_result constant jsonb := '{"contractVersion":1,"outcome":"accepted"}'::jsonb;
begin
  -- Inspect byte lengths before normalization, regex, JSON parsing or hashing.
  -- Invalid/oversized inputs never create requests, limiter keys or audit rows.
  -- The bounds and all admission decisions are independent of account existence.
  if p_application is distinct from 'client' or p_request_id is null or p_hostname is null
    or octet_length(p_hostname)>320 or p_email is null or octet_length(p_email)>1280 then
    return v_result;
  end if;
  v_email := lower(btrim(p_email));
  if char_length(v_email) not between 3 and 320
    or v_email !~ '^[^[:space:]@<>"'']+@[^[:space:]@<>"'']+\.[^[:space:]@<>"'']+$' then
    return v_result;
  end if;
  -- Host is a selector only; resolve_public_tenant checks verified active route,
  -- tenant and instance. A supplied UUID never establishes recovery scope.
  select r.tenant_id into v_tenant from api_v1.resolve_public_tenant_v1(p_hostname,p_application) r;
  if v_tenant is null then return v_result; end if;
  -- Keep the existing tenant/action transaction lock, covering replay, every
  -- independent admission budget and both inserts. Concurrent calls cannot
  -- oversubscribe a window. Denials allocate no per-email/IP/idempotency state.
  perform pg_advisory_xact_lock(hashtextextended('booking-recovery:'||v_tenant::text,0));
  if exists(select 1 from app.booking_recovery_requests where tenant_id=v_tenant and request_id=p_request_id) then
    return v_result;
  end if;
  -- Cap the indexed scans too: no unbounded count over historic/abusive traffic.
  if (select count(*) from (select 1 from app.booking_recovery_requests where tenant_id=v_tenant
    and created_at>v_now-interval '1 hour' limit 100) q)>=100 then return v_result; end if;
  v_headers := current_setting('request.headers',true);
  begin
    if octet_length(v_headers)<=4096 then
      v_ip := btrim(split_part(v_headers::jsonb->>'x-forwarded-for',',',1));
    end if;
  exception when others then v_ip := null; end;
  -- Missing/malformed/oversized network metadata shares the restrictive bucket.
  -- Only a bounded IP literal is hashed; ingress still owns trustworthy headers.
  if octet_length(v_ip)>64 then v_ip := null; end if;
  v_actor := encode(sha256(convert_to(v_tenant::text||':recovery-ip:'||coalesce(nullif(v_ip,''),'unknown'),'UTF8')),'hex');
  if (select count(*) from (select 1 from app.booking_recovery_requests where tenant_id=v_tenant
    and actor_hash=v_actor and created_at>v_now-interval '10 minutes' limit 20) q)>=20 then return v_result; end if;
  v_hash := encode(sha256(convert_to(v_tenant::text||':'||v_email,'UTF8')),'hex');
  if (select count(*) from (select 1 from app.booking_recovery_requests where tenant_id=v_tenant
    and email_hash=v_hash and created_at>v_now-interval '15 minutes' limit 3) q)>=3 then return v_result; end if;
  -- Admission limits persistence as well as delivery: at most 100 requests and
  -- 100 audits per tenant/hour, 20 per actor/10min and 3 per email/15min.
  insert into app.booking_recovery_requests(tenant_id,request_id,email_hash,actor_hash,deliver)
  values(v_tenant,p_request_id,v_hash,v_actor,true);
  -- Uniform admitted-request audit: no match/miss, raw address/IP or credential.
  -- Dropped submissions have no durable receipt; their accepted acknowledgment
  -- is deliberately unchanged and never promises delivery. Admitted UUIDs replay
  -- without writes for the retained seven-day receipt lifetime.
  insert into app.management_access_events(tenant_id,action,outcome,actor_hash,request_id)
  values(v_tenant,'recovery_requested','succeeded',v_actor,p_request_id);
  return v_result;
end;
$$;
create or replace function api_v1.request_booking_recovery_v1(
  p_hostname text,p_application text,p_email text,p_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = '' set statement_timeout = '5s' as $$
  select private.request_booking_recovery_v1(p_hostname,p_application,p_email,p_request_id);
$$;
revoke all on function private.request_booking_recovery_v1(text,text,text,uuid),
  api_v1.request_booking_recovery_v1(text,text,text,uuid) from public,anon,authenticated;
grant execute on function private.request_booking_recovery_v1(text,text,text,uuid),
  api_v1.request_booking_recovery_v1(text,text,text,uuid) to anon,authenticated;

create or replace function private.process_booking_recovery_v1(p_limit integer default 20)
returns integer language plpgsql volatile security definer set search_path = '' set statement_timeout = '10s' as $$
declare v_request record; v_booking record; v_done integer:=0; v_template text; v_version integer;
  v_seen integer; v_last uuid;
begin
  if p_limit is null or p_limit not between 1 and 200 then
    raise exception using errcode='22023',message='notification_invalid_batch'; end if;
  for v_request in select q.* from app.booking_recovery_requests q
    where q.deliver and q.processed_at is null and q.created_at>statement_timestamp()-interval '1 day'
    order by q.created_at limit p_limit for update skip locked
  loop
    v_seen:=0; v_last:=v_request.after_booking_id;
    -- Canonical contact and current lifecycle, tenant and routing are all
    -- rechecked asynchronously. Old snapshot emails cannot recover corrected
    -- customers. Each eligible booking has its own message and scoped link.
    for v_booking in select b.id,b.revision,b.locale,b.status from app.bookings b
      join app.booking_contacts bc on bc.tenant_id=b.tenant_id and bc.booking_id=b.id
      join app.customers c on c.tenant_id=bc.tenant_id and c.id=bc.customer_id
      join app.tenants t on t.id=b.tenant_id
      where b.tenant_id=v_request.tenant_id and c.erased_at is null and c.restricted_at is null
        and (v_request.after_booking_id is null or b.id>v_request.after_booking_id)
        and encode(sha256(convert_to(c.tenant_id::text||':'||lower(btrim(c.email)),'UTF8')),'hex')=v_request.email_hash
        and b.status in ('requested','confirmed','checked_in') and t.status='active'
        and private.management_token_expiry_v1('view',b.ends_at,statement_timestamp())>statement_timestamp()
        and exists(select 1 from app.tenant_domains d join app.instances i
          on i.tenant_id=d.tenant_id and i.id=d.instance_id
          where d.tenant_id=b.tenant_id and d.application='client' and d.kind='production'
            and d.active and d.verification_status='verified' and i.deployment_state='active')
      order by b.id limit 50
    loop
      v_seen:=v_seen+1; v_last:=v_booking.id;
      v_template := case when v_booking.status='requested' then 'booking.requested' else 'booking.confirmed' end;
      select version into v_version from app.notification_templates
        where key=v_template and locale=v_booking.locale and retired_at is null;
      if v_version is null then continue; end if;
      insert into app.notification_messages(tenant_id,booking_id,template_key,template_locale,template_version,
        booking_revision,recipient_hash,correlation_id,variant,dedupe_key,status)
      values(v_request.tenant_id,v_booking.id,v_template,v_booking.locale,v_version,v_booking.revision,
        v_request.email_hash,v_request.request_id,'recovery:'||v_request.request_id::text,
        'recovery:'||v_request.request_id::text||':'||v_booking.id::text,
        case when exists(select 1 from app.notification_suppressions s where s.tenant_id=v_request.tenant_id
          and s.recipient_hash=v_request.email_hash) then 'suppressed' else 'queued' end)
      on conflict do nothing;
    end loop;
    update app.booking_recovery_requests set after_booking_id=v_last,
      processed_at=case when v_seen<50 then statement_timestamp() end
      where tenant_id=v_request.tenant_id and request_id=v_request.request_id;
    v_done:=v_done+1;
  end loop;
  -- Bounded cleanup; digest-only anti-abuse data is not indefinite identity history.
  perform private.prune_booking_recovery_requests_v1(1000);
  return v_done;
end;
$$;
create or replace function private.booking_recovery_is_eligible_v1(p_tenant_id uuid,p_booking_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists(select 1 from app.bookings b join app.tenants t on t.id=b.tenant_id
    where b.tenant_id=p_tenant_id and b.id=p_booking_id and t.status='active'
      and b.status in ('requested','confirmed','checked_in')
      and private.booking_management_email_v1(b.tenant_id,b.id) is not null
      and private.management_token_expiry_v1('view',b.ends_at,statement_timestamp())>statement_timestamp()
      and exists(select 1 from app.tenant_domains d join app.instances i on i.tenant_id=d.tenant_id and i.id=d.instance_id
        where d.tenant_id=b.tenant_id and d.application='client' and d.kind='production'
          and d.active and d.verification_status='verified' and i.deployment_state='active'));
$$;
revoke all on function private.booking_management_email_v1(uuid,uuid),
  private.lock_booking_management_contact_v1(uuid,uuid),private.revoke_corrected_customer_management_v1(),
  private.process_booking_recovery_v1(integer),private.booking_recovery_is_eligible_v1(uuid,uuid) from public,anon,authenticated;

-- Existing credential and delivery semantics, with canonical contact resolution.

create or replace function private.issue_management_token_v1(
  p_tenant_id uuid,
  p_booking_id uuid,
  p_intent text,
  p_request_id uuid default null
)
returns table(token text, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_booking app.bookings%rowtype;
  v_email text;
  v_token text;
  v_expires_at timestamptz;
  v_token_id uuid;
begin
  if p_intent is null or p_intent not in ('view','reschedule','cancel','refund_request','request_alternative',
    'data_export','data_correction_request','data_deletion_request','data_restriction_request') then
    raise exception using errcode='42501',message='management_link_unavailable';
  end if;
  select * into v_booking from app.bookings b
  where b.tenant_id=p_tenant_id and b.id=p_booking_id;
  if v_booking.id is null then
    raise exception using errcode='42501',message='management_link_unavailable';
  end if;
  perform private.lock_booking_management_contact_v1(p_tenant_id,p_booking_id);
  v_email := private.booking_management_email_v1(p_tenant_id,p_booking_id);
  if v_email is null then
    raise exception using errcode='42501',message='management_link_unavailable';
  end if;

  -- Two random UUIDs give a 64-character hex token with well over the 128 bits
  -- of entropy ADR-0004 decision 5 requires, from the built-in generator.
  v_token := pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-','')
    || pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-','');
  v_expires_at := private.management_token_expiry_v1(p_intent,v_booking.ends_at,v_now);
  if v_expires_at <= v_now then
    raise exception using errcode='42501',message='management_link_unavailable';
  end if;

  -- Superseding keeps one live link per intent, so an older forwarded email
  -- stops working the moment a newer one is sent.
  update app.management_tokens t
  set revoked_at=v_now, revoked_reason='superseded'
  where t.tenant_id=p_tenant_id and t.booking_id=p_booking_id and t.intent=p_intent
    and t.consumed_at is null and t.revoked_at is null;

  insert into app.management_tokens(
    tenant_id,booking_id,intent,token_hash,email_hash,expires_at,correlation_id)
  values (p_tenant_id,p_booking_id,p_intent,
    encode(pg_catalog.sha256(pg_catalog.convert_to(p_tenant_id::text||':'||v_token,'UTF8')),'hex'),
    encode(pg_catalog.sha256(pg_catalog.convert_to(p_tenant_id::text||':'||lower(v_email),'UTF8')),'hex'),
    v_expires_at,coalesce(p_request_id,v_booking.correlation_id))
  returning id into v_token_id;

  insert into app.management_access_events(
    tenant_id,booking_id,token_id,intent,action,outcome,request_id)
  values (p_tenant_id,p_booking_id,v_token_id,p_intent,'issued','succeeded',
    coalesce(p_request_id,v_booking.correlation_id));
  raise log 'management_link_issued booking=% intent=% tenant=%',p_booking_id,p_intent,p_tenant_id;
  return query select v_token,v_expires_at;
end;
$$;

create or replace function private.mint_notification_manage_url_v1(
  p_message_id uuid, p_tenant_id uuid, p_booking_id uuid, p_template_key text, p_locale text)
returns text
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_booking app.bookings%rowtype;
  v_origin text;
  v_token text;
  v_expires_at timestamptz;
  v_token_id uuid;
  v_email text;
begin
  if p_booking_id is null or p_template_key not in ('booking.confirmed','booking.requested',
    'booking.rescheduled','booking.reminder','booking.proposal_created') then
    return null;
  end if;
  select * into v_booking from app.bookings b
  where b.tenant_id = p_tenant_id and b.id = p_booking_id;
  if v_booking.id is null or v_booking.status not in ('requested','confirmed','checked_in') then
    return null;
  end if;
  select 'https://'||d.hostname into v_origin from app.tenant_domains d
  join app.instances i on i.tenant_id=d.tenant_id and i.id=d.instance_id
  join app.tenants tenant on tenant.id=d.tenant_id
  where d.tenant_id = p_tenant_id and d.application = 'client' and d.kind = 'production'
    and d.active and d.verification_status = 'verified' and i.deployment_state='active'
    and tenant.status='active' order by d.hostname limit 1;
  perform private.lock_booking_management_contact_v1(p_tenant_id,p_booking_id);
  v_email := private.booking_management_email_v1(p_tenant_id,p_booking_id);
  if v_origin is null or v_email is null then
    return null;
  end if;
  v_expires_at := private.management_token_expiry_v1('view',v_booking.ends_at,v_now);
  if v_expires_at <= v_now then
    return null;
  end if;
  v_token := pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-','')
    || pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-','');

  update app.management_tokens t
  set revoked_at = v_now, revoked_reason = 'superseded'
  where t.tenant_id = p_tenant_id and t.booking_id = p_booking_id and t.intent = 'view'
    and t.consumed_at is null and t.revoked_at is null
    and t.message_id is distinct from p_message_id;
  insert into app.management_tokens(
    tenant_id,booking_id,intent,token_hash,email_hash,expires_at,correlation_id,message_id)
  values (p_tenant_id,p_booking_id,'view',
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_tenant_id::text||':'||v_token,'UTF8')),'hex'),
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_tenant_id::text||':'||lower(v_email),'UTF8')),'hex'),
    v_expires_at,v_booking.correlation_id,p_message_id)
  returning id into v_token_id;
  insert into app.management_access_events(
    tenant_id,booking_id,token_id,intent,action,outcome,request_id)
  values (p_tenant_id,p_booking_id,v_token_id,'view','issued','succeeded',v_booking.correlation_id);
  return v_origin||'/'||coalesce(p_locale,'en')||'/manage?token='||v_token;
exception when others then
  -- A link that cannot be minted is a message without a link, never a message
  -- that cannot be sent.
  return null;
end;
$$;

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
  perform private.lock_booking_management_contact_v1(v_tenant_id,v_source.booking_id);
  -- A correction may have committed while the contact lock was acquired.
  -- Re-read the bearer after that lock before deriving another credential.
  select * into v_source from app.management_tokens t where t.id=v_source.id for update;
  if v_source.revoked_at is not null or v_source.consumed_at is not null or v_source.expires_at<=v_now then
    insert into app.management_access_events(tenant_id,booking_id,token_id,intent,action,outcome,actor_hash,request_id)
    values(v_tenant_id,v_source.booking_id,v_source.id,p_intent,'denied','failed',v_actor_hash,v_request_id);
    return query select 1,'unavailable'::text,null::text,null::text,null::timestamptz;
    return;
  end if;
  v_email := private.booking_management_email_v1(v_tenant_id,v_source.booking_id);
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

create or replace function private.dispatch_notifications_v1(
  p_tenant_id uuid default null,
  p_limit integer default 100
)
returns table(dispatched integer, suppressed integer)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '10s'
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_dispatched integer := 0;
  v_suppressed integer := 0;
  v_row record;
  v_locale text;
  v_email text;
  v_starts_at timestamptz;
  v_recipient_hash text;
  v_version integer;
  v_variant text;
  v_email_on boolean;
  v_whatsapp_on boolean;
  v_phone text;
  v_phone_hash text;
  v_made boolean;
  v_email_suppressed boolean;
  v_next_lead integer;
begin
  if p_limit is null or p_limit not between 1 and 1000 then
    raise exception using errcode='22023',message='notification_invalid_batch';
  end if;
  for v_row in
    select o.* from app.outbox_events o
    where o.state='pending' and o.available_at<=v_now
      and (p_tenant_id is null or o.tenant_id=p_tenant_id)
    order by o.available_at
    limit p_limit
    for update skip locked
  loop
    v_email := null; v_locale := null; v_starts_at := null;
    select private.booking_management_email_v1(b.tenant_id,b.id), coalesce(b.locale,'en'), b.starts_at
    into v_email, v_locale, v_starts_at
    from app.bookings b
    join app.booking_contacts c on c.tenant_id=b.tenant_id and c.booking_id=b.id
    where b.tenant_id=v_row.tenant_id and b.id=v_row.booking_id;
    if v_email is null then
      -- Nothing to address. The intent is closed rather than retried forever.
      update app.outbox_events e set state='failed', updated_at=v_now where e.id=v_row.id;
      continue;
    end if;
    v_recipient_hash := encode(pg_catalog.sha256(
      pg_catalog.convert_to(v_row.tenant_id::text||':'||v_email,'UTF8')),'hex');
    v_version := null;
    select t.version into v_version from app.notification_templates t
    where t.key=v_row.topic and t.locale=v_locale and t.retired_at is null;
    if v_version is null then
      update app.outbox_events e set state='failed', updated_at=v_now where e.id=v_row.id;
      continue;
    end if;

    -- One reminder intent can carry several lead times; each lead time is its
    -- own message for the same recipient.
    v_variant := case when v_row.topic='booking.reminder'
      then coalesce(v_row.payload->>'lead_minutes','') else '' end;
    v_email_on := private.notification_channel_enabled_v1(v_row.tenant_id,v_row.topic,'email');
    v_phone := null;
    v_whatsapp_on := false;
    if (select s.available from private.whatsapp_state_v1(v_row.tenant_id) s)
       and private.notification_channel_enabled_v1(v_row.tenant_id,v_row.topic,'whatsapp')
       and exists (select 1 from app.whatsapp_configs w
         where w.tenant_id=v_row.tenant_id and w.template_map ? v_row.topic) then
      select c.phone_e164 into v_phone from app.booking_whatsapp_consents c
      where c.tenant_id=v_row.tenant_id and c.booking_id=v_row.booking_id;
      v_whatsapp_on := v_phone is not null;
    end if;
    v_made := false;
    v_email_suppressed := false;

    if v_email_on then
      if exists (select 1 from app.notification_suppressions s
        where s.tenant_id=v_row.tenant_id and s.recipient_hash=v_recipient_hash) then
        -- A suppressed address is a recorded outcome, not a silent drop.
        insert into app.notification_messages(
          tenant_id,booking_id,outbox_event_id,template_key,template_locale,template_version,
          booking_revision,recipient_hash,status,correlation_id,channel,variant)
        values (v_row.tenant_id,v_row.booking_id,v_row.id,v_row.topic,v_locale,v_version,
          v_row.booking_revision,v_recipient_hash,'suppressed',v_row.correlation_id,'email',v_variant)
        on conflict do nothing;
        v_email_suppressed := true;
      else
        -- The durable key is the message's own unique tuple, so a duplicate
        -- dispatch of the same intent creates nothing.
        insert into app.notification_messages(
          tenant_id,booking_id,outbox_event_id,template_key,template_locale,template_version,
          booking_revision,recipient_hash,correlation_id,channel,variant)
        values (v_row.tenant_id,v_row.booking_id,v_row.id,v_row.topic,v_locale,v_version,
          v_row.booking_revision,v_recipient_hash,v_row.correlation_id,'email',v_variant)
        on conflict do nothing;
        v_made := true;
      end if;
    end if;

    if v_whatsapp_on then
      -- A separate row on the same intent key plus the channel. Email for the
      -- same event is untouched: WhatsApp is additive, never a substitute.
      v_phone_hash := encode(pg_catalog.sha256(pg_catalog.convert_to(
        v_row.tenant_id::text||':whatsapp:'||v_phone,'UTF8')),'hex');
      insert into app.notification_messages(
        tenant_id,booking_id,outbox_event_id,template_key,template_locale,template_version,
        booking_revision,recipient_hash,status,correlation_id,channel,variant,provider)
      values (v_row.tenant_id,v_row.booking_id,v_row.id,v_row.topic,v_locale,v_version,
        v_row.booking_revision,v_phone_hash,
        case when exists (select 1 from app.notification_suppressions s
          where s.tenant_id=v_row.tenant_id and s.recipient_hash=v_phone_hash)
          then 'suppressed' else 'queued' end,
        v_row.correlation_id,'whatsapp',v_variant,'meta_whatsapp')
      on conflict do nothing;
      v_made := true;
    end if;

    -- The next lead time of a reminder re-arms the same intent rather than
    -- adding a second one, so a reschedule still supersedes exactly one row.
    v_next_lead := null;
    if v_row.topic='booking.reminder' and pg_catalog.jsonb_typeof(v_row.payload->'offsets')='array' then
      select max(x.o) into v_next_lead
      from (select (value #>> '{}')::integer o
            from pg_catalog.jsonb_array_elements(v_row.payload->'offsets')
            where pg_catalog.jsonb_typeof(value)='number') x
      where x.o < coalesce((v_row.payload->>'lead_minutes')::integer,0)
        and v_starts_at - pg_catalog.make_interval(mins=>x.o) > v_now;
    end if;

    if v_next_lead is not null then
      update app.outbox_events e set state='pending',
        available_at=v_starts_at - pg_catalog.make_interval(mins=>v_next_lead),
        payload=e.payload || jsonb_build_object('lead_minutes',v_next_lead),
        updated_at=v_now
      where e.id=v_row.id;
    elsif not v_email_on and not v_whatsapp_on then
      -- Switched off by the tenant: neither sent nor failed, and visibly so.
      update app.outbox_events e set state='skipped', updated_at=v_now where e.id=v_row.id;
    else
      update app.outbox_events e set state='delivered', updated_at=v_now where e.id=v_row.id;
    end if;

    if v_made then
      v_dispatched := v_dispatched + 1;
    elsif v_email_suppressed then
      v_suppressed := v_suppressed + 1;
    end if;
  end loop;
  return query select v_dispatched,v_suppressed;
end;
$$;

create or replace function private.claim_notification_batch_v1(
  p_limit integer default 20,
  p_visibility_seconds integer default 120
)
returns table(
  message_id uuid,
  tenant_id uuid,
  booking_id uuid,
  template_key text,
  template_locale text,
  template_version integer,
  booking_revision bigint,
  attempt integer,
  correlation_id uuid,
  payload jsonb,
  recipient_email text,
  is_test boolean,
  recipient_kind text
)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '10s'
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_message_ids uuid[];
begin
  if p_limit is null or p_limit not between 1 and 200
     or p_visibility_seconds is null or p_visibility_seconds not between 30 and 900 then
    raise exception using errcode='22023',message='notification_invalid_batch';
  end if;
  perform private.process_booking_recovery_v1(least(p_limit,20));
  -- Claim the candidate message rows first, then lock their canonical customer
  -- rows in a deterministic order. The payload mint and recipient read below
  -- begin AFTER these locks: they share current canonical state even when a
  -- correction committed while this worker was waiting for the customer.
  select coalesce(array_agg(candidate.id),'{}'::uuid[]) into v_message_ids from (
    select q.id from app.notification_messages q where q.channel='email'
      and q.status in ('queued','sending') and q.dead_lettered_at is null
      and q.next_attempt_at<=v_now and (q.locked_until is null or q.locked_until<=v_now)
    order by q.next_attempt_at,q.id limit p_limit for update skip locked) candidate;
  perform customer.id from app.customers customer join app.booking_contacts bc
    on bc.tenant_id=customer.tenant_id and bc.customer_id=customer.id
    join app.notification_messages q on q.tenant_id=bc.tenant_id and q.booking_id=bc.booking_id
    where q.id=any(v_message_ids) order by customer.id for share of customer;
  -- An address corrected/restricted after enqueue is never sent stale mail,
  -- especially an OTP or a recoverable bearer, to its historical snapshot.
  update app.notification_messages m set status='suppressed',locked_until=null,
    last_error_code='contact_unavailable',updated_at=v_now
  where m.id in (select q.id from app.notification_messages q
    where q.id=any(v_message_ids) and q.channel='email' and q.recipient_kind='customer'
      and q.status in ('queued','sending') and q.next_attempt_at<=v_now
      and (q.locked_until is null or q.locked_until<=v_now)
      and (private.booking_management_email_v1(q.tenant_id,q.booking_id) is null
        or q.recipient_hash is distinct from encode(sha256(convert_to(q.tenant_id::text||':'||
          private.booking_management_email_v1(q.tenant_id,q.booking_id),'UTF8')),'hex')
        or (q.variant like 'recovery:%' and not private.booking_recovery_is_eligible_v1(q.tenant_id,q.booking_id))
        or exists(select 1 from app.notification_suppressions s
          where s.tenant_id=q.tenant_id and s.recipient_hash=q.recipient_hash))
    order by q.next_attempt_at limit 200 for update skip locked);
  return query
  with claimed as (
    update app.notification_messages m
    set status='sending', attempts=m.attempts+1,
        locked_until=v_now+make_interval(secs=>p_visibility_seconds), updated_at=v_now
    where m.id in (
      select c.id from app.notification_messages c
      where c.id=any(v_message_ids) and c.channel='email'
        and c.status in ('queued','sending') and c.dead_lettered_at is null
        and c.next_attempt_at<=v_now
        and (c.locked_until is null or c.locked_until<=v_now)
      order by c.next_attempt_at
      limit p_limit
      for update skip locked)
    returning m.*
  )
  select c.id,c.tenant_id,c.booking_id,c.template_key,c.template_locale,c.template_version,
    c.booking_revision,c.attempts,c.correlation_id,
    private.notification_claim_payload_v1(row(c.*)::app.notification_messages,o.payload),
    case when c.recipient_kind = 'staff' then au.email
      else private.booking_management_email_v1(c.tenant_id,c.booking_id) end,
    c.is_test,c.recipient_kind
  from claimed c
  left join app.outbox_events o on o.id=c.outbox_event_id
  left join app.booking_contacts ct
    on ct.tenant_id=c.tenant_id and ct.booking_id=c.booking_id
  left join app.memberships mem
    on mem.tenant_id=c.tenant_id and mem.id=c.recipient_membership_id
  left join auth.users au on au.id=mem.auth_user_id;
end;
$$;
