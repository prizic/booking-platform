import { randomUUID } from "node:crypto";
import { staleStepUpIsDenied } from "./journey-operator";
import {
  test,
  expect,
  dataPage,
  documentIdentity,
  ready,
  choose,
  submitDialog,
} from "./journey-fixtures";
import {
  adminOrigin,
  signIn,
  signOut,
  apiToken,
  rpc,
  revokeApiSessions,
  revokeApiToken,
} from "./platform-admin-fixtures";

test.skip(
  process.env.WLBP_JOURNEY_E2E !== "1",
  "Requires the documented isolated journey campaign",
);
test.describe.configure({ mode: "default" });
test.setTimeout(240000);
test.beforeEach(() => {
  if (process.env.PLATFORM_ADMIN_E2E !== "1" || process.env.WLBP_JOURNEY_E2E !== "1")
    throw new Error(
      "Admin journey requires the isolated admin profile and WLBP_JOURNEY_E2E=1",
    );
});
test.afterAll(revokeApiSessions);
test.afterEach(async ({ page }) => {
  await signOut(page);
  await revokeApiSessions();
});
const fixtureInstance = "d3000000-0000-4000-8000-000000000136";
const fixtureRun = "d5000000-0000-4000-8000-000000000138";
const fixtureFailedRun = "d5000000-0000-4000-8000-000000000137";
const fixtureFailedJob = "d8000000-0000-4000-8000-000000000136";
const stamp = () => randomUUID().slice(0, 8);
const dialog = (page: Parameters<typeof signIn>[0]) =>
  page.getByRole("dialog").or(page.getByRole("alertdialog"));
async function registerTenant(page: Parameters<typeof signIn>[0], name: string) {
  await page.goto(`${adminOrigin}/en/tenants/new`);
  await page.getByLabel(/Business name|Tenant name/u).fill(name);
  await page.getByLabel(/Brand key/u).fill(`journey-${stamp()}`);
  await page.getByRole("button", { name: "Register tenant", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  const tenant = new URL(page.url()).pathname.split("/").at(-1)!;
  expect(tenant).toMatch(/^[a-f0-9-]{36}$/u);
  return tenant;
}
for (const locale of ["en", "ar"] as const) {
  test(`R14 Admin navigation preserves document and ready data (${locale})`, async ({
    page,
  }) => {
    await signIn(page, "viewer", locale);
    const same = await documentIdentity(page);
    for (const route of ["tenants", "instances", "jobs", "plans"]) {
      await page.locator(`nav a[href="/${locale}/${route}"]`).first().click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/${route}$`));
      await ready(page);
      await same();
    }
  });
}
test("R15 tenant lifecycle retains records and audits reasoned closure approval", async ({
  page,
}) => {
  await signIn(page, "admin");
  const name = `Synthetic journey tenant ${stamp()}`;
  const tenant = await registerTenant(page, name);
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await dialog(page)
    .getByLabel("Business name", { exact: true })
    .fill(`${name} renamed`);
  // The retained update_tenant_v1 contract has no reason argument.
  await expect(dialog(page).getByLabel(/^Reason/u)).toHaveCount(0);
  await dialog(page).getByRole("button", { name: "Rename", exact: true }).click();
  await expect(dialog(page)).toBeHidden();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    `${name} renamed`,
  );
  for (const action of ["Suspend", "Reactivate"]) {
    await page.getByRole("button", { name: action, exact: true }).click();
    await submitDialog(page, action, `Synthetic journey ${action.toLowerCase()}`);
    await page.reload();
    await expect(page.getByRole("main")).toContainText(
      action === "Suspend" ? "Suspended" : "Active",
    );
  }
  await page.getByRole("button", { name: "Suspend", exact: true }).click();
  await submitDialog(
    page,
    "Suspend",
    "Synthetic journey safe closure requires suspension",
  );
  await page.getByRole("button", { name: /Request closure|Close tenant/u }).click();
  await dialog(page)
    .getByLabel(/Confirm|Type.*name/u)
    .fill(`${name} renamed`);
  await submitDialog(
    page,
    "Request closure",
    "Synthetic journey tenant closure review",
  );
  await page.goto(`${adminOrigin}/en/review`);
  const row = page.getByRole("row").filter({ hasText: `${name} renamed` });
  await row.getByRole("link", { name: /Inspect|Review/u }).click();
  await expect(page.getByRole("main")).toContainText(
    "Synthetic journey tenant closure review",
  );
  const selfApprove = page.getByRole("button", { name: "Approve", exact: true });
  if (await selfApprove.count()) await expect(selfApprove).toBeDisabled();
  await expect(page.getByRole("main")).toContainText(
    /different administrator|own request|requester/u,
  );
  await signOut(page);
  await signIn(page, "admin2");
  await page.goto(`${adminOrigin}/en/review`);
  await row.getByRole("link", { name: /Inspect|Review/u }).click();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await submitDialog(page, "Approve", "Synthetic journey independent closure approval");
  await page.goto(`${adminOrigin}/en/tenants/${tenant}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    `${name} renamed`,
  );
  await expect(page.getByRole("main")).toContainText(
    /Closing|Closure requested|Closed/u,
  );
  await page.goto(
    `${adminOrigin}/en/audit?q=${encodeURIComponent("Synthetic journey independent closure approval")}`,
  );
  await expect(page.getByRole("table")).toContainText(/approved|approval/iu);
});
test("R15 instance configuration deactivate and close retain execution history", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.goto(`${adminOrigin}/en/instances/${fixtureInstance}`);
  await page
    .getByRole("button", { name: /Edit configuration|Update configuration/u })
    .click();
  await dialog(page)
    .getByLabel(/Display name/u)
    .fill("Synthetic journey instance revised");
  await submitDialog(
    page,
    "Save configuration",
    "Synthetic journey allowed instance configuration",
  );
  await page.reload();
  await expect(page.getByRole("main")).toContainText(
    "Synthetic journey instance revised",
  );
  await page.getByRole("button", { name: "Deactivate", exact: true }).click();
  await submitDialog(page, "Deactivate", "Synthetic journey instance deactivation");
  await page.reload();
  await expect(page.getByRole("main")).toContainText(/Suspended|Deactivated/u);
  await page.goto(`${adminOrigin}/en/tenants/d1000000-0000-4000-8000-000000000136`);
  await page.getByRole("button", { name: "Suspend", exact: true }).click();
  await submitDialog(
    page,
    "Suspend",
    "Synthetic journey safe instance closure suspension",
  );
  await page.goto(`${adminOrigin}/en/instances/${fixtureInstance}`);
  await page.getByRole("button", { name: /Close instance|Request closure/u }).click();
  await dialog(page)
    .getByLabel(/Confirm|Type.*ID/u)
    .fill(fixtureInstance);
  await submitDialog(page, "Request closure", "Synthetic journey instance closure");
  await page.reload();
  await expect(page.getByRole("main")).toContainText(/Pending|Closing|requested/u);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
test("R15 domains add verify and retire enforce verified replacement of an active route", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.goto(`${adminOrigin}/en/instances/d3000000-0000-4000-8000-000000000139`);
  await page.getByRole("button", { name: "Add domain", exact: true }).click();
  const hostname = `replacement-${stamp()}.journey.example.invalid`;
  await dialog(page)
    .getByLabel(/^Hostname/u)
    .fill(hostname);
  await choose(page, /Application/u, "Client");
  await expect(dialog(page).getByLabel(/^Reason/u)).toHaveCount(0);
  await dialog(page).getByRole("button", { name: "Add domain", exact: true }).click();
  await expect(dialog(page)).toBeHidden();
  await page.goto(`${adminOrigin}/en/domains?q=${encodeURIComponent(hostname)}`);
  const added = page.getByRole("row").filter({ hasText: hostname });
  await expect(added).toContainText("Pending");
  await expect(added.getByRole("link", { name: "Queued", exact: true })).toBeVisible();
  const queuedVerification = await added
    .getByRole("link", { name: "Queued", exact: true })
    .getAttribute("href");
  // Addition queues verification already; requesting from detail reuses that job.
  await added.getByRole("link", { name: hostname, exact: true }).click();
  await page.getByRole("button", { name: "Request verification", exact: true }).click();
  await expect(dialog(page).getByLabel(/^Reason/u)).toHaveCount(0);
  await dialog(page)
    .getByRole("button", { name: "Request verification", exact: true })
    .click();
  await expect(dialog(page)).toBeHidden();
  await page.goto(`${adminOrigin}/en/domains?q=${encodeURIComponent(hostname)}`);
  await expect(added).toContainText(/Queued|Pending/u);
  await expect(
    added.getByRole("link", { name: "Queued", exact: true }),
  ).toHaveAttribute("href", queuedVerification!);
  // Queued verification must never become proof of a usable replacement.
  await page.goto(`${adminOrigin}/en/domains?q=book.journey-active.example.invalid`);
  const active = page
    .getByRole("row")
    .filter({ hasText: "book.journey-active.example.invalid" });
  await active.getByRole("button", { name: /Retire|Replace/u }).click();
  await dialog(page)
    .getByRole("combobox", { name: /Replacement domain/u })
    .click();
  await expect(page.getByRole("option", { name: hostname, exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("option", {
      name: "book.journey-replacement.example.invalid",
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  // A forged choice must also fail at the authoritative RPC boundary.
  const token = await apiToken("admin", "aal2");
  const tenantRead = await rpc(
    "get_tenant_v1",
    {
      p_tenant_id: "d1000000-0000-4000-8000-000000000139",
    },
    token,
  );
  expect(tenantRead.status).toBe(200);
  const unverified = JSON.parse(tenantRead.body).domains.find(
    (domain: { hostname: string; id: string }) => domain.hostname === hostname,
  );
  expect(Boolean(unverified), "Added domain remains inspectable").toBe(true);
  for (const replacement of [unverified.id, null]) {
    const refused = await rpc(
      "request_domain_retirement_v1",
      {
        p_domain_id: "da000000-0000-4000-8000-000000000136",
        p_replacement_domain_id: replacement,
        p_reason: "Synthetic journey unverified replacement refused",
        p_idempotency_key: randomUUID(),
      },
      token,
    );
    expect(refused.status).toBeGreaterThanOrEqual(400);
    expect(refused.body).toContain(
      replacement === null
        ? "active_route_requires_replacement"
        : "replacement_domain_invalid",
    );
  }
  await page.keyboard.press("Escape");
  await expect(active).toContainText(/Serving|Yes/u);
  // The independent synthetic verified fixture is eligible for replacement.
  await active.getByRole("button", { name: /Retire|Replace/u }).click();
  await choose(page, /Replacement domain/u, "book.journey-replacement.example.invalid");
  await submitDialog(
    page,
    "Retire domain",
    "Synthetic journey verified domain replacement",
  );
  await page.reload();
  await expect(active).toContainText(/Serving|Yes/u);
  await signOut(page);
  await signIn(page, "admin2");
  await page.goto(`${adminOrigin}/en/review`);
  await page
    .getByRole("row")
    .filter({ hasText: "Synthetic journey domains" })
    .getByRole("link", { name: /Inspect|Review/u })
    .click();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await submitDialog(
    page,
    "Approve",
    "Synthetic journey independent domain cutover approval",
  );
  await page.goto(`${adminOrigin}/en/domains?q=book.journey-active.example.invalid`);
  await page.reload();
  await expect(active).toContainText(/Retired|No/u);
  await page.goto(
    `${adminOrigin}/en/domains?q=book.journey-replacement.example.invalid`,
  );
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: "book.journey-replacement.example.invalid" }),
  ).toContainText(/Serving|Yes/u);
});
test("R15 provisioning creates a workflow retries failed steps and refuses unready activation", async ({
  page,
}) => {
  await signIn(page, "admin");
  const name = `Synthetic journey provision ${stamp()}`;
  const tenant = await registerTenant(page, name);
  await page.goto(`${adminOrigin}/en/provisioning/new?tenant=${tenant}`);
  await page.getByLabel("Slug", { exact: true }).fill(`journey-${stamp()}`);
  await choose(page, "Plan", "Launch");
  await choose(page, "Release", "0.1.0 · stable");
  await page.getByLabel("Time zone", { exact: true }).fill("Asia/Riyadh");
  await page.getByLabel("Currency", { exact: true }).fill("SAR");
  await page.getByRole("button", { name: "Request provisioning", exact: true }).click();
  await expect(page).toHaveURL(/\/provisioning\/[a-f0-9-]{36}$/u);
  await expect(page.getByRole("main")).toContainText(/Pending|Validated|Waiting/u);
  await page.getByRole("button", { name: "Activate instance", exact: true }).click();
  await dialog(page)
    .getByRole("button", { name: "Activate instance", exact: true })
    .click();
  await expect(dialog(page).getByRole("alert")).toContainText(
    /blocked|requirements|not ready|cannot/u,
  );
  await page.keyboard.press("Escape");
  await page.goto(`${adminOrigin}/en/provisioning/${fixtureFailedRun}`);
  const timeline = page.getByRole("region", { name: "Timeline", exact: true });
  const before = await timeline.innerText();
  await page.getByRole("button", { name: "Retry failed steps", exact: true }).click();
  await dialog(page)
    .getByLabel(/^Reason/u)
    .fill("Synthetic journey retry preserves history");
  await dialog(page)
    .getByRole("button", { name: "Retry failed steps", exact: true })
    .click();
  await expect(dialog(page)).toBeHidden();
  await page.reload();
  for (const line of before
    .split("\n")
    .filter((line) => /github_rate_limited|Failed|failed/u.test(line)))
    await expect(timeline).toContainText(line);
  await expect(page.getByRole("main")).toContainText(/Pending|Queued|Validated/u);
});
test("R15 ready provisioning activates then deactivates and retains completed steps and events", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.goto(`${adminOrigin}/en/provisioning/${fixtureRun}`);
  await page.getByRole("button", { name: "Activate instance", exact: true }).click();
  await dialog(page)
    .getByRole("button", { name: "Activate instance", exact: true })
    .click();
  await expect(dialog(page)).toBeHidden();
  await page.reload();
  await expect(page.getByRole("main")).toContainText(/Activated|Active/u);
  await page.getByRole("button", { name: "Deactivate", exact: true }).click();
  await submitDialog(page, "Deactivate", "Synthetic journey provisioned deactivation");
  await page.reload();
  await expect(page.getByRole("main")).toContainText(/Deactivated|Suspended/u);
  await expect(
    page.getByRole("region", { name: "Timeline", exact: true }),
  ).toContainText(/Activated|activated/u);
  await expect(
    page.getByRole("table").filter({ hasText: "Create repository" }),
  ).toContainText("Succeeded");
});
test("R15 jobs retry cancel and retain attempts with workflow-owned creation", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.goto(`${adminOrigin}/en/jobs`);
  await expect(page.getByRole("button", { name: /Create job/u })).toHaveCount(0);
  await page.goto(`${adminOrigin}/en/jobs/${fixtureFailedJob}`);
  await expect(page.getByRole("main")).toContainText("github_rate_limited");
  await page.getByRole("button", { name: "Retry job", exact: true }).click();
  await submitDialog(page, "Retry job", "Synthetic journey job retry");
  await page.reload();
  await expect(page.getByRole("main")).toContainText(/Queued/u);
  await expect(page.getByRole("region", { name: "Events", exact: true })).toContainText(
    /Failed|failed/u,
  );
  await page.getByRole("button", { name: "Cancel job", exact: true }).click();
  await submitDialog(page, "Cancel job", "Synthetic journey job cancellation");
  await page.reload();
  await expect(page.getByRole("main")).toContainText("Cancelled");
  await expect(
    page.getByRole("button", { name: "Cancel job", exact: true }),
  ).toHaveCount(0);
});
test("R15 plan create update deactivate retains subscribers and audit", async ({
  page,
}) => {
  await signIn(page, "admin");
  const key = `journey-${stamp()}`;
  await page.goto(`${adminOrigin}/en/plans`);
  await page.getByRole("button", { name: "Create plan", exact: true }).click();
  await dialog(page).getByLabel(/^Key/u).fill(key);
  await dialog(page).getByLabel(/^Name/u).fill("Synthetic journey plan");
  await dialog(page)
    .getByLabel(/^Features/u)
    .fill("booking.online\nreports.operational");
  await submitDialog(page, "Create plan", "Synthetic journey plan create");
  const row = page.getByRole("row").filter({ hasText: key });
  await expect(row).toContainText("Synthetic journey plan");
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await dialog(page).getByLabel(/^Name/u).fill("Synthetic journey plan revised");
  await submitDialog(page, "Edit", "Synthetic journey plan update");
  await page.reload();
  await expect(row).toContainText("Synthetic journey plan revised");
  await page.goto(`${adminOrigin}/en/tenants/d1000000-0000-4000-8000-000000000140`);
  await page.getByRole("button", { name: "Change plan", exact: true }).click();
  await dialog(page).getByRole("combobox", { name: /^Plan/u }).click();
  await page.locator(`[role="option"][data-value="${key}"]`).click();
  await submitDialog(
    page,
    "Change plan",
    "Synthetic journey subscriber before plan retirement",
  );
  await page.goto(`${adminOrigin}/en/plans`);
  await row.getByRole("button", { name: "Deactivate", exact: true }).click();
  await submitDialog(page, "Deactivate", "Synthetic journey plan deactivation");
  await page.reload();
  await expect(row).toContainText("Inactive");
  await page.goto(`${adminOrigin}/en/subscriptions`);
  await expect(
    page.getByRole("row").filter({ hasText: "Synthetic journey subscribed" }),
  ).toContainText("Synthetic journey plan revised");
});
test("R15 Review inspects rejects with a reason and preserves decision history", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.goto(`${adminOrigin}/en/review`);
  const row = page.getByRole("row").filter({
    has: page.locator('a[href="/en/review/job/d8000000-0000-4000-8000-000000000137"]'),
  });
  await expect(row).toContainText("Synthetic journey reject");
  await row.getByRole("link", { name: /Inspect|Review/u }).click();
  await expect(page.getByRole("main")).toContainText(
    "Synthetic journey rejection request",
  );
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  const reason = dialog(page).getByLabel(/^Reason/u);
  await expect(reason).toHaveAttribute("required", "");
  await reason.fill("Synthetic journey independent rejection");
  await dialog(page).getByRole("button", { name: "Reject", exact: true }).click();
  await expect(dialog(page)).toBeHidden();
  await page.reload();
  await expect(page.getByRole("main")).toContainText("Rejected");
  await expect(page.getByRole("main")).toContainText(
    "Synthetic journey independent rejection",
  );
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(
    0,
  );
});
test("R15 direct RPC denies AAL1 role escalation invalid enum stale state and empty reason", async () => {
  const tenant = "d1000000-0000-4000-8000-000000000136";
  const base = {
    p_tenant_id: tenant,
    p_status: "suspended",
    p_reason: "Synthetic journey direct authority check",
    p_expected_status: "active",
  };
  for (const token of [
    undefined,
    await apiToken("admin", "aal1"),
    await apiToken("viewer", "aal2"),
  ]) {
    const result = await rpc("set_tenant_status_v1", base, token);
    expect(result.status).toBeGreaterThanOrEqual(400);
  }
  const admin = await apiToken("admin", "aal2");
  for (const changes of [
    { p_status: "delete_forever" },
    { p_reason: "" },
    { p_expected_status: "closed" },
  ]) {
    const result = await rpc("set_tenant_status_v1", { ...base, ...changes }, admin);
    expect(result.status).toBeGreaterThanOrEqual(400);
  }
});

test("R15 revoked operator session cannot retain sensitive write authority", async () => {
  const token = await apiToken("admin2", "aal2");
  expect((await rpc("list_tenants_v1", {}, token)).status).toBe(200);
  await revokeApiToken(token);
  const result = await rpc(
    "update_instance_configuration_v1",
    {
      p_instance_id: fixtureInstance,
      p_display_name: "Must never be saved",
      p_expected_revision: 0,
      p_reason: "Synthetic journey revoked session",
      p_idempotency_key: randomUUID(),
    },
    token,
  );
  expect(result.status).toBeGreaterThanOrEqual(400);
});

test("R15 an otherwise valid AAL2 identity with stale MFA evidence cannot mutate", async () => {
  const token = await apiToken("admin", "aal2");
  expect((await rpc("list_tenants_v1", {}, token)).status).toBe(200);
  expect(staleStepUpIsDenied(token)).toBe(true);
});

test("R15 review direct RPC enforces self approval reason enum replay and live AAL2", async () => {
  const id = "d8000000-0000-4000-8000-000000000138";
  const input = {
    p_kind: "job",
    p_id: id,
    p_decision: "approve",
    p_reason: "Synthetic journey approval boundary",
    p_idempotency_key: randomUUID(),
  };
  const requester = await apiToken("admin2", "aal2");
  const self = await rpc("decide_operator_review_v1", input, requester);
  expect(self.status).toBeGreaterThanOrEqual(400);
  expect(self.body).toContain("second_operator_required");
  const aal1 = await apiToken("admin", "aal1");
  expect(
    (await rpc("decide_operator_review_v1", input, aal1)).status,
  ).toBeGreaterThanOrEqual(400);
  const admin = await apiToken("admin", "aal2");
  for (const change of [
    { p_decision: "erase" },
    { p_kind: "tenant" },
    { p_reason: "" },
  ]) {
    const refused = await rpc(
      "decide_operator_review_v1",
      { ...input, ...change, p_idempotency_key: randomUUID() },
      admin,
    );
    expect(refused.status).toBeGreaterThanOrEqual(400);
  }
  const independentDecision = {
    ...input,
    p_decision: "reject",
    p_reason: "Synthetic journey independent replay-safe refusal",
    p_idempotency_key: randomUUID(),
  };
  const first = await rpc("decide_operator_review_v1", independentDecision, admin);
  expect(first.status).toBe(200);
  expect(JSON.parse(first.body).status).toBe("rejected");
  const replay = await rpc("decide_operator_review_v1", independentDecision, admin);
  expect(replay.status).toBe(200);
  expect(replay.body).toBe(first.body);
  const conflict = await rpc(
    "decide_operator_review_v1",
    {
      ...independentDecision,
      p_decision: "approve",
    },
    admin,
  );
  expect(conflict.status).toBeGreaterThanOrEqual(400);
  expect(conflict.body).toContain("idempotency_conflict");
  const staleDecision = await rpc(
    "decide_operator_review_v1",
    {
      ...independentDecision,
      p_idempotency_key: randomUUID(),
    },
    admin,
  );
  expect(staleDecision.status).toBeGreaterThanOrEqual(400);
  expect(staleDecision.body).toContain("transition_not_allowed");
  const retained = await rpc(
    "get_operator_review_v1",
    { p_kind: "job", p_id: id },
    admin,
  );
  expect(retained.status).toBe(200);
  const history = JSON.parse(retained.body).history as {
    action: string;
    reason: string;
  }[];
  expect(history.filter((event) => event.action === "review.rejected")).toHaveLength(1);
  expect(history.some((event) => event.reason === independentDecision.p_reason)).toBe(
    true,
  );
});

test("R15 permitted configuration write replays once and rejects key reuse with changed input", async () => {
  const token = await apiToken("admin", "aal2");
  const input = {
    p_instance_id: "d3000000-0000-4000-8000-000000000140",
    p_display_name: "Synthetic journey idempotent configuration",
    p_expected_revision: 0,
    p_reason: "Synthetic journey exact request replay",
    p_idempotency_key: randomUUID(),
  };
  const first = await rpc("update_instance_configuration_v1", input, token);
  expect(first.status).toBe(200);
  expect(JSON.parse(first.body).revision).toBe(1);
  const replay = await rpc("update_instance_configuration_v1", input, token);
  expect(replay.status).toBe(200);
  expect(replay.body).toBe(first.body);
  const conflict = await rpc(
    "update_instance_configuration_v1",
    { ...input, p_display_name: "Changed input must be refused" },
    token,
  );
  expect(conflict.status).toBeGreaterThanOrEqual(400);
  expect(conflict.body).toContain("idempotency_conflict");
});

const adminDataRoutes = [
  "tenants",
  "instances",
  "domains",
  "provisioning",
  "jobs",
  "plans",
  "review",
  "subscriptions",
  "releases",
  "rollouts",
  "health",
  "support",
  "operators",
  "audit",
  "settings",
];
for (const route of adminDataRoutes) {
  test(`R16 ${route} follows header toolbar data and state pattern`, async ({
    page,
  }) => {
    await signIn(page, "viewer");
    await page.goto(`${adminOrigin}/en/${route}`);
    await dataPage(page);
  });
}
test("R16 tenants preserve search and recover from no matches", async ({ page }) => {
  await signIn(page, "viewer");
  await page.goto(`${adminOrigin}/en/tenants?q=journey-impossible-query`);
  await expect(page.getByRole("main")).toContainText(
    /No tenants|No results|Nothing matches/u,
  );
  await expect(page.getByRole("main").locator('input[name="q"]')).toHaveValue(
    "journey-impossible-query",
  );
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});

test("R16 failed data reads remain explicit and never look like an empty fleet", async ({
  page,
}) => {
  await signIn(page, "viewer", "en", "http://localhost:41743");
  for (const route of [
    "tenants",
    "instances",
    "domains",
    "provisioning",
    "jobs",
    "plans",
    "review",
    "subscriptions",
    "releases",
    "rollouts",
    "support",
    "operators",
    "audit",
  ]) {
    await page.goto(`http://localhost:41743/en/${route}`);
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(main.locator('[data-slot="error-state"]')).toContainText(
      /unavailable|could not|unable|try again/iu,
    );
    await expect(
      main.getByText(
        /No tenants|No instances|No jobs|No plans|Nothing waiting|No approvals/u,
      ),
    ).toHaveCount(0);
    await expect(
      main
        .getByRole("button", { name: /Retry|Try again/iu })
        .or(main.getByRole("link", { name: /Retry|Try again/iu }))
        .first(),
    ).toBeVisible();
  }
});
