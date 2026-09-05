begin;

select plan(10);

select throws_like(
  $$insert into app.instances (id, tenant_id, brand_id, published_brand_revision_id)
    values ('b4200000-0000-0000-0000-000000000010', 'b0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', null)$$,
  '%violates foreign key constraint%',
  'an instance cannot reference another tenant brand'
);
select throws_like(
  $$insert into app.instances (id, tenant_id, brand_id, published_brand_revision_id)
    values ('a4200000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'b4100000-0000-0000-0000-000000000001')$$,
  '%violates foreign key constraint%',
  'an instance cannot publish another tenant brand revision'
);
select throws_like(
  $$insert into app.memberships (id, tenant_id, auth_user_id, role_id)
    values ('b3000000-0000-0000-0000-000000000010', 'b0000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001')$$,
  '%violates foreign key constraint%',
  'a membership cannot reference another tenant role'
);
select throws_like(
  $$insert into app.membership_location_scopes (tenant_id, membership_id, location_id)
    values ('a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000001')$$,
  '%violates foreign key constraint%',
  'a membership scope cannot reference another tenant location'
);
select throws_like(
  $$insert into app.invitations (id, tenant_id, role_id, invited_by_membership_id, invitee_email, token_hash, expires_at)
    values ('a6000000-0000-0000-0000-000000000020', 'a0000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000002', 'fk@example.invalid', repeat('f', 64), '2027-09-05 00:00:00+00')$$,
  '%violates foreign key constraint%',
  'an invitation cannot reference another tenant role'
);
select throws_like(
  $$insert into app.invitation_location_scopes (tenant_id, invitation_id, location_id)
    values ('a0000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000001')$$,
  '%violates foreign key constraint%',
  'an invitation scope cannot reference another tenant location'
);
select throws_like(
  $$insert into app.tenant_domains (id, tenant_id, instance_id, hostname, application, kind, verification_status, verified_at, active)
    values ('a4300000-0000-0000-0000-000000000020', 'a0000000-0000-0000-0000-000000000001', 'a4200000-0000-0000-0000-000000000001', 'Upper.Example.Invalid', 'client', 'production', 'verified', now(), true)$$,
  '%violates check constraint%',
  'stored hostnames must already be canonical lowercase values'
);
select throws_like(
  $$insert into app.tenant_domains (id, tenant_id, instance_id, hostname, application, kind, verification_status, active)
    values ('a4300000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000001', 'a4200000-0000-0000-0000-000000000001', 'unverified.example.invalid', 'client', 'production', 'pending', true)$$,
  '%violates check constraint%',
  'an active domain must be verified with a timestamp'
);
select throws_like(
  $$insert into app.tenant_domains (id, tenant_id, instance_id, hostname, application, kind, verification_status, verified_at, active)
    values ('a4300000-0000-0000-0000-000000000022', 'a0000000-0000-0000-0000-000000000001', 'a4200000-0000-0000-0000-000000000001', 'another-a.example.invalid', 'client', 'production', 'verified', now(), true)$$,
  '%duplicate key value violates unique constraint%',
  'only one active domain can serve an instance surface and kind'
);
select lives_ok(
  $$select private.current_auth_user_id()$$,
  'the hardened auth subject helper remains callable by its owner without claims'
);

select * from finish();
rollback;
