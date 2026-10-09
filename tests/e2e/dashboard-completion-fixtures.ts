import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { readLocalSupabaseEnvironment } from "../../scripts/live-booking-e2e.mjs";
import { dbPort, portPrefix } from "../../scripts/platform-admin-local.mjs";
export const completionOrigin = "http://localhost:41731";
export const completionTenant = "d0000000-0000-0000-0000-000000000001";
const completionPortPrefix = process.env.WLBP_CAMPAIGN?.trim() ? portPrefix : "553";
const completionDatabasePort = process.env.WLBP_CAMPAIGN?.trim() ? dbPort : "55322";
let isolatedEnvironment: ReturnType<typeof readLocalSupabaseEnvironment> | undefined;
function completionEnvironment() {
  // The campaign never resets its stack while a browser worker is running.
  const local = (isolatedEnvironment ??= readLocalSupabaseEnvironment());
  if (
    new URL(local.databaseUrl).port !== completionDatabasePort ||
    !["127.0.0.1", "localhost", "[::1]"].includes(
      new URL(local.databaseUrl).hostname,
    ) ||
    new URL(local.apiUrl).origin !== `http://127.0.0.1:${completionPortPrefix}21`
  )
    throw new Error("Dashboard evidence requires the isolated campaign");
  return local;
}
export type CompletionActor =
  | "admin"
  | "scheduler"
  | "staff"
  | "manager"
  | "revoked"
  | "foreign"
  | "realtime-scheduler";
export const completionActorEmail = (actor: CompletionActor) =>
  `completion-${actor}@example.invalid`;
export async function signInCompletion(
  page: Page,
  actor: CompletionActor = "admin",
  locale = "en",
  origin = completionOrigin,
) {
  const file = process.env.DASHBOARD_COMPLETION_CREDENTIAL_FILE;
  if (!file)
    throw new Error("Use the dashboard completion campaign credential fixture.");
  const { dashboardPassword } = JSON.parse(readFileSync(file, "utf8"));
  await page.goto(`${origin}/${locale}/auth/sign-in`);
  await page.locator('input[name="email"]').fill(completionActorEmail(actor));
  await page.locator('input[name="password"]').fill(dashboardPassword);
  await page
    .getByRole("button", {
      name: locale === "ar" ? "تسجيل الدخول" : "Sign in",
      exact: true,
    })
    .click();
  await page.waitForURL((url) => !url.pathname.endsWith("sign-in"), {
    timeout: 60_000,
  });
}
/** Infrastructure reads observe persisted facts; workflow mutations use the actor UI. */
export function completionSql(sql: string): string {
  if (
    !/^\s*(select|with)\b/iu.test(sql) ||
    /\b(insert|update|delete|drop|alter|truncate)\b/iu.test(sql)
  )
    throw new Error("Browser evidence SQL is read-only.");
  const local = completionEnvironment();
  try {
    return execFileSync(
      "psql",
      [
        local.databaseUrl,
        "--no-psqlrc",
        "-qtAX",
        "--set=ON_ERROR_STOP=1",
        "--command",
        sql,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
  } catch {
    throw new Error("Persisted browser evidence could not be read.");
  }
}
/** Run the production dispatch owner on the isolated fixture, without a provider.
 * This materializes real queued messages; it never records fake delivery. */
export function dispatchCompletionNotifications(failedBookingId: string) {
  const local = completionEnvironment();
  if (new URL(local.databaseUrl).port !== completionDatabasePort)
    throw new Error("Notification dispatch requires the isolated campaign");
  if (!/^[a-f0-9-]{36}$/u.test(failedBookingId))
    throw new Error("Synthetic notification booking must be a UUID");
  execFileSync(
    "psql",
    [
      local.databaseUrl,
      "--no-psqlrc",
      "-qtAX",
      "--set=ON_ERROR_STOP=1",
      "--command",
      // Inject a named synthetic failure through the production attempt recorder.
      // This prepares recovery evidence; it is never provider-delivery evidence.
      `select * from private.dispatch_notifications_v1('${completionTenant}',100);
       select private.record_notification_attempt_v1(m.id,1,'permanent_error',statement_timestamp(),null,'synthetic_acceptance_failure')
       from app.notification_messages m where m.tenant_id='${completionTenant}' and m.booking_id='${failedBookingId}' and m.status='queued';`,
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
}
/** Local Auth-mail evidence only; callback material stays in private memory. */
export async function completionRecoveryLink() {
  const local = completionEnvironment();
  if (new URL(local.databaseUrl).port !== completionDatabasePort)
    throw new Error("Isolated mailbox required");
  // Supabase's inbucket-named container runs Mailpit. Its documented message
  // view supports recipient filtering without exposing other test mail.
  const mailbox =
    `http://127.0.0.1:${completionPortPrefix}24/view/latest.txt?query=` +
    encodeURIComponent("to:completion-recovery@example.invalid");
  for (let attempt = 0; attempt < 40; attempt++) {
    const response = await fetch(mailbox);
    if (response.ok) {
      const body = await response.text();
      for (const match of body.matchAll(/https?:\/\/[^\s"'<>]+/gu)) {
        const candidate = match[0].replaceAll("&amp;", "&");
        const url = new URL(candidate);
        if (
          url.origin === new URL(local.apiUrl).origin &&
          url.pathname === "/auth/v1/verify" &&
          url.searchParams.get("type") === "recovery"
        )
          return candidate;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Local recovery mail was unavailable");
}
function totp(secret: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of secret.toUpperCase().replace(/=+$/u, "")) {
    const value = alphabet.indexOf(char);
    if (value < 0) throw new Error("Invalid authenticator fixture");
    bits += value.toString(2).padStart(5, "0");
  }
  const key = Buffer.from(
    Array.from({ length: Math.floor(bits.length / 8) }, (_, i) =>
      Number.parseInt(bits.slice(i * 8, i * 8 + 8), 2),
    ),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest.at(-1)! & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, "0");
}
export async function enrollCompletionMfa(page: Page) {
  await page.goto(`${completionOrigin}/en/auth/mfa`);
  const credentialFile = process.env.DASHBOARD_COMPLETION_CREDENTIAL_FILE!;
  const fixture = JSON.parse(readFileSync(credentialFile, "utf8"));
  let secret: string | undefined = fixture.authenticator?.secret;
  const verified = page
    .locator("form")
    .filter({ has: page.locator('input[name="code"]') })
    .locator('select[name="factorId"]');
  if (secret && (await verified.count())) {
    await verified.selectOption(fixture.authenticator.factorId);
  } else {
    // Clean up interrupted setup through the account UI before retrying.
    const unfinished = page.getByRole("button", { name: /^Cancel setup/u });
    while (await unfinished.count()) {
      await unfinished.first().click();
      await page.waitForTimeout(500);
    }
    await page.getByRole("button", { name: "Add authenticator", exact: true }).click();
    const section = page.getByRole("region", { name: /Scan the QR code/u });
    secret = (
      await section.locator('p[dir="ltr"]').textContent({ timeout: 60_000 })
    )?.trim();
    // The new factor must become the selected one before it can be verified.
    await expect(verified).not.toHaveValue("", { timeout: 15_000 });
    const factorId = await verified.inputValue();
    writeFileSync(
      credentialFile,
      JSON.stringify({ ...fixture, authenticator: { factorId, secret } }),
      { mode: 0o600 },
    );
  }
  if (!secret) throw new Error("Authenticator setup was unavailable");
  if (fixture.authenticator?.lastVerifiedStep === Math.floor(Date.now() / 30000))
    await page.waitForTimeout(30000 - (Date.now() % 30000) + 250);
  const verifiedStep = Math.floor(Date.now() / 30000);
  await page.locator('input[name="code"]').fill(totp(secret));
  await page.getByRole("button", { name: "Verify code", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Verification completed" })
    .waitFor();
  const saved = JSON.parse(readFileSync(credentialFile, "utf8"));
  writeFileSync(
    credentialFile,
    JSON.stringify({
      ...saved,
      authenticator: { ...saved.authenticator, lastVerifiedStep: verifiedStep },
    }),
    { mode: 0o600 },
  );
}
