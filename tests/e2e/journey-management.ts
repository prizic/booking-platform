import { execFileSync } from "node:child_process";
import { completionTenant } from "./dashboard-completion-fixtures";
import { readLocalSupabaseEnvironment } from "../../scripts/live-booking-e2e.mjs";

function sql(input: string): string {
  const local = readLocalSupabaseEnvironment();
  const url = new URL(local.databaseUrl);
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    !["55322", "57722", "57822", "57922"].includes(url.port) ||
    !process.env.WLBP_SUPABASE_WORKDIR?.includes("/.artifacts/")
  )
    throw new Error("Management fixture requires isolated local campaign");
  try {
    return execFileSync(
      "psql",
      [
        local.databaseUrl,
        "--no-psqlrc",
        "-qtAX",
        "--set=ON_ERROR_STOP=1",
        "--file",
        "-",
      ],
      { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 30000 },
    ).trim();
  } catch {
    throw new Error("Local synthetic management fixture unavailable");
  }
}
export function deliverJourneyMail() {
  try {
    execFileSync(process.execPath, ["scripts/deliver-journey-mail.mjs"], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120000,
    });
  } catch {
    throw new Error(
      "Production notification owner could not deliver the local synthetic mailbox batch",
    );
  }
}
export function issueJourneyToken(
  booking: string,
  intent: "view" | "cancel" | "reschedule",
) {
  if (!/^d9510000-0000-0000-0000-00000000013[6-9]$/u.test(booking))
    throw new Error("Reserved synthetic booking required");
  const token = sql(
    `select token from private.issue_management_token_v1('${completionTenant}','${booking}','${intent}');`,
  );
  if (!/^[a-f0-9]{64}$/u.test(token))
    throw new Error("Synthetic management token unavailable");
  return token;
}
export function expireJourneyToken(token: string) {
  if (!/^[a-f0-9]{64}$/u.test(token)) throw new Error("Synthetic token required");
  sql(
    `update app.management_tokens set expires_at=statement_timestamp()-interval '1 second' where tenant_id='${completionTenant}' and token_hash=encode(sha256(convert_to('${token}','UTF8')),'hex');`,
  );
}

export function setJourneyMembershipRevoked(revoked: boolean) {
  sql(
    `update app.memberships set status='${revoked ? "revoked" : "active"}',revoked_at=${revoked ? "statement_timestamp()" : "null"},revision=revision+1 where id='d3000000-0000-0000-0000-000000000136' and auth_user_id='d1010000-0000-0000-0000-000000000136' and tenant_id='${completionTenant}';`,
  );
}
