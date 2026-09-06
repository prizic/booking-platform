import { describe, expect, it } from "vitest";

import {
  getTeamResourcesResultUrl,
  parseTeamResourcesRetry,
} from "./team-resources-retry";

const requestId = "a9000000-0000-4000-8000-000000000001";

describe("team resources retry identity", () => {
  it("carries the submitted form and request identity only for uncertain results", () => {
    const retry = { formId: "staff-a8000000-edit", requestId };

    expect(getTeamResourcesResultUrl("en", "backend-unavailable", retry)).toBe(
      `/en/team-resources?result=backend-unavailable&retryForm=staff-a8000000-edit&retryId=${requestId}`,
    );
    expect(getTeamResourcesResultUrl("en", "saved", retry)).toBe(
      "/en/team-resources?result=saved",
    );
  });

  it("rejects malformed or partial retry query values", () => {
    expect(parseTeamResourcesRetry("new-staff", requestId)).toEqual({
      formId: "new-staff",
      requestId,
    });
    expect(parseTeamResourcesRetry("new-staff", "not-a-uuid")).toBeUndefined();
    expect(parseTeamResourcesRetry("../new-staff", requestId)).toBeUndefined();
    expect(parseTeamResourcesRetry(undefined, requestId)).toBeUndefined();
  });
});
