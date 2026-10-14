-- Additive ordering fix for the customer directory read already deployed by
-- 20260915120000_customer_records_and_privacy.sql. That historical migration is
-- intentionally left with its original `order by c.created_at desc`; this
-- migration makes pagination deterministic by adding the stable id tie-breaker
-- without changing any signature, columns, auth, search path, filters, or limits.
create or replace function api_v1.search_customers_v1(
  p_tenant_id uuid,
  p_query text default null,
  p_include_erased boolean default false,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  customer_id uuid,
  full_name text,
  email text,
  phone text,
  preferred_locale text,
  tags text[],
  restricted boolean,
  erased boolean,
  legal_hold boolean,
  suppressed boolean,
  booking_count bigint,
  last_booking_at timestamptz,
  revision bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id,
    c.full_name,
    c.email,
    c.phone,
    c.preferred_locale,
    c.tags,
    c.restricted_at is not null,
    c.erased_at is not null,
    (select private.has_legal_hold_v1(c.tenant_id,c.id)),
    (select private.is_communication_suppressed_v1(c.tenant_id,c.id)),
    (select pg_catalog.count(*) from app.booking_contacts bc
      where bc.tenant_id = c.tenant_id and bc.customer_id = c.id),
    (select pg_catalog.max(b.starts_at) from app.booking_contacts bc
      join app.bookings b on b.tenant_id = bc.tenant_id and b.id = bc.booking_id
      where bc.tenant_id = c.tenant_id and bc.customer_id = c.id),
    c.revision
  from app.customers c
  where c.tenant_id = p_tenant_id
    and (p_include_erased or c.erased_at is null)
    and (
      coalesce(btrim(p_query),'') = ''
      or c.full_name ilike '%'||btrim(p_query)||'%'
      or c.email ilike '%'||btrim(p_query)||'%'
      or c.phone ilike '%'||btrim(p_query)||'%')
  order by c.created_at desc, c.id asc
  limit least(greatest(coalesce(p_limit,25),1),100)
  offset greatest(coalesce(p_offset,0),0);
$$;

revoke all on function
  api_v1.search_customers_v1(uuid,text,boolean,integer,integer)
from public, anon;

grant execute on function
  api_v1.search_customers_v1(uuid,text,boolean,integer,integer)
to authenticated;
