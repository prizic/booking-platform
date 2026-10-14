import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { test, expect, ready } from "./journey-fixtures";
import { signInCompletion } from "./dashboard-completion-fixtures";
import { signIn } from "./platform-admin-fixtures";

test.skip(
  !process.env.WLBP_NAV_LABEL,
  "Measurement is explicitly selected after all implementation finishes",
);
test("R6 R14 comparable cold and warm route-ready navigation samples", async ({
  browser,
}) => {
  const app = process.env.WLBP_NAV_APP;
  const label = process.env.WLBP_NAV_LABEL;
  if (
    !["dashboard", "admin"].includes(app ?? "") ||
    !["before", "after"].includes(label ?? "") ||
    process.env.WLBP_EXTERNAL_SERVERS !== "1"
  )
    throw new Error(
      "Set WLBP_NAV_APP, WLBP_NAV_LABEL, WLBP_NAV_BUILD_META and WLBP_EXTERNAL_SERVERS=1",
    );
  const metadata = JSON.parse(await readFile(process.env.WLBP_NAV_BUILD_META!, "utf8"));
  expect(metadata.label).toBe(label);
  expect(metadata.application).toBe(app);
  expect(metadata.buildMode).toBe("production");
  const origin = process.env.WLBP_NAV_ORIGIN!;
  const url = new URL(origin);
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("Loopback measurement origin required");
  const repetitions = Number(process.env.WLBP_NAV_REPETITIONS ?? "9");
  if (!Number.isInteger(repetitions) || repetitions < 5 || repetitions > 30)
    throw new Error("Use 5–30 navigation repetitions");
  const locale = "en";
  const routes =
    app === "dashboard"
      ? ["today", "bookings", "customers", "services"]
      : ["tenants", "instances", "jobs", "plans"];
  const authContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
  });
  const authPage = await authContext.newPage();
  if (app === "dashboard") await signInCompletion(authPage, "admin", locale, origin);
  else await signIn(authPage, "viewer", locale, origin);
  const state = await authContext.storageState(); // Private memory only; no traces.
  const routeReady = async (page: typeof authPage, route: string) => {
    test.info().annotations.push({
      type: "journey-url",
      description: `${origin}/${locale}/${route}`,
    });
    await ready(
      page,
      route === "today" ? "Today" : route[0]!.toUpperCase() + route.slice(1),
    );
    const main = page.getByRole("main");
    if (route === "today")
      await expect(main.getByText("JRNY136ABC", { exact: true }).first()).toBeVisible();
    else
      await expect(
        main
          .getByRole("table")
          .or(main.getByRole("list"))
          .or(main.getByRole("status"))
          .first(),
      ).toBeVisible();
    if (app === "dashboard") {
      if (route === "bookings") await expect(main).toContainText("JRNY136ABC");
      if (route === "customers")
        await expect(main).toContainText(/Journey|Completion/u);
      if (route === "services")
        await expect(main).toContainText("Completion consultation");
    } else {
      if (route === "tenants" || route === "instances")
        await expect(main).toContainText("Synthetic demo");
      if (route === "jobs")
        await expect(main.getByRole("table").getByRole("row")).not.toHaveCount(1);
      if (route === "plans") await expect(main).toContainText("Launch");
    }
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      );
    });
  };
  // Prewarm all routes in the same order on both builds, outside samples.
  const prewarmStarted = performance.now();
  for (const route of routes) {
    await authPage.goto(`${origin}/${locale}/${route}`);
    await routeReady(authPage, route);
  }
  const prewarmMs = performance.now() - prewarmStarted;
  type Sample = {
    route: string;
    mode: "cold" | "warm";
    repetition: number;
    durationMs: number;
    documentChanged: boolean;
    requests: number;
    documentRequests: number;
    responseBytes: number;
    errorResponses: number;
  };
  const samples: Sample[] = [];
  const measure = async (
    page: typeof authPage,
    route: string,
    mode: "cold" | "warm",
    repetition: number,
  ) => {
    const marker = randomUUID();
    await page.evaluate(
      (value) => Object.assign(window, { __navigationIdentity: value }),
      marker,
    );
    let requests = 0,
      documentRequests = 0,
      responseBytes = 0,
      errorResponses = 0;
    const recordRequest = (request: import("@playwright/test").Request) => {
      requests++;
      if (request.isNavigationRequest()) documentRequests++;
    };
    const pending: Promise<void>[] = [];
    const recordResponse = (response: import("@playwright/test").Response) => {
      if (response.status() >= 400) errorResponses++;
      pending.push(
        response
          .body()
          .then((body) => {
            responseBytes += body.length;
          })
          .catch(() => {}),
      );
    };
    page.on("request", recordRequest);
    page.on("response", recordResponse);
    const start = performance.now();
    if (mode === "cold") await page.goto(`${origin}/${locale}/${route}`);
    else await page.locator(`nav a[href="/${locale}/${route}"]`).first().click();
    await expect(page).toHaveURL(`${origin}/${locale}/${route}`);
    await routeReady(page, route);
    const durationMs = performance.now() - start;
    const documentChanged = await page.evaluate(
      (value) =>
        (window as Window & { __navigationIdentity?: string }).__navigationIdentity !==
        value,
      marker,
    );
    page.off("request", recordRequest);
    page.off("response", recordResponse);
    await Promise.all(pending);
    samples.push({
      route,
      mode,
      repetition,
      durationMs,
      documentChanged,
      requests,
      documentRequests,
      responseBytes,
      errorResponses,
    });
  };
  for (let repetition = 0; repetition < repetitions; repetition++) {
    for (const route of routes) {
      const context = await browser.newContext({
        storageState: state,
        viewport: { width: 1440, height: 900 },
        locale: "en-US",
        serviceWorkers: "block",
      });
      await measure(await context.newPage(), route, "cold", repetition);
      await context.close();
    }
    const context = await browser.newContext({
      storageState: state,
      viewport: { width: 1440, height: 900 },
      locale: "en-US",
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    await page.goto(`${origin}/${locale}/`);
    await expect(page.getByRole("main")).toBeVisible();
    // Warm each route in this context, including the router cache when present.
    for (const route of routes) {
      await page.locator(`nav a[href="/${locale}/${route}"]`).first().click();
      await routeReady(page, route);
    }
    for (const route of routes) await measure(page, route, "warm", repetition);
    await context.close();
  }
  await authContext.close();
  const percentile = (values: number[], p: number) =>
    [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1]!;
  const summary = routes.flatMap((route) =>
    (["cold", "warm"] as const).map((mode) => {
      const group = samples.filter((s) => s.route === route && s.mode === mode);
      return {
        route,
        mode,
        count: group.length,
        medianMs: percentile(
          group.map((s) => s.durationMs),
          0.5,
        ),
        p95Ms: percentile(
          group.map((s) => s.durationMs),
          0.95,
        ),
        documentReloads: group.filter((s) => s.documentChanged).length,
      };
    }),
  );
  const output = resolve(
    process.env.WLBP_NAV_OUTPUT ??
      `.artifacts/booking-journey/navigation-${label}-${app}.json`,
  );
  await mkdir(resolve(output, ".."), { recursive: true, mode: 0o700 });
  await writeFile(
    output,
    JSON.stringify(
      {
        schemaVersion: 1,
        label,
        application: app,
        environment: {
          ...metadata,
          browser: browser.version(),
          viewport: { width: 1440, height: 900 },
          locale,
          origin,
        },
        cacheStates: {
          build: "same production build for all repetitions",
          server: "persistent; all four routes prewarmed before samples",
          cold: "new browser context per route; empty HTTP/router cache; service workers blocked",
          warm: "same context, all four routes visited first, navigation through real sidebar links",
        },
        prewarmMs,
        summary,
        samples,
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
});
