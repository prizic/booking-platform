import { execFileSync } from "node:child_process";
import { readLocalSupabaseEnvironment } from "../../scripts/live-booking-e2e.mjs";

// Test-harness-only fixture control for the live guest-management journey in
// booking.spec.ts. It issues a production-style `view` link and mints the
// step-up code through the existing worker boundary
// (`private.mint_management_otp_code_v1`), standing in for the notification
// worker that would deliver the email in production. The browser and the two
// Next apps never receive database credentials: only this harness process
// reads the local `supabase status` output, and the issued token/code stay in
// test memory — they are never logged, screenshotted, or written to disk.

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const hexTokenPattern = /^[a-f0-9]{64}$/;
const otpCodePattern = /^[0-9]{6}$/;

// Third tenant seeded by tests/e2e/fixtures/live-booking.sql, so Tenant A/B
// pgTAP counts and permissions cannot change under the live journey.
const liveTenantId = "e0000000-0000-0000-0000-000000000001";

function readLocalDatabaseUrl(): string {
  const { databaseUrl } = readLocalSupabaseEnvironment();
  const url = new URL(databaseUrl);
  if (
    url.protocol !== "postgresql:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.pathname !== "/postgres"
  )
    throw new Error("Guest-management fixtures require the local database.");
  return databaseUrl;
}

function runFixtureQuery(query: string, variables: Record<string, string>): string {
  try {
    const output = execFileSync(
      "psql",
      [
        readLocalDatabaseUrl(),
        "--no-psqlrc",
        "--quiet",
        "--tuples-only",
        "--no-align",
        "--set=ON_ERROR_STOP=1",
        ...Object.entries(variables).map(([key, value]) => `--set=${key}=${value}`),
        "--file",
        "-",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        input: query,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    return output.trim();
  } catch {
    // Child-process errors include command arguments and output; never let
    // connection credentials, tokens or OTPs reach Playwright diagnostics.
    throw new Error("The local guest-management fixture could not be prepared.");
  }
}

function checkedBookingId(bookingId: string): void {
  if (!uuidPattern.test(bookingId)) {
    throw new Error("A live manage fixture booking id must be a UUID.");
  }
}

/**
 * Mint the emailed `view` link for a live booking through the production
 * issuer, exactly as the notification producer would. Returns the plaintext
 * link token for in-memory browser navigation only.
 */
export function issueLiveViewToken(bookingId: string): string {
  checkedBookingId(bookingId);
  const token = runFixtureQuery(
    `select i.token from private.issue_management_token_v1('${liveTenantId}'::uuid, :'booking_id'::uuid, 'view') i;`,
    { booking_id: bookingId },
  );
  if (!hexTokenPattern.test(token)) {
    throw new Error("The live manage fixture did not return a link token.");
  }
  return token;
}

/**
 * Mint the step-up code for the newest pending challenge on the booking's
 * action link, as the notification worker does at send time. Call only after
 * the browser exchanged the view link, so the challenge exists.
 */
export function mintLiveOtpCode(
  bookingId: string,
  intent: "cancel" | "reschedule",
): string {
  checkedBookingId(bookingId);
  const code = runFixtureQuery(
    `select m.code from private.mint_management_otp_code_v1((
       select o.id from app.management_otps o
       join app.management_tokens t on t.id = o.token_id
       where t.tenant_id = '${liveTenantId}'::uuid
         and t.booking_id = :'booking_id'::uuid
         and t.intent = :'manage_intent'
         and o.verified_at is null
       order by o.created_at desc limit 1
     )) m;`,
    { booking_id: bookingId, manage_intent: intent },
  );
  if (!otpCodePattern.test(code)) {
    throw new Error("The live manage fixture did not return a step-up code.");
  }
  return code;
}
