import {
  deliverJourneyMail,
  issueJourneyToken,
  expireJourneyToken,
} from "./journey-management";
import { randomUUID } from "node:crypto";
import {
  test,
  expect,
  journey,
  requireJourney,
  recoveryMailLinks,
} from "./journey-fixtures";
import {
  completionSql,
  completionOrigin,
  signInCompletion,
  enrollCompletionMfa,
} from "./dashboard-completion-fixtures";
// @ts-expect-error -- local-only fixture transport.
import { readLocalSupabaseEnvironment } from "../../scripts/live-booking-e2e.mjs";

test.skip(
  process.env.WLBP_JOURNEY_E2E !== "1",
  "Requires the documented isolated journey campaign",
);
test.beforeEach(requireJourney);
test.describe.configure({ mode: "default" });
for (const locale of ["en", "ar"] as const) {
  test(`R1 catalog renders seeded tenant offers (${locale})`, async ({ page }) => {
    await page.goto(`${journey.client}/${locale}/services`);
    await expect(
      page
        .getByRole("main")
        .getByRole("link", {
          name: locale === "en" ? /Completion consultation/u : /استشارة مباشرة/u,
        })
        .first(),
    ).toBeVisible();
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    await expect(page.locator("html")).toHaveAttribute(
      "dir",
      locale === "ar" ? "rtl" : "ltr",
    );
  });
  test(`R2 Contact uses this tenant's email phone and WhatsApp (${locale})`, async ({
    page,
  }) => {
    await page.goto(`${journey.client}/${locale}/contact`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      locale === "ar" ? /تواصل|اتصل/u : /Contact/u,
    );
    await expect(
      page
        .getByRole("main")
        .locator('a[href="mailto:journey-contact@example.invalid"]'),
    ).toBeVisible();
    await expect(
      page.getByRole("main").locator('a[href="tel:+15555550136"]'),
    ).toBeVisible();
    await expect(
      page.getByRole("main").locator('a[href^="https://wa.me/15555550137"]'),
    ).toBeVisible();
    await expect(
      page.getByRole("main").locator('a[href^="tel:"]'),
    ).toHaveAccessibleName(/.+/u);
  });
  test(`R3 About renders localized experience reasons address map and call (${locale})`, async ({
    page,
  }) => {
    await page.goto(`${journey.client}/${locale}/about`);
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1 })).toContainText(
      locale === "ar" ? /من نحن|عنا/u : /About/u,
    );
    for (const text of locale === "en"
      ? [
          "Twenty years serving our community",
          "Thoughtful care and clear appointments",
          "136 Synthetic Street",
        ]
      : [
          "عشرون عامًا في خدمة مجتمعنا",
          "رعاية مدروسة ومواعيد واضحة",
          "١٣٦ شارع الاختبار",
        ])
      await expect(main.getByText(text, { exact: true })).toBeVisible();
    await expect(
      main.locator('a[href="https://maps.example.invalid/journey"]'),
    ).toBeVisible();
    await expect(main.locator('a[href="tel:+15555550136"]')).toBeVisible();
    await expect(main.locator("iframe, script")).toHaveCount(0);
  });
  test(`R4 footer exposes configured stores and preserves PWA installation (${locale})`, async ({
    page,
  }) => {
    await page.goto(`${journey.client}/${locale}`);
    const footer = page.getByRole("contentinfo");
    await expect(
      footer.locator('a[href="https://apps.apple.com/app/journey-demo"]'),
    ).toBeVisible();
    await expect(
      footer.locator(
        'a[href="https://play.google.com/store/apps/details?id=invalid.example.journey"]',
      ),
    ).toBeVisible();
    await expect(page.locator(`a[href="/${locale}/install"]`).first()).toBeVisible();
  });
  test(`R5 email-only lookup offers the same accepted message for known and unknown email (${locale})`, async ({
    page,
  }) => {
    const statuses: string[] = [];
    for (const email of [
      "journey-customer@example.invalid",
      "journey-unknown@example.invalid",
    ]) {
      await page.goto(`${journey.client}/${locale}/find-booking`);
      const main = page.getByRole("main");
      await expect(main.locator('input[type="email"]')).toHaveCount(1);
      await expect(
        main.locator(
          'input[type="password"], input[name="reference"], input[name="bookingReference"]',
        ),
      ).toHaveCount(0);
      await main.locator('input[type="email"]').fill(email);
      await main.locator('button[type="submit"]').click();
      const status = main.getByRole("status");
      await expect(status).toContainText(
        locale === "ar" ? /إذا.*حجز.*رابط/u : /if.*booking.*sent.*link/iu,
      );
      statuses.push((await status.innerText()).trim());
      expect(new URL(page.url()).searchParams.has("email")).toBe(false);
      expect(page.url().includes(email)).toBe(false);
    }
    expect(statuses[0]).toBe(statuses[1]);
  });
}

test("R1 real catalog RPC failure has recovery and never masquerades as empty", async ({
  page,
}) => {
  await page.goto(`${journey.failedClient}/en/services`);
  const main = page.getByRole("main");
  await expect(main.getByRole("alert")).toContainText(
    /unable|unavailable|try again|could not/iu,
  );
  await expect(main.getByText(/no services|nothing available/iu)).toHaveCount(0);
});
test("R2 R3 R4 absent tenant options hide controls and render safe fallback", async ({
  page,
}) => {
  await page.goto(`${journey.otherClient}/en/contact`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(
    page.getByRole("main").locator('a[href^="tel:"],a[href^="https://wa.me/"]'),
  ).toHaveCount(0);
  await expect(
    page.locator('a[href="mailto:journey-contact@example.invalid"]'),
  ).toHaveCount(0);
  await page.goto(`${journey.otherClient}/en/about`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(
    page
      .getByRole("main")
      .locator('iframe,a[href="https://maps.example.invalid/journey"]'),
  ).toHaveCount(0);
  await page.goto(`${journey.otherClient}/en`);
  await expect(
    page
      .getByRole("contentinfo")
      .locator('a[href^="https://apps.apple.com"],a[href^="https://play.google.com"]'),
  ).toHaveCount(0);
});

test("R2 publication updates public contact without serving previous revision", async ({
  page,
}) => {
  test.setTimeout(180000);
  await signInCompletion(page);
  await enrollCompletionMfa(page);
  await page.goto(`${completionOrigin}/en/brand`);
  const email = page.getByLabel("Contact email", { exact: true });
  await email.fill("journey-published@example.invalid");
  await page.getByRole("button", { name: /Save draft/iu }).click();
  await expect(page.getByRole("status").filter({ hasText: /saved/iu })).toBeVisible();
  await page.getByRole("button", { name: "Publish this draft", exact: true }).click();
  const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
  await dialog.getByRole("button", { name: "Publish this draft", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: /published/iu }),
  ).toBeVisible();
  await page.goto(`${journey.client}/en/contact`);
  await expect(
    page
      .getByRole("main")
      .locator('a[href="mailto:journey-published@example.invalid"]'),
  ).toBeVisible();
  await expect(
    page.getByRole("main").locator('a[href="mailto:journey-contact@example.invalid"]'),
  ).toHaveCount(0);
  // Restore through the same editor/publisher; no fixture writes mid-run.
  await page.goto(`${completionOrigin}/en/brand`);
  await email.fill("journey-contact@example.invalid");
  await page.getByRole("button", { name: /Save draft/iu }).click();
  await expect(page.getByRole("status").filter({ hasText: /saved/iu })).toBeVisible();
  await page.getByRole("button", { name: "Publish this draft", exact: true }).click();
  await dialog.getByRole("button", { name: "Publish this draft", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: /published/iu }),
  ).toBeVisible();
});

test("R5 recovery RPC returns identical envelope and bounded timing regardless of matches", async () => {
  const local = readLocalSupabaseEnvironment();
  const samples: Record<string, number[]> = { known: [], unknown: [] };
  for (let repetition = 0; repetition < 12; repetition++) {
    for (const kind of repetition % 2 ? ["unknown", "known"] : ["known", "unknown"]) {
      const start = performance.now();
      const response = await fetch(
        `${local.apiUrl}/rest/v1/rpc/request_booking_recovery_v1`,
        {
          method: "POST",
          headers: {
            apikey: local.publishableKey,
            authorization: `Bearer ${local.publishableKey}`,
            "content-profile": "api_v1",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            p_hostname: "client.dashboard-completion.example.invalid",
            p_application: "client",
            p_email:
              kind === "known"
                ? "journey-customer@example.invalid"
                : "journey-unknown@example.invalid",
            p_request_id: randomUUID(),
          }),
        },
      );
      samples[kind]!.push(performance.now() - start);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        contractVersion: 1,
        outcome: "accepted",
      });
    }
  }
  const median = (values: number[]) =>
    [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
  // Async acceptance removes DB lookup from request latency; tolerate local noise.
  expect(Math.abs(median(samples.known!) - median(samples.unknown!))).toBeLessThan(100);
});

test("R5 local mailbox delivers separate scoped links and reference alone grants nothing", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.goto(`${journey.client}/en/find-booking`);
  await page
    .getByRole("main")
    .locator('input[type="email"]')
    .fill("journey-customer@example.invalid");
  await page.getByRole("main").locator('button[type="submit"]').click();
  await expect(page.getByRole("main").getByRole("status")).toBeVisible();
  deliverJourneyMail();
  const links = await recoveryMailLinks(
    process.env.WLBP_JOURNEY_MAILBOX ?? "http://127.0.0.1:55324",
  );
  const tokens = new Set(links.map((link) => new URL(link).searchParams.get("token")));
  expect(tokens.size).toBeGreaterThanOrEqual(2);
  const references = new Set<string>();
  for (const link of links) {
    const url = new URL(link);
    url.protocol = "http:";
    url.host = new URL(journey.client).host;
    expect(url.href.includes("journey-customer")).toBe(false);
    await page.goto(url.href);
    const text = await page.getByRole("main").innerText();
    const matches = ["JRNY136ABC", "JRNY137ABC", "JRNY138ABC"].filter((ref) =>
      text.includes(ref),
    );
    expect(matches.length, "One link must expose exactly one booking").toBe(1);
    references.add(matches[0]!);
    await expect(
      page.locator('a[href*="/dashboard"],a[href*="/customers"]'),
    ).toHaveCount(0);
  }
  expect(references.size).toBeGreaterThanOrEqual(2);
  await page.goto(`${journey.client}/en/manage?reference=JRNY136ABC`);
  await expect(page.getByRole("main")).not.toContainText("Journey synthetic customer");
  await expect(
    page.getByRole("button", { name: /confirm cancellation/iu }),
  ).toHaveCount(0);
});

test("R5 expired revoked wrong-tenant and invented links share one refusal", async ({
  page,
}) => {
  const token = issueJourneyToken(journey.booking, "view");
  const valid = await page.request.post(`${journey.client}/api/manage`, {
    data: { token, intent: "view" },
  });
  expect(valid.status()).toBe(200);
  expect((await valid.json()).outcome).toBe("granted");
  const other = await page.request.post(`${journey.otherClient}/api/manage`, {
    data: { token, intent: "view" },
  });
  const replacement = issueJourneyToken(journey.booking, "view"); // Production supersession.
  const revoked = await page.request.post(`${journey.client}/api/manage`, {
    data: { token, intent: "view" },
  });
  expireJourneyToken(replacement);
  const expired = await page.request.post(`${journey.client}/api/manage`, {
    data: { token: replacement, intent: "view" },
  });
  const missing = await page.request.post(`${journey.client}/api/manage`, {
    data: { token: "0".repeat(64), intent: "view" },
  });
  const expected = await missing.text();
  for (const response of [other, revoked, expired]) {
    expect(response.status()).toBe(missing.status());
    expect(await response.text()).toBe(expected);
  }
});

test("R5 OTP is mandatory single-use and booking change revokes the recovered link", async ({
  page,
}) => {
  test.setTimeout(180000);
  const booking = "d9510000-0000-0000-0000-000000000139";
  const viewToken = issueJourneyToken(booking, "view");
  await page.goto(`${journey.client}/en/manage?token=${viewToken}`);
  await expect(page.getByRole("main")).toContainText("JRNY139ABC");
  await page.getByRole("button", { name: /^Cancel this booking$/iu }).click();
  const actionToken = new URL(page.url()).searchParams.get("token")!;
  expect(actionToken === viewToken).toBe(false);
  const request = (body: object) =>
    page.request.post(`${journey.client}/api/manage`, { data: body });
  const denied = await request({
    action: "cancel",
    token: actionToken,
    expectedRevision: 1,
  });
  expect((await denied.json()).outcome).toBe("unavailable");
  deliverJourneyMail();
  const mailbox = process.env.WLBP_JOURNEY_MAILBOX ?? "http://127.0.0.1:55324";
  const message = await fetch(
    `${mailbox}/view/latest.txt?query=${encodeURIComponent("to:journey-action@example.invalid")}`,
  );
  expect(message.status).toBe(200);
  const code = (await message.text()).match(/\b(\d{6})\b/u)?.[1];
  expect(Boolean(code), "Actual OTP email must arrive in isolated mailbox").toBe(true);
  const wrong = code === "000000" ? "000001" : "000000";
  const wrongCode = await request({
    action: "verify-step-up",
    token: actionToken,
    code: wrong,
  });
  expect((await wrongCode.json()).verified).toBe(false);
  await page.getByLabel(/Six-digit code/iu).fill(code!);
  await page.getByRole("button", { name: /Confirm code/iu }).click();
  await expect(page.getByText(/Confirmed.*continue/iu)).toBeVisible();
  const otherIntent = await request({
    action: "reschedule",
    token: actionToken,
    expectedRevision: 1,
    startAt: new Date(Date.now() + 86400000).toISOString(),
  });
  expect((await otherIntent.json()).outcome).toBe("unavailable");
  await page.getByRole("button", { name: /^Cancel this booking$/iu }).click();
  await expect(page.getByRole("main")).toContainText(/cancelled/iu);
  const replay = await request({
    action: "cancel",
    token: actionToken,
    expectedRevision: 1,
  });
  expect((await replay.json()).outcome).toBe("unavailable");
  const otpReplay = await request({
    action: "verify-step-up",
    token: actionToken,
    code,
  });
  expect((await otpReplay.json()).verified).toBe(false);
  const oldView = await request({ token: viewToken, intent: "view" });
  expect((await oldView.json()).outcome).toBe("unavailable");
  expect(completionSql(`select status from app.bookings where id='${booking}'`)).toBe(
    "cancelled",
  );
});

test("R5 accepted recovery replay never duplicates requests or leaks recipient identity", async () => {
  const local = readLocalSupabaseEnvironment();
  const id = randomUUID();
  for (const email of [
    "journey-customer@example.invalid",
    "journey-unknown@example.invalid",
  ]) {
    const response = await fetch(
      `${local.apiUrl}/rest/v1/rpc/request_booking_recovery_v1`,
      {
        method: "POST",
        headers: {
          apikey: local.publishableKey,
          authorization: `Bearer ${local.publishableKey}`,
          "content-profile": "api_v1",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          p_hostname: "client.dashboard-completion.example.invalid",
          p_application: "client",
          p_email: email,
          p_request_id: id,
        }),
      },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ contractVersion: 1, outcome: "accepted" });
  }
  expect(
    completionSql(
      `select count(*) from app.booking_recovery_requests where request_id='${id}'`,
    ),
  ).toBe("1");
  expect(
    completionSql(
      `select count(*) from app.management_access_events where request_id='${id}' and action='recovery_requested'`,
    ),
  ).toBe("1");
});
