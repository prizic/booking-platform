import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { applicationOrigins, locales } from "./apps";

const platformContract = JSON.parse(
  readFileSync(new URL("../../platform-contract.json", import.meta.url), "utf8"),
) as {
  backendContract: { min: number; max: number };
  configSchemaVersion: number;
  whiteLabelVersion: string;
};

for (const application of applicationOrigins) {
  test(`${application.name} exposes safe release compatibility identity`, async ({
    request,
  }) => {
    const response = await request.get(
      `${application.origin}/.well-known/platform-release`,
    );

    expect(response.ok()).toBe(true);
    const identity = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(identity).sort()).toEqual([
      "application",
      "backendContract",
      "buildCommit",
      "configSchemaVersion",
      "releaseId",
      "schemaVersion",
      "whiteLabelVersion",
    ]);
    expect(identity.application).toBe(application.name);
    expect(identity.backendContract).toEqual(platformContract.backendContract);
    expect(identity.configSchemaVersion).toBe(platformContract.configSchemaVersion);
    expect(identity.whiteLabelVersion).toBe(platformContract.whiteLabelVersion);
  });

  for (const language of locales) {
    test(`${application.name} renders ${language.locale} with semantic direction`, async ({
      page,
    }) => {
      const runtimeErrors: string[] = [];
      page.on("pageerror", (error) => runtimeErrors.push(error.message));

      const response = await page.goto(`${application.origin}/${language.locale}`);

      expect(response?.ok()).toBe(true);
      await expect(page.locator("html")).toHaveAttribute("lang", language.locale);
      await expect(page.locator("html")).toHaveAttribute("dir", language.direction);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(runtimeErrors).toEqual([]);
    });
  }
}
