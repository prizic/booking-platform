-- Run as the owner of realtime.messages (or the infrastructure administrator).
-- Hosted migration roles may not own this platform-managed table. Keep this
-- explicit provisioning step separate from application migrations; it grants
-- no client write permission and does not change table ownership.
begin;
alter table realtime.messages enable row level security;
drop policy if exists tenant_workspace_broadcast_read on realtime.messages;
create policy tenant_workspace_broadcast_read on realtime.messages
for select to authenticated
using (
  extension = 'broadcast'
  and topic = realtime.topic()
  and exists (
    select 1 from app.tenants t
    where realtime.topic() = 'tenant:' || t.id::text
      and (select private.is_active_tenant_member(t.id))
  )
);
commit;
