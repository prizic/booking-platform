import type { DashboardMessageKey } from "../../_lib/copy";

export const settingsResultKeys = {
  "backend-unavailable": "requestsResultUnavailable",
  "invalid-request": "requestsResultInvalid",
  "not-authorized": "requestsResultNotAuthorized",
  "revision-conflict": "requestsResultConflict",
  invalid: "settingsResultInvalid",
  "unsafe-content": "brandResultUnsafe",
  saved: "settingsResultSaved",
  // Saved, but the plan did not grant everything that was asked for.
  "saved-partial": "settingsResultSavedPartial",
} as const satisfies Record<string, DashboardMessageKey>;

export const positiveSettingsResults: ReadonlySet<string> = new Set(["saved"]);
