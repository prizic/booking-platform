import { createHmac, timingSafeEqual } from "node:crypto";

export const recoveryCookieName = "dashboard-recovery";
export const recoveryLifetimeSeconds = 900;

/** A callback receipt, bound to the provider-verified account and session. */
export function issueRecoveryTicket(
  secret: string,
  account: string,
  session: string,
  now: number,
): string {
  if (secret.length < 32 || !account || !session)
    throw new Error("Recovery is not configured");
  const payload = Buffer.from(
    JSON.stringify({
      account,
      session,
      issued: now,
      expires: now + recoveryLifetimeSeconds,
    }),
  ).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

export function verifyRecoveryTicket(
  ticket: string | undefined,
  secret: string | undefined,
  account: string,
  session: string,
  now: number,
): boolean {
  if (!ticket || !secret || secret.length < 32 || ticket.length > 2048) return false;
  const [payload, signature, extra] = ticket.split(".");
  if (!payload || !signature || extra !== undefined) return false;
  const expected = createHmac("sha256", secret).update(payload).digest();
  const actual = Buffer.from(signature, "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    return false;
  try {
    const receipt: unknown = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (
      typeof receipt !== "object" ||
      receipt === null ||
      !("account" in receipt) ||
      !("session" in receipt) ||
      !("issued" in receipt) ||
      !("expires" in receipt)
    )
      return false;
    return (
      receipt.account === account &&
      receipt.session === session &&
      typeof receipt.issued === "number" &&
      typeof receipt.expires === "number" &&
      Number.isSafeInteger(receipt.issued) &&
      receipt.issued <= now &&
      receipt.expires === receipt.issued + recoveryLifetimeSeconds &&
      now < receipt.expires
    );
  } catch {
    return false;
  }
}
