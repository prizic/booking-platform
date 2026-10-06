-- Operator/worker wrappers use definer rights for schema reachability and
-- authorize the original verified caller inside their owner functions.
-- Application roles have no reason to execute control_plane routines directly.
revoke all on all functions in schema control_plane from public,anon,authenticated;
grant execute on function control_plane.contains_no_secret_v1(jsonb) to service_role;
