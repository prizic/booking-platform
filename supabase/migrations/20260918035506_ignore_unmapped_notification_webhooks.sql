-- A shared provider account may legitimately send mail that is not a booking
-- notification (for example Auth mail). A verified event for such mail must
-- be acknowledged without inventing a tenant-owned ledger row or retrying it
-- forever. This is a forward repair of issue #19's callback function.
create or replace function private.record_notification_event_v1(
  p_provider text,
  p_provider_event_id text,
  p_event_type text,
  p_occurred_at timestamptz,
  p_provider_message_reference text
)
returns table(applied boolean, message_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_now timestamptz := statement_timestamp();
  v_message app.notification_messages%rowtype;
  v_latest timestamptz;
  v_applied boolean := false;
  v_status text;
begin
  if p_event_type is null or p_event_type not in
     ('delivered','delayed','bounced','complained','failed','suppressed','opened','clicked')
     or p_provider_event_id is null or p_occurred_at is null then
    raise exception using errcode='22023',message='notification_invalid_event';
  end if;
  select * into v_message from app.notification_messages m
  where m.provider=coalesce(p_provider,'resend')
    and m.provider_message_reference=p_provider_message_reference
  for update;

  if v_message.id is null then
    return query select false,null::uuid;
    return;
  end if;

  insert into app.notification_provider_events(
    tenant_id,message_id,provider,provider_event_id,event_type,occurred_at)
  values (v_message.tenant_id,v_message.id,coalesce(p_provider,'resend'),
    p_provider_event_id,p_event_type,p_occurred_at)
  on conflict (provider,provider_event_id) do nothing;
  if not found then
    return query select false,v_message.id;
    return;
  end if;

  select max(e.occurred_at) into v_latest from app.notification_provider_events e
  where e.message_id=v_message.id and e.applied and e.occurred_at > p_occurred_at;
  if v_latest is not null then
    return query select false,v_message.id;
    return;
  end if;

  v_status := case p_event_type
    when 'delivered' then 'delivered'
    when 'delayed' then 'sent'
    when 'bounced' then 'bounced'
    when 'complained' then 'complained'
    when 'failed' then 'failed'
    when 'suppressed' then 'suppressed'
    else v_message.status end;
  if v_status is distinct from v_message.status then
    update app.notification_messages m set status=v_status, updated_at=v_now
    where m.id=v_message.id;
    v_applied := true;
  end if;
  update app.notification_provider_events e set applied=v_applied
  where e.provider=coalesce(p_provider,'resend') and e.provider_event_id=p_provider_event_id;

  if p_event_type in ('bounced','complained') then
    insert into app.notification_suppressions(tenant_id,recipient_hash,reason)
    values (v_message.tenant_id,v_message.recipient_hash,
      case when p_event_type='bounced' then 'hard_bounce' else 'complaint' end)
    on conflict (tenant_id,recipient_hash) do nothing;
    raise log 'notification_suppressed tenant=% reason=%',v_message.tenant_id,p_event_type;
  end if;
  return query select v_applied,v_message.id;
end;
$function$;

revoke all on function private.record_notification_event_v1(text,text,text,timestamptz,text)
from public,anon,authenticated;
