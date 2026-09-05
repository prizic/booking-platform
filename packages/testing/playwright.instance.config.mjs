import { defineConfig, devices } from "@playwright/test";

const servers = [
  {
    command:
      "pnpm --filter @wlbp/client exec next dev --hostname 127.0.0.1 --port 41730",
    url: "http://127.0.0.1:41730/en",
  },
  {
    command:
      "pnpm --filter @wlbp/dashboard exec next dev --hostname 127.0.0.1 --port 41731",
    url: "http://127.0.0.1:41731/en",
  },
];

const project = (name) => ({
  grep: new RegExp(`@${name}(?:\\s|$)`, "u"),
  name,
});

export default defineConfig({
  testDir: "./instance-tests",
  outputDir: "../../.artifacts/instance-playwright/test-results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [
        ["line"],
        [
          "html",
          {
            open: "never",
            outputFolder: "../../.artifacts/instance-playwright/report",
          },
        ],
      ]
    : "list",
  expect: { timeout: 10_000 },
  use: {
    ...devices["Desktop Chrome"],
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    project("e2e"),
    project("component"),
    project("i18n"),
    project("a11y"),
    project("visual"),
  ],
  webServer: servers.map(({ command, url }) => ({
    command,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url,
  })),
});
