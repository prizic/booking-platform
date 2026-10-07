-- Invoker projection inherits both message and booking row policies. No
-- recipient, body, subject, provider payload, or suppression hash is returned.
create or replace function api_v1.list_communication_queue_v1(p_tenant_id uuid,p_status text default null,p_limit integer default 100)
returns table(message_id uuid,booking_id uuid,public_reference text,service_name text,status text,created_at timestamptz)
language sql stable security invoker set search_path='' as $$
 select m.id,b.id,b.public_reference,b.service_name,m.status,m.created_at from app.notification_messages m join app.bookings b on b.tenant_id=m.tenant_id and b.id=m.booking_id where m.tenant_id=p_tenant_id and (p_status is null or m.status=p_status) order by m.created_at desc,m.id desc limit least(greatest(coalesce(p_limit,100),1),200);
$$;
revoke all on function api_v1.list_communication_queue_v1(uuid,text,integer) from public,anon;
grant execute on function api_v1.list_communication_queue_v1(uuid,text,integer) to authenticated;
