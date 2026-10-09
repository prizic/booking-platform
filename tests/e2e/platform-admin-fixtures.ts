import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
// @ts-expect-error -- plain ESM helpers shared with the seed script
import { isolatedEnvironment } from "../../scripts/platform-admin-local.mjs";
// @ts-expect-error -- plain ESM helper
import { totp } from "../../scripts/totp.mjs";

export const adminOrigin = "http://localhost:41742";
export type DemoOperator = "admin" | "admin2" | "operator" | "viewer";
type Credential = {
  email: string;
  password: string;
  totpSecret: string;
  factorId: string;
};

const credentialFile =
  process.env.PLATFORM_ADMIN_CREDENTIAL_FILE ??
  path.join(process.cwd(), ".artifacts/platform-admin/credentials.json");

export function credential(who: DemoOperator): Credential {
  return JSON.parse(readFileSync(credentialFile, "utf8")).operators[who];
}

export const env = isolatedEnvironment() as {
  apiUrl: string;
  anonKey: string;
  publishableKey: string;
};

const lastStep = new Map<string, number>();
const apiSessions = new Set<string>();

/** A code for a 30-second step this operator has not used yet in this run. */
export async function freshCode(who: DemoOperator): Promise<string> {
  let step = Math.floor(Date.now() / 30000);
  // Seed/another browser may have just consumed the current step. A first use
  // waits for the next step too, so a retry in a fresh worker cannot replay it.
  if (!lastStep.has(who) || lastStep.get(who) === step) {
    await new Promise((resolve) =>
      setTimeout(resolve, (step + 1) * 30000 - Date.now() + 500),
    );
    step = Math.floor(Date.now() / 30000);
  }
  lastStep.set(who, step);
  return totp(credential(who).totpSecret);
}

export async function signIn(
  page: Page,
  who: DemoOperator,
  locale: "en" | "ar" = "en",
) {
  const c = credential(who);
  await page.goto(`${adminOrigin}/${locale}/login`);
  await page.locator("#email").fill(c.email);
  await page.locator("#password").fill(c.password);
  await page.locator('form button[type="submit"]').click();
  await expect(page.locator("#code")).toBeVisible();
  await page.locator("#code").fill(await freshCode(who));
  await page.locator('form button[type="submit"]').click();
  // Console shell owns #main-content (skip-link target); the signed-out and
  // denied states render a main without that id.
  await expect(page.locator("#main-content")).toBeVisible();
}

export async function signOut(page: Page) {
  // A rejected destructive action intentionally leaves its modal open.
  // Dismiss it through the same keyboard path before reaching the sign-out form.
  const dialog = page.getByRole("dialog");
  if (await dialog.count()) {
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  }
  const form = page.locator('form[action$="/sign-out"]');
  if (await form.count()) {
    const [result] = await Promise.all([
      page.waitForResponse(
        (result) =>
          result.request().method() === "POST" &&
          new URL(result.url()).pathname.endsWith("/sign-out"),
      ),
      form.locator('button[type="submit"]').click(),
    ]);
    const headers = await result.request().allHeaders();
    expect(
      result.status(),
      `sign-out response (${JSON.stringify({
        origin: headers.origin,
        host: headers.host,
        fetchSite: headers["sec-fetch-site"],
      })})`,
    ).toBe(303);
    await expect(page).toHaveURL(/\/(en|ar)\/login$/u);
  }
}

async function auth(route: string, init: RequestInit & { token?: string } = {}) {
  const response = await fetch(`${env.apiUrl}/auth/v1${route}`, {
    ...init,
    headers: {
      apikey: env.anonKey,
      authorization: `Bearer ${init.token ?? env.anonKey}`,
      "content-type": "application/json",
    },
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
  });
  // GoTrue MFA verification invalidates other AAL1 sessions for this user.
  // A confirmed absent session is already cleaned up; every other error fails.
  if (route === "/logout?scope=local" && response.status === 403) {
    const failure = await response.json().catch(() => null);
    if (failure?.error_code === "session_not_found") return {};
  }
  if (!response.ok)
    throw new Error(`Auth ${route.split("?")[0]} failed (${response.status})`);
  if (response.status === 204) return {};
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    throw new Error("Auth returned an invalid response");
  }
}

/** An access token at aal1 (password only) or aal2 (password + TOTP). */
export async function apiToken(
  who: DemoOperator,
  aal: "aal1" | "aal2",
): Promise<string> {
  const c = credential(who);
  const session = await auth("/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email: c.email, password: c.password }),
  });
  apiSessions.add(session.access_token as string);
  if (aal === "aal1") return session.access_token as string;
  const challenge = await auth(`/factors/${c.factorId}/challenge`, {
    method: "POST",
    token: session.access_token as string,
    body: "{}",
  });
  const verified = await auth(`/factors/${c.factorId}/verify`, {
    method: "POST",
    token: session.access_token as string,
    body: JSON.stringify({ challenge_id: challenge.id, code: await freshCode(who) }),
  });
  apiSessions.delete(session.access_token as string);
  apiSessions.add(verified.access_token as string);
  return verified.access_token as string;
}

export async function revokeApiSessions() {
  const results = await Promise.allSettled(
    [...apiSessions].map(async (token) => {
      await auth("/logout?scope=local", { method: "POST", token });
      apiSessions.delete(token);
    }),
  );
  if (results.some((result) => result.status === "rejected"))
    throw new Error("API session cleanup failed");
}

export async function rpc(fn: string, body: object, token?: string) {
  const response = await fetch(`${env.apiUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: env.publishableKey,
      authorization: `Bearer ${token ?? env.publishableKey}`,
      "content-profile": "api_v1",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
  });
  return { status: response.status, body: await response.text() };
}

/** Fails on uncaught page errors and every browser console error. */
export function watchConsole(page: Page): () => string[] {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });
  return () => problems;
}
