import { spawnSync } from "node:child_process";

// Issue #94. The live journey needs to see and disturb committed state: the
// point of the gate is that the Client reaches the real database, so the
// assertions have to read the real database too.
//
// psql rather than a Supabase client, for the same reason the concurrency gate
// uses it: these statements are deliberately outside every RLS path, which is
// exactly what makes them useful for setting up a race and cleaning up after a
// booking that the product itself can never delete.
const databaseUrl =
  process.env.SUPABASE_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export const fixtureTenantId = "a0000000-0000-0000-0000-000000000001";
export const fixtureServiceId = "a7200000-0000-0000-0000-000000000001";
/** Location A two: bookable, America/Chicago, and nobody else's fixture. */
export const fixtureLocationId = "a5000000-0000-0000-0000-000000000002";
export const otherTenantServiceId = "b7200000-0000-0000-0000-000000000001";

export function sql(statement: string): string {
  const finished = spawnSync(
    "psql",
    [databaseUrl, "-qtAX", "-v", "ON_ERROR_STOP=1", "-c", statement],
    { encoding: "utf8" },
  );
  if (finished.status !== 0) {
    // The statement is safe to print; the connection string is not, and psql
    // keeps it out of stderr.
    throw new Error(`live fixture statement failed: ${finished.stderr.trim()}`);
  }
  return finished.stdout.trim();
}

/**
 * The bookable Monday, derived the same way every pgTAP suite derives its own:
 * two weeks out, so notice and horizon hold whatever day the gate runs on.
 */
export const bookableDate = (): string =>
  sql(
    `select (date_trunc('week',statement_timestamp() at time zone 'America/Chicago')::date+14)::text;`,
  );

/**
 * A committed booking cannot be deleted by the product (invariant 5), which is
 * right in production and wrong for a gate that must leave no trace. Replica
 * mode is the local-only escape hatch, held for these statements alone.
 */
export function cleanupJourneyState(): void {
  sql(`
    set local session_replication_role = 'replica';
    delete from app.booking_events where tenant_id='${fixtureTenantId}';
    delete from app.booking_notes where tenant_id='${fixtureTenantId}';
    delete from app.booking_contacts where tenant_id='${fixtureTenantId}';
    delete from app.booking_intake_answers where tenant_id='${fixtureTenantId}';
    delete from app.outbox_events where tenant_id='${fixtureTenantId}';
    delete from app.notification_messages where tenant_id='${fixtureTenantId}';
    delete from app.bookings where tenant_id='${fixtureTenantId}';
    delete from app.booking_contacts where tenant_id='${fixtureTenantId}';
    delete from app.customers where tenant_id='${fixtureTenantId}';
    set local session_replication_role = 'origin';

    delete from app.assignment_allocations where tenant_id='${fixtureTenantId}';
    delete from app.booking_holds where tenant_id='${fixtureTenantId}';
    delete from app.booking_drafts where tenant_id='${fixtureTenantId}';
    delete from app.idempotency_keys where tenant_id='${fixtureTenantId}';
  `);
}

export const bookingCount = (): number =>
  Number(
    sql(`select count(*) from app.bookings where tenant_id='${fixtureTenantId}';`),
  );
