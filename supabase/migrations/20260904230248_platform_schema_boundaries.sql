-- Establish the platform's schema trust boundaries without introducing any
-- domain tables. Tenant, membership, and RLS policy schema belongs to issue #6.

create schema api_v1 authorization postgres;
create schema app authorization postgres;
create schema private authorization postgres;

comment on schema api_v1 is
  'Explicitly granted, versioned views and RPCs exposed through the Data API.';
comment on schema app is
  'Unexposed normalized application tables; tenant-owned tables require RLS.';
comment on schema private is
  'Unexposed helpers, audit internals, provider metadata, and worker state.';

revoke all on schema api_v1 from public;
revoke all on schema app from public;
revoke all on schema private from public;

grant usage on schema api_v1 to anon, authenticated, service_role;

-- A new API object is unreachable until the migration that creates it grants
-- exactly the intended operation. PostgreSQL otherwise grants function execute
-- to PUBLIC by default.
alter default privileges for role postgres in schema api_v1
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema api_v1
  revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema api_v1
  revoke execute on functions from public, anon, authenticated;

alter default privileges for role postgres in schema app
  revoke execute on functions from public;
alter default privileges for role postgres in schema private
  revoke execute on functions from public;
