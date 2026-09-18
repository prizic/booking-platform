import assert from "node:assert/strict";
import test from "node:test";

import {
  createLiveBookingApplicationEnvironment,
  createLiveBookingEnvironment,
  createLiveBookingRunnerEnvironment,
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

test("keeps the Playwright runner separate from app runtime credentials", () => {
  const environment = createLiveBookingRunnerEnvironment(
    "/private/tmp/wlbp-live-booking/credentials.json",
  );

  assert.deepEqual(environment, {
    LIVE_BOOKING_CREDENTIAL_FILE: "/private/tmp/wlbp-live-booking/credentials.json",
    LIVE_BOOKING_E2E: "1",
  });
  assert.equal("NEXT_PUBLIC_SUPABASE_URL" in environment, false);
  assert.equal("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" in environment, false);
  assert.equal("LIVE_BOOKING_DASHBOARD_PASSWORD" in environment, false);
});

test("strips live-runner variables before starting an app server", () => {
  const environment = createLiveBookingApplicationEnvironment(
    {
      KEEP_ME: "yes",
      LIVE_BOOKING_CREDENTIAL_FILE: "/private/tmp/wlbp-live-booking/credentials.json",
      LIVE_BOOKING_DASHBOARD_PASSWORD: "temporary-password",
      LIVE_BOOKING_E2E: "1",
    },
    {
      apiUrl: "http://127.0.0.1:54321",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      publishableKey: "local-publishable-key",
    },
    "dashboard.live-booking.example.invalid",
  );

  assert.deepEqual(environment, {
    KEEP_ME: "yes",
    LOCAL_TENANT_HOST: "dashboard.live-booking.example.invalid",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-publishable-key",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    WLBP_RUNTIME_ENV: "test",
  });
});

test("rejects non-UUID fixture control input before reading local Supabase", () => {
  assert.throws(() => expireLiveBookingHold("not-a-hold"), /must be a UUID/u);
});
