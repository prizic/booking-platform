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
      "WLBP_BRAND_CONFIG_PATH=tests/e2e/fixtures/warm-brand.json WLBP_NEXT_DIST_DIR=.next-warm pnpm --filter @wlbp/client exec next dev --port 41733",
    port: 41733,
    reuseExistingServer: reuseDevServersInCi,
  },
  {
    command:
      "WLBP_BRAND_CONFIG_PATH=tests/e2e/fixtures/warm-brand.json WLBP_NEXT_DIST_DIR=.next-warm pnpm --filter @wlbp/dashboard exec next dev --port 41734",
    port: 41734,
    // In CI, the warm Next dev server can outlive a prior Playwright project.
    // Reusing the healthy server avoids a race where a replacement fails with
    // EADDRINUSE and the tests then receive connection-refused errors.
    reuseExistingServer: reuseDevServersInCi,
  },
] as const;

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
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
      testMatch: /(?:smoke|foundation)\.spec\.ts$/u,
    },
    { name: "component", testMatch: /interactions\.spec\.ts$/u },
    { name: "i18n", testMatch: /localization\.spec\.ts$/u },
    {
      name: "a11y",
      testMatch: /(?:accessibility|reduced-motion)\.spec\.ts$/u,
    },
    { name: "visual", testMatch: /visual\.spec\.ts/u },
  ],
  webServer: servers.map(({ command, port, reuseExistingServer }) => ({
    command,
    port,
    reuseExistingServer,
    timeout: 120_000,
  })),
});
