import { defineConfig, devices } from "@playwright/test";

const reuseDevServersInCi = Boolean(process.env.CI);

const servers = [
  {
    command: "pnpm --filter @wlbp/client exec next dev --port 41730",
    port: 41730,
    reuseExistingServer: reuseDevServersInCi,
  },
  {
    command: "pnpm --filter @wlbp/dashboard exec next dev --port 41731",
    port: 41731,
    reuseExistingServer: reuseDevServersInCi,
  },
  {
    command: "pnpm --filter @wlbp/platform-admin exec next dev --port 41732",
    port: 41732,
    reuseExistingServer: reuseDevServersInCi,
  },
  {
    command:
      "WLBP_BRAND_CONFIG_PATH=tests/e2e/fixtures/warm-brand.json WLBP_NEXT_DIST_DIR=.next-warm-client pnpm --filter @wlbp/client exec next dev --port 41733",
    port: 41733,
    reuseExistingServer: reuseDevServersInCi,
  },
  {
    command:
      "WLBP_BRAND_CONFIG_PATH=tests/e2e/fixtures/warm-brand.json WLBP_NEXT_DIST_DIR=.next-warm-dashboard pnpm --filter @wlbp/dashboard exec next dev --port 41734",
    port: 41734,
    // In CI, the warm Next dev server can outlive a prior Playwright project.
    // Reusing the healthy server avoids a race where a replacement fails with
    // EADDRINUSE and the tests then receive connection-refused errors.
    reuseExistingServer: reuseDevServersInCi,
  },
] as const;

const completionServers = [
  {
    command:
      "WLBP_NEXT_DIST_DIR=.next-completion-client node scripts/run-with-local-supabase-env.mjs client.dashboard-completion.example.invalid pnpm --filter @wlbp/client exec next dev --port 41730",
    port: 41730,
    reuseExistingServer: false,
  },
  {
    command:
      "WLBP_NEXT_DIST_DIR=.next-completion-dashboard node scripts/run-with-local-supabase-env.mjs dashboard.dashboard-completion.example.invalid pnpm --filter @wlbp/dashboard exec next dev --port 41731",
    port: 41731,
    reuseExistingServer: false,
  },
  {
    command:
      "WLBP_BRAND_CONFIG_PATH=tests/e2e/fixtures/warm-brand.json WLBP_NEXT_DIST_DIR=.next-completion-warm node scripts/run-with-local-supabase-env.mjs dashboard.dashboard-completion.example.invalid pnpm --filter @wlbp/dashboard exec next dev --port 41734",
    port: 41734,
    reuseExistingServer: false,
  },
] as const;

const liveBookingServers = [
  {
    command:
      "node scripts/run-with-local-supabase-env.mjs client.live-booking.example.invalid pnpm --filter @wlbp/client exec next dev --port 41730",
    port: 41730,
    reuseExistingServer: false,
  },
  {
    command:
      "node scripts/run-with-local-supabase-env.mjs dashboard.live-booking.example.invalid pnpm --filter @wlbp/dashboard exec next dev --port 41731",
    port: 41731,
    reuseExistingServer: false,
  },
] as const;

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results",
  fullyParallel: true,
  // Expanded route compilation shares local Next servers; cap cold-start contention.
  timeout: 60_000,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 2,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : "list",
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.01,
      scale: "css",
    },
  },
  use: {
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "e2e",
      testMatch: /(?:booking|smoke|foundation)\.spec\.ts$/u,
    },
    {
      name: "live-booking",
      // One journey compiles both applications and traverses several real RPCs.
      timeout: 180_000,
      grep: /live database booking journey/u,
      testMatch: /booking\.spec\.ts$/u,
      use: {
        screenshot: "off",
        trace: "off",
        video: "off",
      },
    },
    {
      name: "dashboard-completion",
      testMatch: /dashboard-completion\.spec\.ts$/u,
      use: {
        screenshot: "off",
        trace: "off",
        video: "off",
        actionTimeout: 60_000,
        navigationTimeout: 60_000,
      },
    },
    {
      name: "platform-admin",
      fullyParallel: false,
      testMatch: /platform-admin\.spec\.ts$/u,
      timeout: 180_000,
      // Passwords, authenticator codes and session cookies must not enter artifacts.
      use: {
        screenshot: "off",
        trace: "off",
        video: "off",
        actionTimeout: 30_000,
        navigationTimeout: 60_000,
      },
    },
    { name: "component", testMatch: /interactions\.spec\.ts$/u },
    { name: "i18n", testMatch: /localization\.spec\.ts$/u },
    {
      name: "a11y",
      testMatch: /(?:accessibility|reduced-motion)\.spec\.ts$/u,
    },
    { name: "visual", testMatch: /visual\.spec\.ts/u },
  ],
  webServer: (process.env.PLATFORM_ADMIN_E2E === "1"
    ? [
        {
          command:
            "node scripts/platform-admin-local.mjs serve --port 41742 --foreground",
          port: 41742,
          reuseExistingServer: false,
        },
      ]
    : process.env.DASHBOARD_COMPLETION_E2E === "1"
      ? completionServers
      : process.env.LIVE_BOOKING_E2E === "1"
        ? liveBookingServers
        : servers
  ).map(({ command, port, reuseExistingServer }) => ({
    command,
    port,
    reuseExistingServer,
    timeout: 120_000,
  })),
});
