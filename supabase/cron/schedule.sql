-- Issue #101. The platform's scheduled jobs.
--
-- Applied by the private release pipeline against a hosted project, not by
-- `supabase db reset`. That is deliberate rather than lazy: pg_cron's launcher
-- runs jobs in a separate session against committed state, so scheduling these
-- in a migration would have background work mutating rows underneath every
-- local gate — the concurrency gate in particular, which asserts on committed
-- outcomes. A schedule is environment configuration; `cron.job` is a table, not
-- a schema.
--
-- Safe to run repeatedly: every job is unscheduled by name before it is
-- scheduled, and every job it schedules is itself idempotent.
--
-- No secret appears in this file. The two values the Edge calls need are read
-- from Vault by name, and if an operator has not put them there yet the helper
-- does nothing rather than failing every minute.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Calling one of our own Edge Functions from the database. The URL and the key
-- live in Vault because they are configuration and a credential respectively,
-- and neither belongs in a file that is committed to Git.
create or replace function private.invoke_edge_function_v1(p_function text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets s
  where s.name = 'edge_functions_url';
  select decrypted_secret into v_key from vault.decrypted_secrets s
  where s.name = 'edge_service_role_key';
  -- Nothing configured yet is a quiet no-op, not a job that fails every minute
  -- and buries the failure that matters.
  if coalesce(v_url,'') = '' or coalesce(v_key,'') = '' then
    return;
  end if;

  perform net.http_post(
    url => v_url || '/' || p_function,
    headers => jsonb_build_object(
      'Authorization','Bearer ' || v_key,
      'Content-Type','application/json'),
    body => '{}'::jsonb,
    timeout_milliseconds => 20000);
end;
$function$;

revoke all on function private.invoke_edge_function_v1(text)
from public, anon, authenticated;

do $schedule$
declare
  v_job record;
begin
  for v_job in
    select * from (values
      -- Expiry is pure SQL and runs in the database, so it needs no Edge
      -- function, no credential and no network.
      ('wlbp-expire-holds',            '* * * * *',   $$select private.expire_holds_v1(null,500)$$),
      ('wlbp-expire-booking-requests', '* * * * *',   $$select private.expire_booking_requests_v1(null,500)$$),
      ('wlbp-expire-management-links', '*/5 * * * *', $$select private.expire_management_links_v1(null,500)$$),
      -- Sending mail needs a provider key, which must not live in Postgres, so
      -- these two go out through the Edge Function that holds it.
      ('wlbp-notification-worker',     '* * * * *',   $$select private.invoke_edge_function_v1('notification-worker')$$),
      ('wlbp-reminder-scheduler',      '*/5 * * * *', $$select private.invoke_edge_function_v1('reminder-scheduler')$$)
    ) as j(name,cadence,command)
  loop
    perform cron.unschedule(v_job.name)
    where exists (select 1 from cron.job c where c.jobname = v_job.name);
    perform cron.schedule(v_job.name,v_job.cadence,v_job.command);
  end loop;
end;
$schedule$;
