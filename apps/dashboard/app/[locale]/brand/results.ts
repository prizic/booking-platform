import type { DashboardMessageKey } from "../../_lib/copy";

export const brandResultKeys = {
  "backend-unavailable": "requestsResultUnavailable",
  "invalid-request": "requestsResultInvalid",
  "not-authorized": "requestsResultNotAuthorized",
  "revision-conflict": "requestsResultConflict",
  // The two refusals this surface adds.
  "unsafe-content": "brandResultUnsafe",
  "not-publishable": "brandResultNotPublishable",
  drafted: "brandResultDrafted",
  published: "brandResultPublished",
  "rolled-back": "brandResultRolledBack",
} as const satisfies Record<string, DashboardMessageKey>;

export const positiveBrandResults: ReadonlySet<string> = new Set([
  "drafted",
  "published",
  "rolled-back",
]);
