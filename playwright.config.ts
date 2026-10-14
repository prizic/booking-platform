import { defineConfig, devices } from "@playwright/test";
import {
  defaultServers,
  completionServers,
  journeyServers,
  liveBookingServers,
  a11yServers,
  platformAdminServers,
  platformAdminFaultServers,
  assertUniquePorts,
  duplicatePorts,
} from "./scripts/journey-server-profile";

assertUniquePorts(defaultServers);
assertUniquePorts(completionServers);
assertUniquePorts(journeyServers);
assertUniquePorts(liveBookingServers);
assertUniquePorts(a11yServers);
assertUniquePorts(platformAdminServers);
assertUniquePorts(platformAdminFaultServers);

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: process.env.WLBP_JOURNEY_RESULTS ?? "test-results",
  fullyParallel: true,
  // Expanded route compilation shares local Next servers; cap cold-start contention.
  timeout: 60_000,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 2,
  reporter: process.env.WLBP_JOURNEY_REPORT
    ? [["./tests/e2e/journey-reporter.ts"]]
    : process.env.CI
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
      testMatch: /(?:booking|smoke|foundation|client-journey)\.spec\.ts$/u,
      use: { screenshot: "off", trace: "off", video: "off" },
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
      testMatch: /(?:dashboard-completion|dashboard-journey)\.spec\.ts$/u,
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
      testMatch: /(?:platform-admin|admin-journey)\.spec\.ts$/u,
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
    {
      name: "navigation-metrics",
      testMatch: /navigation-metrics\.spec\.ts$/u,
      fullyParallel: false,
      timeout: 900_000,
      use: { screenshot: "off", trace: "off", video: "off" },
    },
    { name: "component", testMatch: /interactions\.spec\.ts$/u },
    { name: "i18n", testMatch: /localization\.spec\.ts$/u },
    {
      name: "a11y",
      use: { screenshot: "off", trace: "off", video: "off" },
      testMatch:
        /(?:accessibility|reduced-motion|journey-accessibility|admin-journey-accessibility)\.spec\.ts$/u,
    },
    { name: "visual", testMatch: /visual\.spec\.ts/u },
  ],
  webServer: (process.env.WLBP_EXTERNAL_SERVERS === "1"
    ? []
    : process.env.WLBP_JOURNEY_A11Y === "1"
      ? a11yServers
      : process.env.PLATFORM_ADMIN_E2E === "1"
        ? process.env.WLBP_JOURNEY_E2E === "1"
          ? platformAdminFaultServers
          : platformAdminServers
        : process.env.DASHBOARD_COMPLETION_E2E === "1"
          ? process.env.WLBP_JOURNEY_E2E === "1"
            ? journeyServers
            : completionServers
          : process.env.LIVE_BOOKING_E2E === "1"
            ? liveBookingServers
            : defaultServers
  ).map(({ command, port, reuseExistingServer, url, timeoutMs }) => ({
    command,
    // A listening Next dev socket can precede compilation of the auth page.
    // Wait for that page before authenticated Dashboard journeys begin.
    ...(url
      ? { url }
      : process.env.DASHBOARD_COMPLETION_E2E === "1" &&
          (port === 41731 || port === 41734)
        ? { url: `http://localhost:${port}/en/auth/sign-in` }
        : { port }),
    reuseExistingServer,
    timeout: timeoutMs ?? 120_000,
  })),
});
