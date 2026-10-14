import type { Page } from "@playwright/test";
import {
  test,
  expect,
  journey,
  requireJourney,
  documentIdentity,
  ready,
  dataPage,
  customerId,
} from "./journey-fixtures";
import { completionOrigin, signInCompletion } from "./dashboard-completion-fixtures";
import { setJourneyMembershipRevoked } from "./journey-management";

test.skip(
  process.env.WLBP_JOURNEY_E2E !== "1",
  "Requires the documented isolated journey campaign",
);
test.beforeEach(requireJourney);
for (const locale of ["en", "ar"] as const) {
  test(`R6 Dashboard navigation preserves the loaded document (${locale})`, async ({
    page,
  }) => {
    await signInCompletion(page, "admin", locale);
    const sameDocument = await documentIdentity(page);
    for (const route of ["bookings", "customers", "services", "today"]) {
      await page.locator(`nav a[href="/${locale}/${route}"]`).first().click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/${route}$`));
      await ready(page);
      await sameDocument();
    }
  });
  test(`R7 fresh sign-in renders the populated Today on first navigation (${locale})`, async ({
    page,
  }) => {
    let reloads = 0;
    page.on("request", (request) => {
      if (
        request.isNavigationRequest() &&
        new URL(request.url()).pathname === `/${locale}/today`
      )
        reloads++;
    });
    await signInCompletion(page, "admin", locale);
    await expect(page).toHaveURL(new RegExp(`/${locale}/today$`));
    await expect(
      page.getByRole("main").getByText("JRNY136ABC", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("main").getByText("JRNY137ABC", { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    expect(
      reloads,
      "Sign-in must not repair Today with a second document request",
    ).toBeLessThanOrEqual(1);
  });
  test(`R8 Review request opens and focuses the selected request (${locale})`, async ({
    page,
  }) => {
    await signInCompletion(page, "admin", locale);
    const card = page.getByRole("article").filter({ hasText: "JRNY137ABC" });
    const link = card.getByRole("link", {
      name: locale === "en" ? /Review request/u : /مراجعة الطلب/u,
    });
    await expect(link).toHaveAttribute(
      "href",
      `/${locale}/requests#request-${journey.request}`,
    );
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/requests#request-${journey.request}$`));
    const request = page.locator(`#request-${journey.request}`);
    await expect(request).toContainText("JRNY137ABC");
    await expect(request).toBeFocused();
    await expect(
      request
        .getByRole("button", {
          name: locale === "en" ? /Accept|Approve/u : /قبول|موافقة/u,
        })
        .first(),
    ).toBeVisible();
  });
  test(`R10 Today puts urgent decisions before schedule and retains accessible list (${locale})`, async ({
    page,
  }) => {
    await signInCompletion(page, "admin", locale);
    const urgent = page.locator("#queue-requests");
    const schedule = page.locator("#today-schedule");
    await expect(urgent).toContainText("JRNY137ABC");
    await expect(schedule).toBeVisible();
    const scheduleHandle = await schedule.elementHandle();
    expect(
      await urgent.evaluate(
        (node, other) =>
          Boolean(
            node.compareDocumentPosition(other as Node) &
            Node.DOCUMENT_POSITION_FOLLOWING,
          ),
        scheduleHandle,
      ),
    ).toBe(true);
    await expect(
      schedule.getByRole("list").filter({ hasText: "JRNY136ABC" }),
    ).toBeVisible();
    // Other queues must follow the schedule in semantic reading order.
    for (const queue of await page
      .locator('main section[id^="queue-"]:not(#queue-requests)')
      .all()) {
      const queueHandle = await queue.elementHandle();
      expect(
        await schedule.evaluate(
          (node, other) =>
            Boolean(
              node.compareDocumentPosition(other as Node) &
              Node.DOCUMENT_POSITION_FOLLOWING,
            ),
          queueHandle,
        ),
      ).toBe(true);
    }
  });
  for (const theme of ["light", "dark"] as const) {
    test(`R11 sidebar collapse persists and remains keyboard accessible (${locale}, ${theme})`, async ({
      page,
      context,
    }) => {
      await context.addCookies([
        { name: "wlbp-theme", value: theme, url: completionOrigin },
      ]);
      await signInCompletion(page, "admin", locale);
      const collapse = page.getByRole("button", {
        name:
          locale === "en"
            ? /Collapse (?:navigation|sidebar)/u
            : /طي.*(?:التنقل|القائمة)/u,
      });
      await collapse.focus();
      await page.keyboard.press("Enter");
      const expand = page.getByRole("button", {
        name:
          locale === "en"
            ? /Expand (?:navigation|sidebar)/u
            : /توسيع.*(?:التنقل|القائمة)/u,
      });
      await expect(expand).toBeFocused();
      await expect(expand).toHaveAttribute("aria-expanded", "false");
      const bookings = page.locator(`nav a[href="/${locale}/bookings"]`).first();
      await expect(bookings).toHaveAccessibleName(/.+/u);
      await bookings.click();
      await ready(page);
      await expect(expand).toHaveAttribute("aria-expanded", "false");
      await page.reload();
      await ready(page);
      await expect(expand).toHaveAttribute("aria-expanded", "false");
      await expand.click();
      await expect(collapse).toHaveAttribute("aria-expanded", "true");
    });
  }
  test(`R11 mobile navigation sheet closes with Escape and returns focus (${locale})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInCompletion(page, "admin", locale);
    const open = page.getByRole("button", {
      name: locale === "en" ? "Open navigation menu" : "افتح قائمة التنقل",
      exact: true,
    });
    await open.click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await expect(sheet.locator(`a[href="/${locale}/services"]`)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(open).toBeFocused();
  });
}

test("R7 revoked and foreign workspace access is explicit and never empty Today", async ({
  page,
}) => {
  for (const actor of ["revoked", "foreign"] as const) {
    await page.context().clearCookies();
    await signInCompletion(page, actor);
    await expect(
      page.getByRole("heading", { name: /Access unavailable/u }),
    ).toBeVisible();
    await expect(page.getByRole("main")).not.toContainText("JRNY136ABC");
    await expect(page.getByRole("main")).not.toContainText(
      /nothing waiting|no bookings/u,
    );
  }
});
test("R7 Today read failure remains explicit on a fresh authenticated request", async ({
  page,
}) => {
  await signInCompletion(page, "admin", "en", journey.failedDashboard);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    /unavailable|could not|try again/iu,
  );
  await expect(
    page.getByRole("main").getByText(/nothing waiting|no bookings/u),
  ).toHaveCount(0);
});

test("R7 an open session loses access when its live membership is revoked", async ({
  page,
}) => {
  setJourneyMembershipRevoked(false);
  try {
    await signInCompletion(page, "journey-revocable");
    await expect(
      page.getByRole("main").getByText("JRNY136ABC", { exact: true }).first(),
    ).toBeVisible();
    setJourneyMembershipRevoked(true);
    await page.goto(`${completionOrigin}/en/bookings`);
    await expect(
      page.getByRole("heading", { name: "Access unavailable", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("main")).not.toContainText("JRNY136ABC");
  } finally {
    setJourneyMembershipRevoked(false);
  }
});
test("R9 detail includes permitted contact snapshotted intake and scoped history", async ({
  page,
}) => {
  await signInCompletion(page);
  await page.goto(`${completionOrigin}/en/bookings/${journey.booking}`);
  const main = page.getByRole("main");
  await expect(main).toContainText("Journey synthetic customer");
  await expect(main).toContainText("journey-customer@example.invalid");
  await expect(main).toContainText("Journey snapshotted intake answer");
  const history = main.getByRole("region", {
    name: /Customer history|Previous bookings/iu,
  });
  await expect(history).toContainText("JRNY138ABC");
  await expect(history).not.toContainText("FRGNBKNGXB");
  const customer = customerId();
  expect(customer).toMatch(/^[0-9a-f-]{36}$/u);
  await expect(main.locator(`a[href="/en/customers/${customer}"]`)).toBeVisible();
});
test("R9 restricted role and guessed other-tenant detail do not disclose contact or intake", async ({
  page,
}) => {
  await signInCompletion(page, "staff");
  await page.goto(`${completionOrigin}/en/bookings/${journey.booking}`);
  const main = page.getByRole("main");
  await expect(main).toContainText(/restricted|not permitted|hidden|unavailable/iu);
  await expect(main).not.toContainText("journey-customer@example.invalid");
  await expect(main).not.toContainText("Journey snapshotted intake answer");
  await expect(main.getByRole("region", { name: /Customer history/iu })).toHaveCount(0);
  await page.goto(`${completionOrigin}/en/bookings/${journey.foreign}`);
  await expect(main.getByRole("alert")).toBeVisible();
  await expect(main).not.toContainText("FRGNBKNGXB");
});

test("R9 customer processing restriction is explicit even for an administrator", async ({
  page,
}) => {
  await signInCompletion(page);
  await page.goto(
    `${completionOrigin}/en/bookings/d9510000-0000-0000-0000-000000000140`,
  );
  const main = page.getByRole("main");
  await expect(main).toContainText("JRNY140ABC");
  await expect(main).toContainText(/Restricted|restricted|limited access/u);
  await expect(main).not.toContainText("journey-restricted@example.invalid");
  await expect(main).not.toContainText("Journey snapshotted intake answer");
  await expect(
    main.getByRole("region", { name: "Customer history", exact: true }),
  ).toHaveCount(0);
});
test("R12 Services loads the seeded catalog and distinguishes filtered empty from read failure", async ({
  page,
}) => {
  await signInCompletion(page);
  await page.goto(`${completionOrigin}/en/services`);
  await expect(
    page.getByRole("main").getByRole("link", { name: /Completion consultation/u }),
  ).toBeVisible();
  await page.goto(`${completionOrigin}/en/services?q=journey-no-match`);
  await expect(page.getByRole("main")).toContainText(
    /no services|no matching|nothing matches/iu,
  );
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  await page.context().clearCookies();
  await signInCompletion(page, "admin", "en", journey.failedDashboard);
  await page.goto(`${journey.failedDashboard}/en/services`);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    /unavailable|unable|could not/iu,
  );
});

const dashboardDataRoutes = [
  "calendar",
  "bookings",
  "requests",
  "customers",
  "services",
  "categories",
  "locations",
  "team-resources",
  "roles",
  "availability",
  "payments",
  "communications",
  "reports",
  "audit",
  "integrations",
  "brand",
  "settings",
];
for (const route of dashboardDataRoutes) {
  test(`R13 ${route} follows header toolbar data and state pattern`, async ({
    page,
  }) => {
    await signInCompletion(page);
    await page.goto(`${completionOrigin}/en/${route}`);
    await dataPage(page);
  });
}
const customerUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/**
 * Customer ids from the visible desktop record table only. The mobile record
 * list repeats every action link and the header row carries none, so this reads
 * the first customer link once per data row instead of every anchor in both
 * responsive layouts.
 */
function customerRowCustomerIds(page: Page) {
  return page
    .getByRole("main")
    .getByRole("table")
    .locator("tbody tr")
    .evaluateAll(
      (rows, origin) =>
        rows
          .map(
            (row) =>
              row.querySelector('a[href*="/customers/"]')?.getAttribute("href") ?? null,
          )
          .filter((href): href is string => href !== null)
          .map(
            (href) =>
              new URL(href, origin).pathname.split("/").filter(Boolean).at(-1) ?? "",
          )
          .filter((id) => id !== ""),
      completionOrigin,
    );
}

function assertDistinctCustomerIds(ids: string[]) {
  expect(ids.length).toBeGreaterThan(0);
  expect(ids.length).toBeLessThanOrEqual(25);
  expect(new Set(ids).size, "Each customer row resolves to a unique id").toBe(
    ids.length,
  );
  for (const id of ids) expect(id).toMatch(customerUuidPattern);
}

test("R13 customer pagination keeps pages distinct and preserves empty-search recovery", async ({
  page,
}) => {
  await signInCompletion(page);
  await page.goto(`${completionOrigin}/en/customers`);
  const main = page.getByRole("main");
  const firstIds = await customerRowCustomerIds(page);
  assertDistinctCustomerIds(firstIds);
  const next = main.getByRole("link", { name: /Next page/u });
  await expect(next).toBeVisible();
  await next.click();
  await expect(page).toHaveURL(/[?&]page=2(?:[&#]|$)/u);
  const secondIds = await customerRowCustomerIds(page);
  assertDistinctCustomerIds(secondIds);
  expect(
    secondIds.filter((id) => firstIds.includes(id)),
    "The second page repeats no customer from the first",
  ).toEqual([]);
  // The 59-row fixture outruns two pages, so a third page still exists.
  await expect(main.getByRole("link", { name: /Next page/u })).toBeVisible();
  await page.goto(`${completionOrigin}/en/customers?q=journey-no-match`);
  await expect(main).toContainText(/no customer|no matching|nothing matches/iu);
  await expect(main.locator('input[name="q"]')).toHaveValue("journey-no-match");
  await expect(main.locator('[data-slot="error-state"]')).toHaveCount(0);
  await expect(main.getByRole("link", { name: /Next page/u })).toHaveCount(0);
});

test("R13 filtered customer paging keeps the query to the last page", async ({
  page,
}) => {
  await signInCompletion(page);
  const main = page.getByRole("main");
  const next = main.getByRole("link", { name: /Next page/u });
  const previous = main.getByRole("link", { name: /Previous page/u });
  const assertPageState = async (current: number, hasNext: boolean) => {
    const url = new URL(page.url());
    expect(url.searchParams.get("q")).toBe("Journey list");
    expect(url.searchParams.get("page") ?? "1").toBe(String(current));
    await expect(main.locator('input[name="q"]')).toHaveValue("Journey list");
    await expect(previous).toHaveCount(current > 1 ? 1 : 0);
    if (!hasNext) {
      // The last page states its boundary: no next link, only a disabled button.
      await expect(next).toHaveCount(0);
      await expect(main.getByRole("button", { name: /Next page/u })).toBeDisabled();
      return;
    }
    const href = await next.getAttribute("href");
    const target = new URL(href ?? "", completionOrigin);
    expect(target.searchParams.get("q")).toBe("Journey list");
    expect(target.searchParams.get("page")).toBe(String(current + 1));
  };
  await page.goto(`${completionOrigin}/en/customers?q=Journey+list`);
  const firstIds = await customerRowCustomerIds(page);
  assertDistinctCustomerIds(firstIds);
  expect(firstIds.length).toBe(25);
  await assertPageState(1, true);
  await next.click();
  await expect(page).toHaveURL(/[?&]page=2(?:[&#]|$)/u);
  const secondIds = await customerRowCustomerIds(page);
  assertDistinctCustomerIds(secondIds);
  expect(secondIds.length).toBe(25);
  expect(secondIds.filter((id) => firstIds.includes(id))).toEqual([]);
  await assertPageState(2, true);
  await next.click();
  await expect(page).toHaveURL(/[?&]page=3(?:[&#]|$)/u);
  const thirdIds = await customerRowCustomerIds(page);
  assertDistinctCustomerIds(thirdIds);
  expect(thirdIds.length).toBe(5);
  expect(
    thirdIds.filter((id) => firstIds.includes(id) || secondIds.includes(id)),
  ).toEqual([]);
  await assertPageState(3, false);
  await previous.click();
  await expect(page).toHaveURL(/[?&]page=2(?:[&#]|$)/u);
  await expect(main.locator('input[name="q"]')).toHaveValue("Journey list");
});
