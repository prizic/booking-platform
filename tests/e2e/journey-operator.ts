import { spawnSync } from "node:child_process";
// @ts-expect-error -- platform-only local fixture owner, never imported by apps.
import { isolatedEnvironment } from "../../scripts/platform-admin-local.mjs";

/** The database's auth-claim trust boundary with aged MFA evidence. The test
 * derives the identity from a real signed Auth session and changes only AMR
 * age in a transaction under authenticated. It never issues a forged HTTP JWT. */
export function staleStepUpIsDenied(realToken: string): boolean {
  const local = isolatedEnvironment();
  if (
    !process.env.WLBP_CAMPAIGN ||
    !["57722", "57822", "57922"].includes(new URL(local.dbUrl).port)
  )
    throw new Error("Separate isolated operator campaign required");
  const claims = JSON.parse(
    Buffer.from(realToken.split(".")[1]!, "base64url").toString("utf8"),
  );
  claims.amr = claims.amr.map((entry: { method: string; timestamp: number }) =>
    ["totp", "webauthn", "phone"].includes(entry.method)
      ? { ...entry, timestamp: Math.floor(Date.now() / 1000) - 901 }
      : entry,
  );
  const encoded = JSON.stringify(claims).replaceAll("'", "''");
  const result = spawnSync(
    "psql",
    [local.dbUrl, "--no-psqlrc", "-qtAX", "--set=ON_ERROR_STOP=1", "--file", "-"],
    {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      input: `begin;set local role authenticated;set local request.jwt.claims='${encoded}';select api_v1.update_instance_configuration_v1('d3000000-0000-4000-8000-000000000136','Must not persist',0,'Synthetic journey stale second factor','synthetic-stale-step-up');rollback;`,
      timeout: 30000,
    },
  );
  if (result.error) throw new Error("Local stale step-up fixture transport failed");
  return (
    result.status !== 0 && result.stderr.includes("recent_authentication_required")
  );
}
