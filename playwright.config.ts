import { defineConfig, devices } from "@playwright/test";

const servers = [
  { command: "pnpm --filter @wlbp/client dev", port: 3000 },
  { command: "pnpm --filter @wlbp/dashboard dev", port: 3001 },
  { command: "pnpm --filter @wlbp/platform-admin dev", port: 3002 },
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
  expect: { timeout: 10_000 },
  use: {
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "e2e", testMatch: /smoke\.spec\.ts/u },
    { name: "a11y", testMatch: /accessibility\.spec\.ts/u },
    { name: "visual", testMatch: /visual\.spec\.ts/u },
  ],
  webServer: servers.map(({ command, port }) => ({
    command,
    port,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  })),
});
