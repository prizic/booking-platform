import type { Locator, Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { chooseDate } from "./booking-fixtures";
import {
  completionOrigin,
  completionSql,
  completionTenant,
  completionRecoveryLink,
  dispatchCompletionNotifications,
  enrollCompletionMfa,
  signInCompletion,
} from "./dashboard-completion-fixtures";

// Account pages may contain MFA material; never capture failure DOM snapshots.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";
test.setTimeout(900_000);
test.beforeEach(() => {
  if (process.env.DASHBOARD_COMPLETION_E2E !== "1")
    throw new Error("This suite requires the isolated dashboard completion campaign.");
});
const field = (page: Page, name: string) =>
  page.locator(`[name="${name}"]`).filter({ visible: true });
async function submitMutation(page: Page, button: Locator) {
  const origin = new URL(page.url()).origin;
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).origin === origin,
    ),
    button.click(),
  ]);
}
/**
 * Dangerous submits open an alertdialog. The `confirm` field must stay disabled
 * until the operator confirms inside the dialog, so the action cannot carry it
 * by any other path.
 */
async function confirmDangerous(
  page: Page,
  scope: Locator,
  trigger: string,
  confirm: string,
) {
  await expect(scope.locator('input[name="confirm"]')).toBeDisabled();
  await scope.getByRole("button", { name: trigger, exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: confirm, exact: true }).click();
}
const monthNames = Array.from({ length: 12 }, (_, index) =>
  new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(2000, index, 1)),
  ),
);
/**
 * The Dashboard has no native date inputs: a date is chosen in the design
 * system's month grid, which submits the same YYYY-MM-DD under the same name.
 */
async function pickDate(page: Page, trigger: Locator, iso: string) {
  const [year, month, day] = iso.split("-").map(Number) as [number, number, number];
  const monthName = monthNames[month - 1]!;
  await trigger.click();
  // The month grid's popover, not a surrounding Dialog that hosts the picker.
  const popover = page.getByRole("dialog").filter({ has: page.getByRole("grid") });
  await expect(popover).toHaveCount(1);
  const grid = popover.getByRole("grid").first();
  for (let step = 0; step < 48; step += 1) {
    const caption = (await grid.getAttribute("aria-label")) ?? "";
    if (caption.includes(`${monthName} ${year}`)) break;
    const [shownName, shownYear] = caption.split(" ");
    const shown = Number(shownYear) * 12 + monthNames.indexOf(shownName ?? "");
    await popover
      .getByRole("button", {
        name: shown < year * 12 + month - 1 ? /next month/iu : /previous month/iu,
      })
      .click();
  }
  await popover
    .getByRole("button", {
      name: new RegExp(`${monthName} ${day}(?:st|nd|rd|th)?,? ${year}`, "u"),
    })
    .click();
  await expect(popover).toBeHidden();
}
/** A time step in a TimeSelect listbox, e.g. "13:00" is the option "1:00 PM". */
async function pickTime(page: Page, trigger: Locator, hhmm: string) {
  const [hour, minute] = hhmm.split(":").map(Number) as [number, number];
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour < 12 ? "AM" : "PM";
  await trigger.click();
  await page
    .getByRole("option", {
      name: new RegExp(`^${h12}:${String(minute).padStart(2, "0")}\\s${suffix}$`, "u"),
    })
    .click();
}
/** A date + time pair labelled `label`; it submits YYYY-MM-DDTHH:MM. */
async function pickDateTime(page: Page, scope: Locator, label: string, value: string) {
  const [date, time] = value.split("T") as [string, string];
  // Required labels carry an aria-hidden "*", so match the computed accessible name.
  await pickDate(page, scope.getByRole("button", { name: label, exact: true }), date);
  await pickTime(
    page,
    scope.getByRole("combobox", { name: `${label}, time`, exact: true }),
    time,
  );
  await expect(scope.locator(`input[type="hidden"][value="${value}"]`)).toHaveCount(1);
}
const ruleLabels = {
  weekly: "Weekly hours",
  break: "Break",
  exception: "Date override",
  blackout: "Location blackout",
  maintenance: "Resource maintenance",
} as const;
/**
 * The rule type is controlled React state: a change dispatched to the native
 * backing select before hydration is lost, so repeat it until the visible
 * trigger reports the chosen rule.
 */
async function chooseRule(form: Locator, operation: keyof typeof ruleLabels) {
  const trigger = form.getByRole("combobox", { name: "Rule type", exact: true });
  await expect(async () => {
    await form.locator('select[name="operation"]').selectOption(operation);
    await expect(trigger).toHaveText(ruleLabels[operation], { timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
}
/** Radix selects without a native backing control are chosen through the listbox. */
async function chooseOption(page: Page, trigger: Locator, name: string) {
  await trigger.click();
  await page.getByRole("option", { name, exact: true }).click();
  await expect(trigger).toContainText(name);
}

test("local recovery mail, PKCE receipt, password update and replay refusal", async ({
  page,
}) => {
  await page.goto(`${completionOrigin}/en/auth/recover`);
  await page.locator('input[name="email"]').fill("completion-recovery@example.invalid");
  await page.getByRole("button", { name: "Send recovery link", exact: true }).click();
  await expect(page.getByRole("status")).toBeVisible();
  const link = await completionRecoveryLink();
  await page.goto(link).catch(() => {
    throw new Error("Local recovery callback could not be followed");
  });
  await page.waitForURL(/\/en\/auth\/update-password$/u);
  const password = randomBytes(32).toString("base64url");
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="confirmation"]').fill(password);
  await page.getByRole("button", { name: "Save password", exact: true }).click();
  await page.waitForURL(/\/en\/auth\/sign-in$/u);
  await page.locator('input[name="email"]').fill("completion-recovery@example.invalid");
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Access unavailable", exact: true }),
  ).toBeVisible();
  await page.goto(`${completionOrigin}/en/auth/update-password`);
  await expect(page).toHaveURL(/\/auth\/recover\?error=expired$/u);
  expect(page.url()).not.toMatch(/token|code=|sb_flow_id/u);
});

test.describe("persisted workflows", () => {
  test.describe.configure({ mode: "serial" });
  test("ordered administrator journey persists catalog, access, schedule, booking, configuration and audit", async ({
    page,
  }, testInfo) => {
    await signInCompletion(page);
    await expect(
      page.getByRole("heading", { name: "Today", exact: true }),
    ).toBeVisible();
    await enrollCompletionMfa(page);
    const evidence: Record<string, string> = {};
    evidence.originalBrand = completionSql(
      `select published_brand_revision_id from app.instances where tenant_id='${completionTenant}'`,
    );
    for (const [route, key, en, ar] of [
      ["categories", "completion-category", "Completion category", "فئة الإنجاز"],
      ["locations", "completion-location", "Completion location", "موقع الإنجاز"],
    ]) {
      await page.goto(`${completionOrigin}/en/${route}/new`);
      await field(page, "key").fill(key!);
      await field(page, "name_en").fill(en!);
      await field(page, "name_ar").fill(ar!);
      await page.getByRole("button", { name: "Save draft", exact: true }).click();
      await expect(page.locator("main").getByRole("status")).toContainText(
        "Draft saved",
      );
    }
    await page.goto(`${completionOrigin}/en/services/new`);
    for (const [name, value] of Object.entries({
      key: "completion-service",
      name_en: "Completion service",
      name_ar: "خدمة الإنجاز",
      currency: "USD",
      price: "42.00",
      consent_version: "2",
      consent_en: "I agree to these synthetic terms.",
      consent_ar: "أوافق على الشروط الاصطناعية.",
    }))
      await field(page, name).fill(value);
    await field(page, "category_id").selectOption({ label: "Completion category" });
    await page.getByRole("checkbox", { name: /Live booking suite/u }).check();
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.locator("main").getByRole("status")).toContainText("Draft saved");
    expect(
      completionSql(
        `select count(*) from app.catalog_service_revisions where tenant_id='${completionTenant}' and name='Completion service' and state='published'`,
      ),
    ).toBe("0");
    await page.goto(`${completionOrigin}/en/services`);
    await confirmDangerous(
      page,
      page.locator("#publish"),
      "Publish catalog",
      "Publish now",
    );
    await expect(page.locator("main").getByRole("status")).toContainText(
      "Catalog published",
    );
    evidence.publication = completionSql(
      `select id from app.catalog_publications where tenant_id='${completionTenant}' and state='published'`,
    );
    expect(evidence.publication).toMatch(/^[a-f0-9-]{36}$/u);
    expect(
      completionSql(
        `select count(*) from app.catalog_service_revisions where tenant_id='${completionTenant}' and state='published' and price_minor=4200`,
      ),
    ).toBe("2");
    await page.goto("http://localhost:41730/en");
    await expect(
      page.getByText("Completion service", { exact: true }).first(),
    ).toBeVisible();
    await page.goto(`${completionOrigin}/en/team-resources`);
    await page
      .locator("summary")
      .filter({ hasText: /Invite staff/u })
      .first()
      .click();
    const invitation = page
      .locator("form")
      .filter({ has: page.locator('input[name="email"]') });
    await invitation
      .locator('input[name="email"]')
      .fill("completion-invite@example.invalid");
    await invitation.getByRole("checkbox").first().check();
    await submitMutation(
      page,
      invitation.getByRole("button", { name: "Invite staff", exact: true }),
    );
    await expect(invitation.getByRole("status")).toBeVisible();
    evidence.invitation = completionSql(
      `select id from app.invitations where tenant_id='${completionTenant}' and invitee_email='completion-invite@example.invalid' and status='pending'`,
    );
    expect(evidence.invitation).toMatch(/^[a-f0-9-]{36}$/u);
    await page.goto(`${completionOrigin}/en/team-resources`);
    await page
      .locator("summary")
      .filter({ hasText: /^Add resource$/u })
      .click();
    const resource = page
      .locator("form")
      .filter({ has: page.locator('input[name="formId"][value="new-resource"]') });
    await expect(resource).toBeVisible();
    await resource
      .locator('select[name="resourceTypeId"]')
      .selectOption({ label: "Completion room type" });
    await resource.locator('input[name="key"]').fill("completion-second-room");
    await resource.locator('input[name="publicName"]').fill("Completion second room");
    await resource.locator('[name="reason"]').fill("Synthetic acceptance resource");
    await resource
      .getByRole("button", { name: "Create resource", exact: true })
      .click();
    await expect(page).toHaveURL(/result=saved/u);
    expect(
      completionSql(
        `select count(*) from app.resources where tenant_id='${completionTenant}' and key='completion-second-room' and capacity=1`,
      ),
    ).toBe("1");
    const eligibility = page
      .locator("details")
      .filter({
        has: page.locator(
          'input[name="staffId"][value="d8000000-0000-0000-0000-000000000001"]',
        ),
      })
      .filter({ has: page.locator('select[name="eligible"]') });
    await eligibility.locator("summary").click();
    const eligibilityForm = eligibility.locator("form");
    await eligibilityForm
      .locator('select[name="serviceId"]')
      .selectOption({ label: "Completion service" });
    await eligibilityForm
      .locator('select[name="locationId"]')
      .selectOption({ label: "Live booking suite" });
    await eligibilityForm
      .locator('[name="reason"]')
      .fill("Synthetic acceptance eligibility");
    await submitMutation(
      page,
      eligibilityForm.getByRole("button", {
        name: "Update exact eligibility",
        exact: true,
      }),
    );
    expect(
      completionSql(
        `select count(*) from app.staff_service_locations e join app.catalog_services s on s.tenant_id=e.tenant_id and s.id=e.service_id where e.tenant_id='${completionTenant}' and s.key='completion-service' and e.staff_id='d8000000-0000-0000-0000-000000000001'`,
      ),
    ).toBe("1");
    await page.goto(`${completionOrigin}/en/availability`);
    const schedule = page
      .locator("form")
      .filter({ has: page.locator('select[name="operation"]') })
      .first();
    await chooseRule(schedule, "blackout");
    await pickDateTime(page, schedule, "Starts (local time)", "2026-12-21T09:00");
    await pickDateTime(page, schedule, "Ends (local time)", "2026-12-21T10:00");
    await schedule
      .locator('input[name="reason"]')
      .fill("Synthetic acceptance blackout");
    await schedule.getByRole("button", { name: "Save rule", exact: true }).click();
    await expect(schedule.getByRole("status")).toBeVisible();
    expect(
      completionSql(
        `select count(*) from app.blackouts where tenant_id='${completionTenant}' and reason='Synthetic acceptance blackout'`,
      ),
    ).toBe("1");
    for (const operation of ["weekly", "break", "exception", "maintenance"] as const) {
      await page.goto(`${completionOrigin}/en/availability`);
      const rule = page
        .locator("form")
        .filter({ has: page.locator('select[name="operation"]') })
        .first();
      await chooseRule(rule, operation);
      if (operation === "weekly" || operation === "break") {
        await rule
          .locator('select[name="startTime"]')
          .selectOption(operation === "weekly" ? "06:00" : "12:00");
        await rule
          .locator('select[name="endTime"]')
          .selectOption(operation === "weekly" ? "07:00" : "12:15");
      } else if (operation === "exception") {
        await pickDate(
          page,
          rule.getByRole("button", { name: "Date", exact: true }),
          "2026-12-22",
        );
        await expect(rule.locator('input[name="localDate"]')).toHaveValue("2026-12-22");
      } else {
        await rule
          .locator('select[name="locationId"]')
          .selectOption({ label: "Live booking suite · America/New_York" });
        await rule
          .locator('[name="resourceId"]')
          .selectOption({ label: "Completion room" });
        await pickDateTime(page, rule, "Starts (local time)", "2026-12-23T09:00");
        await pickDateTime(page, rule, "Ends (local time)", "2026-12-23T10:00");
        await rule.locator('[name="reason"]').fill("Synthetic acceptance maintenance");
      }
      await rule.getByRole("button", { name: "Save rule", exact: true }).click();
      await expect(rule.getByRole("status")).toBeVisible();
    }
    await page.goto(`${completionOrigin}/en/bookings/new`);
    await page.locator("#on-behalf-name").fill("Completion synthetic guest");
    await page.locator("#on-behalf-email").fill("completion-guest@example.invalid");
    await chooseOption(
      page,
      page.locator("#on-behalf-offer"),
      "Completion consultation · Live booking suite",
    );
    const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    await pickDate(page, page.locator("#on-behalf-date"), date);
    await page
      .getByRole("button", { name: "Find available times", exact: true })
      .click();
    await page
      .getByRole("radiogroup", { name: "Available time", exact: true })
      .getByRole("radio")
      .first()
      .check();
    await page.getByRole("button", { name: "Hold selected time", exact: true }).click();
    await page.locator("#intake-reason").fill("Synthetic acceptance intake");
    await page.locator("#on-behalf-consent").check();
    await page.getByRole("button", { name: "Create booking", exact: true }).click();
    await page.waitForURL(/\/bookings\/[a-f0-9-]{36}$/u);
    const bookingId = page.url().split("/").at(-1)!;
    evidence.booking = bookingId;
    expect(
      completionSql(`select count(*) from app.bookings where id='${bookingId}'`),
    ).toBe("1");
    expect(
      completionSql(
        `select count(*) from app.assignment_allocations a join app.bookings b on b.hold_id=a.hold_id where b.id='${bookingId}' and a.state='confirmed'`,
      ),
    ).toBe("1");
    await expect(
      page.getByRole("link", { name: "Customer", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Customer", exact: true }).click();
    await expect(page.getByText("Completion consultation").first()).toBeVisible();
    for (const route of [
      "bookings",
      "calendar",
      "communications",
      "payments",
      "reports",
    ]) {
      await page.goto(`${completionOrigin}/en/${route}`);
      await expect(page.locator("h1")).toBeVisible();
    }
    await page.goto(`${completionOrigin}/en/settings`);
    await field(page, "replyToEmail").fill("reply@example.invalid");
    await page.getByRole("button", { name: "Save settings", exact: true }).click();
    await expect(page.locator("main").getByRole("status")).toBeVisible();
    expect(
      completionSql(
        `select settings->>'replyToEmail' from app.tenant_settings where tenant_id='${completionTenant}'`,
      ),
    ).toBe("reply@example.invalid");
    await page.goto(`${completionOrigin}/en/brand`);
    await field(page, "name").fill("Completion revised identity");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.locator("main").getByRole("status")).toContainText(
      "The draft was saved.",
    );
    await page
      .getByRole("button", { name: "Preview saved draft", exact: true })
      .click();
    await page.waitForURL(/mode=draft/u);
    await expect(
      page.getByText("Completion studio", { exact: true }).first(),
    ).toBeVisible();
    expect(page.url()).not.toMatch(/token|code=/u);
    await enrollCompletionMfa(page);
    await page.goto(`${completionOrigin}/en/brand`);
    const publish = page
      .locator("form")
      .filter({ has: page.locator('input[name="contentHash"]') })
      .filter({ has: page.locator('input[name="confirm"]') });
    await confirmDangerous(page, publish, "Publish this draft", "Publish this draft");
    await page.waitForURL(/result=published/u);
    expect(
      completionSql(
        `select count(*) from app.brand_revisions r join app.instances i on i.published_brand_revision_id=r.id where r.tenant_id='${completionTenant}' and r.state='published' and r.config->>'name'='Completion revised identity'`,
      ),
    ).toBe("1");
    const rollback = page
      .locator("form")
      .filter({ has: page.locator('input[name="toRevision"][value="1"]') })
      .first();
    await confirmDangerous(page, rollback, "Roll back to this", "Roll back to this");
    await expect(page).toHaveURL(/result=rolled-back/u);
    expect(
      completionSql(
        `select count(*) from app.instances i join app.brand_revisions current on current.id=i.published_brand_revision_id join app.brand_revisions original on original.id='${evidence.originalBrand}' where i.tenant_id='${completionTenant}' and current.state='published' and current.revision > original.revision and current.config=original.config and current.content=original.content and current.content_hash=original.content_hash`,
      ),
    ).toBe("1");
    await page.goto(`${completionOrigin}/en/audit?stream=catalog`);
    await expect(page.locator("tbody tr").first()).toBeVisible();
    expect(await page.locator("main").innerText()).not.toContain(
      "Synthetic acceptance intake",
    );
    await testInfo.attach("persisted-references", {
      body: JSON.stringify(evidence, null, 2),
      contentType: "application/json",
    });
  });

  async function createOperatorBooking(
    page: Page,
    offer: string,
    days: number,
    email: string,
  ) {
    await page.goto(`${completionOrigin}/en/bookings/new`);
    await page.locator("#on-behalf-name").fill("Completion workflow guest");
    await page.locator("#on-behalf-email").fill(email);
    await chooseOption(
      page,
      page.locator("#on-behalf-offer"),
      `${offer} · Live booking suite`,
    );
    await pickDate(
      page,
      page.locator("#on-behalf-date"),
      new Date(Date.now() + days * 86400000).toISOString().slice(0, 10),
    );
    await page
      .getByRole("button", { name: "Find available times", exact: true })
      .click();
    await page
      .getByRole("radiogroup", { name: "Available time", exact: true })
      .getByRole("radio")
      .first()
      .check();
    await page.getByRole("button", { name: "Hold selected time", exact: true }).click();
    await page.locator("#intake-reason").fill("Synthetic workflow intake");
    await page.locator("#on-behalf-consent").check();
    await page.getByRole("button", { name: "Create booking", exact: true }).click();
    await page.waitForURL(/\/bookings\/[a-f0-9-]{36}$/u);
    return page.url().split("/").at(-1)!;
  }
  test("guest and operator requests, lifecycle, recovery and exports stay connected", async ({
    page,
  }) => {
    const attempt = randomBytes(4).toString("hex");
    const email = (label: string) => `completion-${label}-${attempt}@example.invalid`;
    await page.goto(
      "http://localhost:41730/en/book?service=d7200000-0000-0000-0000-000000000001&location=d5000000-0000-0000-0000-000000000001",
    );
    await chooseDate(
      page,
      new Date(Date.now() + 8 * 86400000).toISOString().slice(0, 10),
    );
    await page.getByRole("button", { name: /find times/iu }).click();
    await page
      .getByRole("button", { name: /^select$/iu })
      .first()
      .click();
    await page.getByRole("button", { name: /hold this time/iu }).click();
    await page.getByLabel(/full name/iu).fill("Completion anonymous guest");
    await page.getByLabel(/email/iu).fill(email("anonymous"));
    await page.getByLabel(/reason for visit/iu).fill("Synthetic guest intake");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /confirm booking/iu }).click();
    await expect(
      page.getByRole("heading", { name: /your booking is confirmed/iu }),
    ).toBeVisible();
    expect(
      completionSql(
        `select count(*) from app.bookings b join app.booking_contacts c on c.tenant_id=b.tenant_id and c.booking_id=b.id where b.tenant_id='${completionTenant}' and c.email='${email("anonymous")}' and b.status='confirmed'`,
      ),
    ).toBe("1");
    await signInCompletion(page);
    for (const [action, days, outcome] of [
      ["accept", 9, "confirmed"],
      ["reject", 10, "rejected"],
      ["propose", 11, "requested"],
    ] as const) {
      const id = await createOperatorBooking(
        page,
        "Completion request",
        days,
        email(action),
      );
      expect(completionSql(`select status from app.bookings where id='${id}'`)).toBe(
        "requested",
      );
      await page.goto(`${completionOrigin}/en/requests`);
      const form = page
        .locator("form")
        .filter({ has: page.locator(`input[name="bookingId"][value="${id}"]`) });
      await form.locator('[name="publicReason"]').fill("Synthetic request decision");
      await form.locator('[name="internalReason"]').fill("Synthetic review");
      if (action === "propose")
        await pickDateTime(
          page,
          form,
          "Suggested time",
          `${new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)}T15:00`,
        );
      await form.locator(`button[value="${action}"]`).click();
      await expect(page).toHaveURL(
        new RegExp(
          `result=${action === "accept" ? "accepted" : action === "reject" ? "rejected" : "proposed"}`,
        ),
      );
      expect(completionSql(`select status from app.bookings where id='${id}'`)).toBe(
        outcome,
      );
      expect(page.url()).not.toContain("token");
    }
    const noShowId = await createOperatorBooking(
      page,
      "Completion consultation",
      13,
      email("no-show"),
    );
    await page.locator("#transition-reason").fill("Synthetic no-show outcome");
    await submitMutation(page, page.locator('button[name="action"][value="no_show"]'));
    await expect(page).toHaveURL(/result=no-show/u);
    await expect(page.locator('input[name="expectedRevision"]')).toHaveValue("2");
    expect(
      completionSql(`select status from app.bookings where id='${noShowId}'`),
    ).toBe("no_show");
    await page.locator("#transition-reason").fill("Synthetic outcome correction");
    await submitMutation(page, page.locator('button[name="action"][value="correct"]'));
    await expect(page).toHaveURL(/result=corrected/u);
    expect(
      completionSql(`select status from app.bookings where id='${noShowId}'`),
    ).toBe("confirmed");
    for (const [action, days] of [
      ["cancel", 14],
      ["reschedule", 15],
    ] as const) {
      // Diagnostic reruns retain earlier bookings. Give each reschedule a
      // separate civil day instead of colliding with its prior successful move.
      const changeDays =
        days +
        (action === "reschedule"
          ? Number(
              completionSql(
                `select count(*) from app.booking_contacts where tenant_id='${completionTenant}' and email like 'completion-reschedule%'`,
              ),
            )
          : 0);
      const changedId = await createOperatorBooking(
        page,
        "Completion consultation",
        changeDays,
        email(action),
      );
      await page.goto(`${completionOrigin}/en/bookings`);
      // Each row opens its change form in a dialog named by the booking reference.
      const change = page
        .getByRole("dialog")
        .locator("form")
        .filter({ has: page.locator(`input[name="bookingId"][value="${changedId}"]`) });
      // A click that lands before hydration opens nothing; repeat until it does.
      await expect(async () => {
        if ((await change.count()) === 0)
          await page.locator(`button[aria-describedby="booking-${changedId}"]`).click();
        await expect(change).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 60_000 });
      await change.locator('[name="publicReason"]').fill("Synthetic booking change");
      await change.locator('[name="internalReason"]').fill("Synthetic acceptance");
      if (action === "reschedule")
        await pickDateTime(
          page,
          change,
          "New time",
          `${new Date(Date.now() + changeDays * 86400000).toISOString().slice(0, 10)}T13:00`,
        );
      await change.locator(`button[value="${action}"]`).click();
      await expect(page).toHaveURL(
        new RegExp(`result=${action === "cancel" ? "rejected" : "moved"}`),
      );
      expect(
        completionSql(
          `select ${action === "cancel" ? "status" : "to_char(starts_at at time zone location_time_zone,'HH24:MI')"} from app.bookings where id='${changedId}'`,
        ),
      ).toBe(action === "cancel" ? "cancelled" : "13:00");
      await page.goto(`${completionOrigin}/en/bookings/${changedId}`);
      await expect(page.locator("h1")).toBeVisible();
    }
    const id = await createOperatorBooking(
      page,
      "Completion consultation",
      12,
      email("lifecycle"),
    );
    await page.locator("#transition-reason").fill("Synthetic check-in override");
    await page.getByRole("button", { name: "Check in", exact: true }).click();
    await expect(page).toHaveURL(/result=checked-in/u);
    await page.locator("#transition-reason").fill("Synthetic completion");
    await page.getByRole("button", { name: "Complete", exact: true }).click();
    await expect(page).toHaveURL(/result=completed/u);
    expect(completionSql(`select status from app.bookings where id='${id}'`)).toBe(
      "completed",
    );
    await page.getByRole("link", { name: "Customer", exact: true }).click();
    await page.locator("#correct-name").fill("Completion corrected guest");
    await page
      .locator("form")
      .filter({ has: page.locator("#correct-name") })
      .getByRole("button")
      .click();
    await expect(page).toHaveURL(/result=corrected/u);
    expect(
      completionSql(
        `select full_name from app.booking_contacts where booking_id='${id}'`,
      ),
    ).toBe("Completion workflow guest");
    await enrollCompletionMfa(page);
    const customerId = completionSql(
      `select customer_id from app.booking_contacts where booking_id='${id}'`,
    );
    await page.goto(`${completionOrigin}/en/customers/${customerId}`);
    await page.locator('button[name="kind"][value="export"]').click();
    await expect(page).toHaveURL(/result=exported/u);
    await expect(page.locator("#customer-export-title")).toBeVisible();
    await page.locator("#flag-reason").fill("Synthetic privacy restriction");
    await page.locator('button[name="action"][value="restrict"]').click();
    await expect(page).toHaveURL(/result=restricted/u);
    await page.locator("#flag-reason").fill("Synthetic legal hold");
    await page.locator('button[name="action"][value="hold"]').click();
    await expect(page).toHaveURL(/result=held/u);
    await page.locator('button[name="kind"][value="deletion"]').click();
    await expect(page).toHaveURL(/result=deletion-blocked/u);
    expect(
      completionSql(
        `select status from app.privacy_requests where tenant_id='${completionTenant}' and customer_id='${customerId}' and kind='deletion' order by created_at desc limit 1`,
      ),
    ).toBe("blocked");
    dispatchCompletionNotifications(noShowId);
    await page.goto(`${completionOrigin}/en/communications`);
    // The lifecycle customer is privacy-restricted above. Retry a separate,
    // unrestricted booking so this flow preserves the suppression contract.
    const retry = page
      .locator("form")
      .filter({ has: page.locator(`input[name="bookingId"][value="${noShowId}"]`) })
      .first();
    await confirmDangerous(page, retry, "Retry email", "Retry email");
    await expect(page).toHaveURL(/result=queued/u);
    await expect(page.locator("main").getByRole("status")).toContainText(
      "Retry queued",
    );
    expect(
      completionSql(
        `select count(*) from app.notification_messages where tenant_id='${completionTenant}' and booking_id='${noShowId}' and status='queued'`,
      ),
    ).toBe("1");
    await page.goto(`${completionOrigin}/en/reports`);
    const report = page
      .locator("form")
      .filter({ has: page.locator('select[name="reportKey"]') });
    await report.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/result=exported/u);
    await page.goto(`${completionOrigin}/ar/calendar?view=list`);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.locator('form[action*="sign-out"]').getByRole("button").click();
    await page.goto(`${completionOrigin}/en/bookings/${id}`);
    await expect(page.locator("main")).not.toContainText("Completion corrected guest");
  });

  test("another actor's update refreshes protected data and revoked access is refused", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signInCompletion(page, "scheduler");
    const bookingDate = completionSql(
      `select (starts_at at time zone location_time_zone)::date from app.bookings where tenant_id='${completionTenant}' and status='confirmed' order by created_at desc limit 1`,
    );
    await page.goto(`${completionOrigin}/en/calendar?view=list&date=${bookingDate}`);
    await expect(page.getByText("Live updates connected", { exact: true })).toBeVisible(
      {
        timeout: 30000,
      },
    );
    const other = await browser.newContext();
    const contextRead = "**/rest/v1/rpc/get_dashboard_context_v1";
    await page.route(contextRead, (route) =>
      route.fulfill({ status: 503, body: "{}" }),
    );
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    const recheck = "Access must be checked again. Protected content is hidden.";
    // Shown in the workspace and announced once through the live region.
    await expect(
      page.locator("main").getByText(recheck, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: recheck }).first(),
    ).toHaveText(recheck);
    await expect(page.locator("#calendar-title")).toHaveCount(0);
    await page.unroute(contextRead);
    await page.getByRole("button", { name: "Refresh workspace", exact: true }).click();
    await expect(page.locator("#calendar-title")).toBeVisible();
    await context.setOffline(true);
    await expect(
      page.getByRole("status").filter({ hasText: "Live updates unavailable" }),
    ).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByText("Live updates connected", { exact: true })).toBeVisible(
      { timeout: 30000 },
    );
    const operator = await other.newPage();
    await signInCompletion(operator);
    const id = completionSql(
      `select id from app.bookings where tenant_id='${completionTenant}' and status='confirmed' order by created_at desc limit 1`,
    );
    await operator.goto(`${completionOrigin}/en/bookings/${id}`);
    await operator
      .locator("#transition-reason")
      .fill("Synthetic acceptance check-in override");
    await operator.getByRole("button", { name: "Check in", exact: true }).click();
    await expect(operator).toHaveURL(/result=checked-in/u);
    const changedEvent = page.getByRole("listitem").filter({
      has: page.locator(`a[href="/en/bookings/${id}"]`),
    });
    await expect(changedEvent).toContainText("Checked in", { timeout: 15000 });
    await enrollCompletionMfa(operator);
    await operator.goto(`${completionOrigin}/en/team-resources`);
    const member = operator
      .locator("li")
      .filter({
        has: operator.getByText("completion-scheduler@example.invalid", {
          exact: true,
        }),
      })
      .first();
    await member
      .locator("summary")
      .filter({ hasText: /Revoke/u })
      .click();
    await confirmDangerous(operator, member, "Revoke access", "Revoke access");
    await page.bringToFront();
    // Exercise focus/poll revalidation, without a navigation or manual reload.
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      page.getByRole("heading", { name: "Access unavailable" }).first(),
    ).toBeVisible({ timeout: 75_000 });
    await expect(page.locator('a[href$="/bookings/' + id + '"]')).toHaveCount(0);
    await context.close();
    await other.close();
  });
});

for (const actor of ["scheduler", "staff", "manager", "revoked", "foreign"] as const)
  test(`${actor} uses a real session with scoped authority`, async ({ page }) => {
    await signInCompletion(page, actor);
    if (actor === "revoked" || actor === "foreign") {
      await expect(
        page.getByRole("heading", { name: "Access unavailable" }).first(),
      ).toBeVisible();
      return;
    }
    await expect(
      page.getByRole("heading", { name: "Today", exact: true }),
    ).toBeVisible();
    await page.goto(`${completionOrigin}/en/services/new`);
    await expect(page.locator("main").getByRole("alert")).toBeVisible();
    await page.goto(`${completionOrigin}/en/audit`);
    if (actor === "staff" || actor === "scheduler")
      await expect(page.locator("main").getByRole("alert")).toBeVisible();
    const foreignId = completionSql(
      `select id from app.bookings where tenant_id <> '${completionTenant}' order by created_at desc limit 1`,
    );
    expect(foreignId).toMatch(/^[a-f0-9-]{36}$/u);
    await page.goto(`${completionOrigin}/en/bookings/${foreignId}`);
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page.locator('a[href$="/customers/' + foreignId + '"]')).toHaveCount(
      0,
    );
  });

for (const locale of ["en", "ar"] as const)
  for (const brand of ["default", "warm"] as const)
    for (const width of [1440, 390])
      test(`live ${brand} ${locale} ${width}px keyboard, errors, reflow and accessibility`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ reducedMotion: "reduce" });
        const origin = brand === "warm" ? "http://localhost:41734" : completionOrigin;
        await signInCompletion(page, "admin", locale, origin);
        for (const route of [
          "today",
          "calendar",
          "bookings",
          "services",
          "availability",
          "settings",
          "brand",
          "communications",
          "integrations",
          "audit",
          "auth/mfa",
        ]) {
          await page.goto(`${origin}/${locale}/${route}`);
          await expect(page.locator("html")).toHaveAttribute(
            "dir",
            locale === "ar" ? "rtl" : "ltr",
          );
          await expect(page.locator("h1")).toBeVisible();
          await page.keyboard.press("Tab");
          expect(
            await page.evaluate(() => document.activeElement !== document.body),
          ).toBe(true);
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
            `${brand} ${locale} ${width}px: ${route} must reflow`,
          ).toBe(true);
          const results = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze();
          expect(
            results.violations.map((v) => ({
              id: v.id,
              nodes: v.nodes.map((n) => n.target),
            })),
          ).toEqual([]);
        }
        await page.goto(`${origin}/${locale}/calendar?date=bad&view=bad&location=bad`);
        await expect(page.locator("h1")).toBeVisible();
        // 1280px at 200% browser zoom has the same 640 CSS-pixel layout viewport.
        await page.setViewportSize({ width: 640, height: 900 });
        await page.goto(`${origin}/${locale}/availability`);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        ).toBe(true);
        await page.locator("h1").evaluate(
          (heading, text) => {
            heading.textContent = text;
          },
          (locale === "ar"
            ? "عنوان عربي طويل لاختبار إعادة تدفق النص "
            : "A long workspace title that remains readable "
          ).repeat(8),
        );
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        ).toBe(true);
      });

for (const locale of ["en", "ar"] as const)
  test(`public ${locale} account forms have one landmark and accessible controls`, async ({
    page,
  }) => {
    for (const route of ["sign-in", "recover", "update-password"]) {
      await page.goto(`${completionOrigin}/${locale}/auth/${route}`);
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("h1")).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(
        results.violations.map((v) => ({
          id: v.id,
          targets: v.nodes.map((n) => n.target),
        })),
      ).toEqual([]);
    }
  });
