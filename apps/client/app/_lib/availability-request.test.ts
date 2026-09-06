import { describe, expect, it } from "vitest";

import { parseAvailabilitySearchParams } from "./availability-request";

const valid = new URLSearchParams({
  endBefore: "2026-11-08T00:00:00.000Z",
  locale: "en",
  locationId: "location-a",
  partySize: "1",
  serviceId: "service-a",
  startAfter: "2026-11-01T00:00:00.000Z",
  timeZone: "America/New_York",
});

describe("availability query boundary", () => {
  it("accepts the shared bounded request without tenant identity", () => {
    expect(parseAvailabilitySearchParams(valid)).toMatchObject({
      partySize: 1,
      staffPreferenceId: null,
      timeZone: "America/New_York",
    });
  });

  it.each([
    ["partySize", "0"],
    ["partySize", "51"],
    ["startAfter", "2026-11-01T10:00"],
    ["endBefore", "2026-12-08T00:00:00.000Z"],
  ])("rejects invalid %s", (key, value) => {
    const query = new URLSearchParams(valid);
    query.set(key, value);
    expect(() => parseAvailabilitySearchParams(query)).toThrow("invalid_request");
  });
});
