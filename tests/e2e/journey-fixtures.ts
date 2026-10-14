import { expect, test as base, type Page, type Locator } from "@playwright/test";
import { completionSql, completionTenant } from "./dashboard-completion-fixtures";
import { readFileSync } from "node:fs";
// @ts-expect-error -- common ESM sanitizer, no browser data emitted.
import { safeUrl } from "../../scripts/journey-sanitize.mjs";
// @ts-expect-error -- common ESM preflight helper.
import { preflightJourneyClock } from "../../scripts/journey-preflight.mjs";

export const test = base.extend<{ recordSafeUrl: void }>({
  recordSafeUrl: [
    async ({ page }, use, info) => {
      if (process.env.WLBP_JOURNEY_E2E === "1") {
        const clock = preflightJourneyClock();
        await page.clock.setFixedTime(new Date(clock.seededAt));
      }
      await use();
      if (page.url() !== "about:blank")
        info.annotations.push({
          type: "journey-url",
          description: safeUrl(page.url()),
        });
    },
    { auto: true },
  ],
});
export { expect };
export const journey = {
  client: "http://localhost:41730",
  otherClient: "http://localhost:41735",
  failedClient: "http://localhost:41736",
  failedDashboard: "http://localhost:41737",
  booking: "d9510000-0000-0000-0000-000000000136",
  request: "d9510000-0000-0000-0000-000000000137",
  history: "d9510000-0000-0000-0000-000000000138",
  foreign: "d9500000-0000-0000-0000-000000000001",
};

export function requireJourney() {
  if (process.env.WLBP_JOURNEY_E2E !== "1")
    throw new Error(
      "Set WLBP_JOURNEY_E2E=1 with the isolated completion fixture and server profile.",
    );
}
export async function documentIdentity(page: Page) {
  const marker = `journey-${Date.now()}`;
  await page.evaluate((value) => {
    Object.assign(window, { __journeyDocumentIdentity: value });
  }, marker);
  return async () =>
    expect(
      await page.evaluate(
        () =>
          (window as Window & { __journeyDocumentIdentity?: string })
            .__journeyDocumentIdentity,
      ),
    ).toBe(marker);
}
export async function ready(page: Page, heading?: string | RegExp) {
  await expect(
    page
      .getByRole("main")
      .getByRole("heading", { level: 1, ...(heading ? { name: heading } : {}) }),
  ).toBeVisible();
  await expect(page.getByRole("main").locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(page.getByRole("main").locator('[data-slot="error-state"]')).toHaveCount(
    0,
  );
}
export async function choose(page: Page, label: string | RegExp, name: string) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name, exact: true }).click();
}
export async function submitDialog(page: Page, action: string, reason: string) {
  const dialog = page.getByRole("dialog").or(page.getByRole("alertdialog"));
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel(/^Reason/u)).toHaveAttribute("required", "");
  await dialog.getByLabel(/^Reason/u).fill(reason);
  await dialog.getByRole("button", { name: action, exact: true }).click();
  await expect(dialog).toBeHidden();
}
/** Semantic pattern, in DOM order; accepts table, list or explicit recovery state. */
export async function dataPage(page: Page) {
  const main = page.getByRole("main");
  const heading = main.getByRole("heading", { level: 1 });
  await expect(heading).toBeVisible();
  const toolbar = main
    .getByRole("search")
    .or(main.getByRole("toolbar"))
    .or(main.locator('form[method="get"], form[aria-label]'))
    .first();
  await expect(toolbar).toBeVisible();
  const body = main.locator('[data-slot="data-page-body"]');
  await expect(body).toBeVisible();
  const data = body
    .getByRole("table")
    .or(body.getByRole("list"))
    .or(body.getByRole("status"))
    .or(body.locator('[data-slot="empty-state"]'))
    .or(body.locator('[data-slot="error-state"]'))
    .first();
  await expect(data).toBeVisible();
  for (const [a, b] of [
    [heading, toolbar],
    [toolbar, data],
  ] as [Locator, Locator][]) {
    const aHandle = await a.elementHandle();
    const bHandle = await b.elementHandle();
    expect(
      await aHandle!.evaluate(
        (node, other) =>
          Boolean(
            node.compareDocumentPosition(other as Node) &
            Node.DOCUMENT_POSITION_FOLLOWING,
          ),
        bHandle,
      ),
    ).toBe(true);
  }
  await expect(main.locator('[aria-busy="true"]')).toHaveCount(0);
}
export function customerId() {
  return completionSql(
    `select customer_id from app.booking_contacts where tenant_id='${completionTenant}' and booking_id='${journey.booking}'`,
  );
}

/** Mailpit only, isolated recipient; tokens never leave test memory/artifacts. */
export async function recoveryMailLinks(mailboxOrigin: string) {
  const origin = new URL(mailboxOrigin);
  if (
    !["127.0.0.1", "localhost"].includes(origin.hostname) ||
    !["55324", "57724", "57824", "57924"].includes(origin.port)
  )
    throw new Error("Isolated local mailbox required");
  let links: string[] = [];
  await expect(async () => {
    const response = await fetch(
      `${origin.origin}/api/v1/search?query=${encodeURIComponent("to:journey-customer@example.invalid")}`,
    );
    if (!response.ok) throw new Error("Local mailbox search unavailable");
    const body = await response.json();
    const messages = body.messages ?? body.Messages ?? [];
    const found = new Map<string, string>();
    for (const message of messages) {
      const detail = await fetch(
        `${origin.origin}/api/v1/message/${message.ID ?? message.id}`,
      );
      if (!detail.ok) continue;
      const mail = await detail.json();
      for (const match of `${mail.Text ?? ""}\n${mail.HTML ?? ""}`.matchAll(
        /https?:\/\/[^\s"'<>]+/gu,
      )) {
        const candidate = match[0].replaceAll("&amp;", "&");
        const url = new URL(candidate);
        if (url.pathname.includes("/manage") && url.searchParams.has("token")) {
          const reference = ["JRNY136ABC", "JRNY137ABC"].find((ref) =>
            `${mail.Text ?? ""} ${mail.HTML ?? ""}`.includes(ref),
          );
          if (reference && !found.has(reference)) found.set(reference, candidate);
        }
      }
    }
    links = [...found.values()];
    expect(
      links.length,
      "At least two separately scoped management links delivered",
    ).toBeGreaterThanOrEqual(2);
  }).toPass({ timeout: 60000, intervals: [500, 1000, 2000] });
  return links;
}
