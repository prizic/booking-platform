import assert from "node:assert/strict";
import test from "node:test";

import {
  createLiveBookingEnvironment,
  expireLiveBookingHold,
  parseSupabaseStatusEnvironment,
} from "./live-booking-e2e.mjs";

test("reads only the local browser runtime values without echoing them", () => {
  const parsed = parseSupabaseStatusEnvironment(
    [
      "API_URL=http://127.0.0.1:54321",
      "PUBLISHABLE_KEY=local-publishable-key",
      "DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      "SERVICE_ROLE_KEY=must-not-be-returned",
    ].join("\n"),
  );

  assert.deepEqual(parsed, {
    apiUrl: "http://127.0.0.1:54321",
    databaseUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    publishableKey: "local-publishable-key",
  });
});

test("fails closed when the local Supabase output is incomplete", () => {
  assert.throws(
    () =>
      parseSupabaseStatusEnvironment(
        [
          "API_URL=http://127.0.0.1:54321",
          'DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"',
        ].join("\n"),
      ),
    /PUBLISHABLE_KEY/u,
  );
});

test("constructs a Client or Dashboard environment from parsed local values", () => {
  const environment = createLiveBookingEnvironment(
    {
      apiUrl: "http://127.0.0.1:54321",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      publishableKey: "local-publishable-key",
    },
    "client.live-booking.example.invalid",
  );

  assert.deepEqual(environment, {
    LOCAL_TENANT_HOST: "client.live-booking.example.invalid",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-publishable-key",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    WLBP_RUNTIME_ENV: "test",
  });
  assert.equal("SUPABASE_DB_URL" in environment, false);
});

test("rejects non-UUID fixture control input before reading local Supabase", () => {
  assert.throws(() => expireLiveBookingHold("not-a-hold"), /must be a UUID/u);
});
