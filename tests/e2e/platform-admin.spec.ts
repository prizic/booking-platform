import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  adminOrigin,
  apiToken,
  revokeApiSessions,
  rpc,
  signIn,
  signOut,
  watchConsole,
} from "./platform-admin-fixtures";

test.describe.configure({ mode: "default" });

test.afterEach(async ({ page }) => {
  await signOut(page);
  await revokeApiSessions();
});

const areas = [
  "",
  "tenants",
  "instances",
  "domains",
  "provisioning",
  "jobs",
  "plans",
  "subscriptions",
  "releases",
  "rollouts",
  "health",
  "support",
  "operators",
  "audit",
  "settings",
  "account",
];

test("signed-out visitors are sent to sign in", async ({ page }) => {
  await page.goto(`${adminOrigin}/en/tenants`);
  await expect(page).toHaveURL(/\/en\/login$/u);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("an administrator signs in with TOTP and sees real overview data", async ({
  page,
}) => {
  const problems = watchConsole(page);
  await signIn(page, "admin");
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
  await expect(page.getByText("Provisioning failed")).toBeVisible();
  await expect(page.getByText(/later M1|System ready/u)).toHaveCount(0);
  expect(problems()).toEqual([]);
});

test("every navigation item opens a working page without console errors", async ({
  page,
}) => {
  const problems = watchConsole(page);
  await signIn(page, "admin");
  for (const area of areas) {
    const response = await page.goto(`${adminOrigin}/en${area ? `/${area}` : ""}`);
    expect(response?.status(), area).toBe(200);
    await expect(page.getByRole("heading", { level: 1 }), area).toBeVisible();
    await expect(
      page.getByText("This information could not be loaded"),
      area,
    ).toHaveCount(0);
  }
  expect(problems()).toEqual([]);
});

test("lists read persisted demo data and keep their filters in the URL", async ({
  page,
}) => {
  await signIn(page, "viewer");
  await page.goto(`${adminOrigin}/en/tenants?status=suspended`);
  await expect(
    page.getByRole("link", { name: "Synthetic demo · West Salon" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Synthetic demo · North Clinic" }),
  ).toHaveCount(0);
  await page.goto(`${adminOrigin}/en/health?status=unknown`);
  const unobserved = page
    .getByRole("table", { name: "Observations", exact: true })
    .getByRole("row")
    .filter({ hasText: "Synthetic demo · Central Gym" });
  await expect(
    unobserved.getByRole("cell", { name: "Not observed", exact: true }).first(),
  ).toBeVisible();
  await expect(
    unobserved.getByRole("cell", { name: "Never observed", exact: true }),
  ).toBeVisible();
  await page.goto(`${adminOrigin}/en/provisioning?state=failed`);
  await page.getByRole("link", { name: "demo-east" }).click();
  await expect(page.getByText("github_rate_limited").first()).toBeVisible();
});

test("a viewer gets a read-only interface", async ({ page }) => {
  await signIn(page, "viewer");
  await page.goto(`${adminOrigin}/en/tenants`);
  await expect(page.getByRole("link", { name: "Register tenant" })).toHaveCount(0);
  await page.goto(`${adminOrigin}/en/operators`);
  await expect(page.getByRole("button", { name: "Add operator" })).toHaveCount(0);
});

test("the server refuses unauthorized direct API calls", async () => {
  const anonymous = await rpc("list_tenants_v1", {});
  expect(anonymous.status).toBeGreaterThanOrEqual(400);

  const unverified = await rpc("list_tenants_v1", {}, await apiToken("viewer", "aal1"));
  expect(unverified.status).toBeGreaterThanOrEqual(400);
  expect(unverified.body).toContain("policy_denied");

  const viewer = await apiToken("viewer", "aal2");
  expect((await rpc("list_tenants_v1", {}, viewer)).status).toBe(200);
  const mutation = await rpc(
    "set_tenant_status_v1",
    {
      p_tenant_id: "d1000000-0000-4000-8000-000000000001",
      p_status: "suspended",
      p_reason: "viewer should not be able to do this",
      p_expected_status: "active",
    },
    viewer,
  );
  expect(mutation.status).toBeGreaterThanOrEqual(400);
  expect(mutation.body).toContain("policy_denied");
});

test("an administrator registers, renames, suspends and reactivates a tenant, and the audit log records it", async ({
  page,
}) => {
  const stamp = Date.now().toString(36);
  const name = `Synthetic demo · E2E ${stamp}`;
  const suspensionReason = `E2E ${stamp}: verifying the suspension workflow`;
  await signIn(page, "admin");
  await page.goto(`${adminOrigin}/en/tenants/new`);
  await page.locator("#name").fill(name);
  await page.locator("#brandKey").fill(`e2e-${stamp}`);
  await page.getByRole("button", { name: "Register tenant" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(page.getByText("Tenant registered.")).toBeVisible();

  const renamed = `${name} renamed`;
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Business name").fill(renamed);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Rename", exact: true })
    .click();
  await expect(page.getByText("Tenant renamed.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: renamed })).toBeVisible();

  // Keyboard: open the dialog, Escape closes it, focus returns to the trigger.
  const suspend = page.getByRole("button", { name: "Suspend", exact: true });
  await suspend.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByLabel("Reason")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(suspend).toBeFocused();

  await suspend.click();
  await page.getByRole("dialog").getByLabel("Reason").fill(suspensionReason);
  await page.getByRole("dialog").getByRole("button", { name: "Suspend" }).click();
  await expect(page.getByText("Tenant suspended.")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Reactivate" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Reason")
    .fill("E2E: verifying reactivation works");
  await page.getByRole("dialog").getByRole("button", { name: "Reactivate" }).click();
  await expect(page.getByText("Tenant reactivated.")).toBeVisible();

  await page.goto(`${adminOrigin}/en/audit?q=${encodeURIComponent(suspensionReason)}`);
  await expect(page.getByText("Suspended a tenant")).toBeVisible();
});

test("validation errors are explained, not raw", async ({ page }) => {
  await signIn(page, "admin");
  await page.goto(`${adminOrigin}/en/tenants/new`);
  await page.locator("#name").fill("Synthetic demo · Bad key");
  await page.locator("#brandKey").fill("Not A Key");
  await page.getByRole("button", { name: "Register tenant" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "lowercase letters",
  );
});

test("two-person control: the requester cannot approve the close job", async ({
  page,
}) => {
  await signIn(page, "admin2");
  await page.goto(`${adminOrigin}/en/jobs/d8000000-0000-4000-8000-000000000004`);
  await page.getByRole("button", { name: "Approve" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "A different administrator must approve this.",
  );
});

test("Arabic is right-to-left and fully translated", async ({ page }) => {
  await signIn(page, "viewer", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    page.getByRole("heading", { level: 1, name: "نظرة عامة" }),
  ).toBeVisible();
  await page.goto(`${adminOrigin}/ar/tenants`);
  await expect(page.getByRole("link", { name: "المستأجرون" }).first()).toBeVisible();
  await expect(page.getByText(/Unknown status/u)).toHaveCount(0);
});

test("mobile navigation is an explicit disclosure", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "viewer");
  const menu = page.getByRole("button", { name: "Menu" });
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toBeFocused();
});

for (const locale of ["en", "ar"] as const) {
  test(`key pages have no automated WCAG A/AA violations (${locale})`, async ({
    page,
  }) => {
    await signIn(page, "admin", locale);
    for (const area of [
      "",
      "tenants",
      "tenants/d1000000-0000-4000-8000-000000000001",
      "provisioning/d5000000-0000-4000-8000-000000000002",
      "audit",
    ]) {
      await page.goto(`${adminOrigin}/${locale}${area ? `/${area}` : ""}`);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(results.violations, area).toEqual([]);
    }
  });
}

test("administrative workflows persist commercial changes and keep external work queued", async ({
  page,
}) => {
  test.setTimeout(420_000);
  const stamp = Date.now().toString(36);
  const north = "d1000000-0000-4000-8000-000000000001";
  const northInstance = "d3000000-0000-4000-8000-000000000001";
  const planKey = `e2e-${stamp}`;
  const planName = `Synthetic demo · Plan ${stamp}`;
  const reason = `Synthetic demo E2E administration ${stamp}`;
  const dialog = () => page.getByRole("dialog");
  const submit = async (name: string) => {
    await dialog().getByRole("button", { name, exact: true }).click();
    await expect(dialog()).toBeHidden();
  };
  const problems = watchConsole(page);
  await signIn(page, "admin");

  await test.step("create and edit an audited plan", async () => {
    await page.goto(`${adminOrigin}/en/plans`);
    await page.getByRole("button", { name: "Create plan", exact: true }).click();
    await expect(dialog().getByLabel(/^Key/u)).toBeFocused();
    await dialog().getByLabel(/^Key/u).fill(planKey);
    await dialog().getByLabel(/^Name/u).fill(planName);
    await dialog()
      .getByLabel(/^Features/u)
      .fill("booking.online\nreports.operational");
    await expect(dialog().getByLabel(/^Reason/u)).toHaveAttribute("required", "");
    await dialog()
      .getByLabel(/^Reason/u)
      .fill(reason);
    await submit("Create plan");
    await expect(
      page.getByRole("status").filter({ hasText: "Plan saved." }),
    ).toBeVisible();
    await page.reload();
    const row = page
      .getByRole("table", { name: "Plans", exact: true })
      .getByRole("row")
      .filter({ hasText: planKey });
    await expect(row).toContainText(planName);
    await row.getByRole("button", { name: "Edit", exact: true }).click();
    await dialog().getByLabel(/^Name/u).fill(`${planName} updated`);
    await dialog()
      .getByLabel(/^Features/u)
      .fill("booking.online\nreports.operational\nbrand.custom_domain");
    await dialog()
      .getByLabel(/^Reason/u)
      .fill(`${reason} plan edit`);
    await submit("Edit");
    await expect(
      page.getByRole("status").filter({ hasText: "Plan saved." }),
    ).toBeVisible();
    await page.reload();
    await expect(row).toContainText(`${planName} updated`);
    await expect(row).toContainText("brand.custom_domain");
  });

  await test.step("assign a plan, change subscription state and override a feature", async () => {
    await page.goto(`${adminOrigin}/en/tenants/${north}`);
    await page.getByRole("button", { name: "Change plan", exact: true }).click();
    await dialog().getByLabel(/^Plan/u).selectOption(planKey);
    await dialog()
      .getByLabel(/^Rollout ring/u)
      .selectOption("canary");
    await dialog()
      .getByLabel(/^Reason/u)
      .fill(`${reason} assignment`);
    await submit("Change plan");
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Plan changed and features updated." }),
    ).toBeVisible();
    await page.reload();
    await expect(page.locator("#subscription")).toContainText(`${planName} updated`);
    for (const [state, visible] of [
      ["past_due", "Past due"],
      ["active", "Active"],
    ] as const) {
      await page.getByRole("button", { name: "Change status", exact: true }).click();
      await dialog()
        .getByLabel(/^Status/u)
        .selectOption(state);
      await dialog()
        .getByLabel(/^Reason/u)
        .fill(`${reason} ${state}`);
      await submit("Save status");
      await expect(
        page.getByRole("status").filter({ hasText: "Subscription updated." }),
      ).toBeVisible();
      await page.reload();
      await expect(
        page
          .locator("#subscription")
          .getByRole("definition")
          .getByText(visible, { exact: true }),
      ).toBeVisible();
    }
    await page.getByRole("button", { name: "Override a feature", exact: true }).click();
    await dialog()
      .getByLabel(/^Feature key/u)
      .fill("reports.advanced");
    await dialog()
      .getByLabel(/^Override/u)
      .selectOption("no");
    await dialog()
      .getByLabel(/^Reason/u)
      .fill(`${reason} temporary override`);
    await submit("Save override");
    await expect(
      page.getByRole("status").filter({ hasText: "Override saved." }),
    ).toBeVisible();
    await page.reload();
    const feature = page
      .getByRole("table", { name: "Features", exact: true })
      .getByRole("row")
      .filter({ hasText: "reports.advanced" });
    await expect(feature.getByText("No", { exact: true })).toBeVisible();
    await feature.getByRole("button", { name: "Clear override", exact: true }).click();
    await dialog()
      .getByLabel(/^Reason/u)
      .fill(`${reason} clear override`);
    await submit("Clear override");
    await expect(
      page.getByRole("status").filter({ hasText: "Override cleared." }),
    ).toBeVisible();
    await page.reload();
    await expect(
      feature.getByRole("button", { name: "Clear override", exact: true }),
    ).toHaveCount(0);
  });

  await test.step("adding a domain queues verification and reports missing certificate honestly", async () => {
    const hostname = `book.e2e-${stamp}.example.invalid`;
    await page.getByRole("button", { name: "Add domain", exact: true }).click();
    await dialog()
      .getByLabel(/^Instance/u)
      .selectOption(northInstance);
    await dialog()
      .getByLabel(/^Hostname/u)
      .fill(hostname);
    await submit("Add and queue verification");
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Domain added. Verification is queued." }),
    ).toBeVisible();
    await page.goto(`${adminOrigin}/en/domains?q=${encodeURIComponent(hostname)}`);
    const domain = page
      .getByRole("table", { name: "Domains", exact: true })
      .getByRole("row")
      .filter({ hasText: hostname });
    await expect(domain.getByText("Pending", { exact: true })).toBeVisible();
    await expect(domain.getByText("Not reported", { exact: true })).toBeVisible();
    await expect(domain.getByText("Verified", { exact: true })).toHaveCount(0);
    await domain.getByRole("link", { name: "Queued", exact: true }).click();
    await expect(
      page.getByText(/Runs when the domain worker claims it/u),
    ).toBeVisible();
  });

  await test.step("a specific-instance rollout starts by queuing deployment work", async () => {
    const previous = `${adminOrigin}/en/rollouts?status=running&q=0.3.`;
    await page.goto(previous);
    const oldRollouts = page
      .getByRole("table", { name: "Rollouts", exact: true })
      .getByRole("link", { name: /^0\.3\./u });
    let cancelled = 0;
    while (await oldRollouts.count()) {
      expect(cancelled++).toBeLessThan(20);
      await oldRollouts.first().click();
      // Only our explicitly marked synthetic E2E work is eligible for cleanup.
      await expect(
        page.getByRole("definition").filter({
          hasText: /^Synthetic demo E2E administration /u,
        }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Cancel rollout", exact: true }).click();
      await dialog()
        .getByLabel(/^Reason/u)
        .fill(`${reason} retire prior synthetic rollout`);
      await submit("Cancel rollout");
      await page.goto(previous);
    }
    const version = `0.3.${Date.now() % 1_000_000_000}`;
    await page.goto(`${adminOrigin}/en/releases`);
    await page.getByRole("button", { name: "Register release", exact: true }).click();
    await dialog()
      .getByLabel(/^Version/u)
      .fill(version);
    await dialog()
      .getByLabel(/^Git commit/u)
      .fill("3".repeat(40));
    await dialog()
      .getByLabel(/^Configuration schema/u)
      .fill("3");
    await dialog()
      .getByLabel(/^Backend contract \(min\)/u)
      .fill("1");
    await dialog()
      .getByLabel(/^Backend contract \(max\)/u)
      .fill("1");
    await dialog()
      .getByLabel(/^Feature notes/u)
      .fill("Synthetic demo E2E release: locally queued work only");
    await dialog()
      .getByLabel(/^Upgrade notes/u)
      .fill("Synthetic demo: no external deployment performed");
    await submit("Register release");
    await expect(page.getByRole("heading", { level: 1, name: version })).toBeVisible();
    await page.getByRole("button", { name: "Create rollout", exact: true }).click();
    await expect(dialog().locator('input[name="rings"]:checked')).toHaveCount(0);
    await dialog()
      .locator(`input[name="instanceIds"][value="${northInstance}"]`)
      .check();
    await dialog()
      .getByLabel(/^Reason/u)
      .fill(`${reason} specific instance rollout`);
    await submit("Create rollout");
    await expect(page).toHaveURL(/\/en\/rollouts\/[0-9a-f-]+$/u);
    const rolloutUrl = page.url();
    await expect(
      page.getByRole("table", { name: "Targets", exact: true }).getByRole("row"),
    ).toHaveCount(2);
    await expect(page.getByText("Draft", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await submit("Start");
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Rollout started; deployments are queued." }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText(/Queued targets wait for the release worker/u),
    ).toBeVisible();
    const target = page
      .getByRole("table", { name: "Targets", exact: true })
      .getByRole("row")
      .filter({ hasText: "Synthetic demo · North Clinic" });
    await expect(target.getByText("Queued", { exact: true }).first()).toBeVisible();
    await expect(target.getByText("Succeeded", { exact: true })).toHaveCount(0);
    await target.getByRole("link", { name: "Queued", exact: true }).click();
    await expect(
      page.getByText(/Runs when the release worker claims it/u),
    ).toBeVisible();
    // Queuing is already verified in persisted state. End this test's work
    // through the real cancellation action so another run can target North.
    await page.goto(rolloutUrl);
    await page.getByRole("button", { name: "Cancel rollout", exact: true }).click();
    await dialog()
      .getByLabel(/^Reason/u)
      .fill(`${reason} finish synthetic rollout check`);
    await submit("Cancel rollout");
    await expect(
      page.getByRole("status").filter({ hasText: "Rollout cancelled." }),
    ).toBeVisible();
  });

  await test.step("support access is tenant-scoped, pending until approval, and revocable", async () => {
    const ticket = `E2E-${stamp}`;
    await page.goto(`${adminOrigin}/en/support`);
    await page
      .getByRole("button", { name: "Request support access", exact: true })
      .click();
    await dialog()
      .getByLabel(/^Tenant/u)
      .selectOption(north);
    await dialog()
      .getByLabel(/^Ticket reference/u)
      .fill(ticket);
    await dialog()
      .getByLabel(/^Reason/u)
      .fill(`${reason} read only support`);
    await submit("Send request");
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Request sent. It waits for approval." }),
    ).toBeVisible();
    await page.reload();
    const grant = page
      .getByRole("table", { name: "Support access", exact: true })
      .getByRole("row")
      .filter({ hasText: ticket });
    await expect(grant).toContainText("Synthetic demo · North Clinic");
    await expect(grant.getByText("Pending", { exact: true })).toBeVisible();
    await expect(grant.getByText("Read only", { exact: true })).toBeVisible();
    await grant.getByRole("button", { name: "End access", exact: true }).click();
    await dialog()
      .getByLabel(/^Reason/u)
      .fill(`${reason} revoke support`);
    await submit("End access");
    await expect(
      page.getByRole("status").filter({ hasText: "Support access ended." }),
    ).toBeVisible();
    await page.reload();
    await expect(grant.getByText("Revoked", { exact: true })).toBeVisible();
    await expect(
      grant.getByRole("button", { name: "End access", exact: true }),
    ).toHaveCount(0);
    // A fresh different-operator request makes approval/revocation repeatable
    // without consuming or changing a seeded request on every browser run.
    const otherTicket = `E2E-approved-${stamp}`;
    const requested = await rpc(
      "request_support_grant_v1",
      {
        p_tenant_id: north,
        p_reason: `${reason} second-operator read only support`,
        p_ticket_reference: otherTicket,
        p_minutes: 15,
      },
      await apiToken("operator", "aal2"),
    );
    expect(requested.status).toBe(200);
    await page.reload();
    const otherRequest = page
      .getByRole("table", { name: "Support access", exact: true })
      .getByRole("row")
      .filter({ hasText: otherTicket });
    await otherRequest.getByRole("button", { name: "Approve", exact: true }).click();
    await submit("Approve");
    await expect(
      page.getByRole("status").filter({ hasText: "Support access approved." }),
    ).toBeVisible();
    await page.reload();
    await expect(otherRequest.getByText("Active", { exact: true })).toBeVisible();
    await expect(otherRequest.getByText("Read only", { exact: true })).toBeVisible();
    await otherRequest.getByRole("button", { name: "End access", exact: true }).click();
    await dialog()
      .getByLabel(/^Reason/u)
      .fill(`${reason} end approved support`);
    await submit("End access");
    await expect(
      page.getByRole("status").filter({ hasText: "Support access ended." }),
    ).toBeVisible();
    await page.reload();
    await expect(otherRequest.getByText("Revoked", { exact: true })).toBeVisible();
  });

  await test.step("bilingual local settings persist while integration checks stay queued", async () => {
    const key = `demo.e2e.${stamp}`;
    await page.goto(`${adminOrigin}/en/settings`);
    await page.getByRole("button", { name: "New flag", exact: true }).click();
    await dialog().getByLabel(/^Key/u).fill(key);
    await dialog().getByLabel(/^Kind/u).selectOption("feature");
    await dialog().getByRole("checkbox", { name: "On", exact: true }).check();
    await dialog()
      .getByLabel(/^Message \(English\)/u)
      .fill(`Synthetic demo E2E flag ${stamp}`);
    await dialog()
      .getByLabel(/^Message \(Arabic\)/u)
      .fill("عرض تجريبي: إعداد محلي لاختبار الحفظ");
    await dialog()
      .getByLabel(/^Reason/u)
      .fill(`${reason} local flag`);
    await submit("New flag");
    await expect(
      page.getByRole("status").filter({ hasText: "Flag saved." }),
    ).toBeVisible();
    await page.reload();
    const flag = page
      .getByRole("table", { name: "Platform flags", exact: true })
      .getByRole("row")
      .filter({ hasText: key });
    await expect(flag.getByText("Yes", { exact: true })).toBeVisible();
    await expect(flag).toContainText("عرض تجريبي: إعداد محلي لاختبار الحفظ");
    const integration = page
      .getByRole("table", { name: "Integrations", exact: true })
      .getByRole("row")
      .filter({ has: page.getByText("vercel", { exact: true }) });
    await expect(
      integration.getByText("Not configured", { exact: true }),
    ).toBeVisible();
    const pending = integration.getByRole("link", {
      name: "Check queued — waiting for the integration worker",
      exact: true,
    });
    if (await pending.count()) {
      // Retire only this synthetic provider's old queued check so a rerun
      // exercises a new queue action without simulating a worker result.
      await pending.click();
      await page.getByRole("button", { name: "Cancel job", exact: true }).click();
      await dialog()
        .getByLabel(/^Reason/u)
        .fill(`${reason} replace old queued check`);
      await submit("Cancel job");
      await page.goto(`${adminOrigin}/en/settings`);
    }
    await integration
      .getByRole("button", { name: "Queue connection check", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({
        hasText: "Check queued. It runs when the integration worker claims it.",
      }),
    ).toBeVisible();
    await page.reload();
    await expect(
      integration.getByText("Not configured", { exact: true }),
    ).toBeVisible();
    await integration
      .getByRole("link", {
        name: "Check queued — waiting for the integration worker",
        exact: true,
      })
      .click();
    await expect(
      page.getByText(/Runs when the integration check worker claims it/u),
    ).toBeVisible();
  });
  expect(problems()).toEqual([]);
});
