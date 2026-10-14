-- Existing get_booking_detail_v1 supplies authorized contact/history, but has
-- only a has_intake flag. This additive projection returns the immutable intake
-- snapshot and a bounded related-booking history under the caller's own RLS.
create or replace function api_v1.get_booking_context_v1(p_tenant_id uuid,p_booking_id uuid)
returns jsonb language sql stable security invoker set search_path = '' set statement_timeout = '5s' as $$
  select jsonb_build_object('contractVersion',1,'bookingId',b.id,
    'contactAccess',case when bc.booking_id is null then 'restricted' else 'allowed' end,
    'intake',case when bc.booking_id is null then jsonb_build_object('access','restricted')
      else jsonb_build_object('access','allowed','schema',b.intake_schema_snapshot,
        'answers',coalesce((select ia.answers from app.booking_intake_answers ia
          where ia.tenant_id=b.tenant_id and ia.booking_id=b.id),'{}'::jsonb)) end,
    'request',jsonb_build_object('approvalStatus',b.approval_status,'approvalDeadline',b.approval_deadline,
      'publicReason',b.decision_reason_public,'submittedAt',b.created_at),
    'customer',case when c.id is null then jsonb_build_object('access','restricted')
      else jsonb_build_object('access','allowed','customerId',c.id,
        'state',case when c.erased_at is not null then 'erased' when c.restricted_at is not null then 'restricted' else 'active' end,
        'history',coalesce((select jsonb_agg(to_jsonb(h) order by h."startAt" desc,h."bookingId") from (
          select hb.id as "bookingId",hb.public_reference as "publicReference",hb.service_name as "serviceName",
            hb.status,hb.starts_at as "startAt",hb.ends_at as "endAt"
          from app.booking_contacts hc join app.bookings hb on hb.tenant_id=hc.tenant_id and hb.id=hc.booking_id
          where hc.tenant_id=c.tenant_id and hc.customer_id=c.id and hb.id<>b.id
          order by hb.starts_at desc,hb.id limit 20) h),'[]'::jsonb)) end)
  from app.bookings b left join app.booking_contacts bc on bc.tenant_id=b.tenant_id and bc.booking_id=b.id
  left join app.customers c on c.tenant_id=bc.tenant_id and c.id=bc.customer_id
  where b.tenant_id=p_tenant_id and b.id=p_booking_id;
$$;
revoke all on function api_v1.get_booking_context_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function api_v1.get_booking_context_v1(uuid,uuid) to authenticated;
