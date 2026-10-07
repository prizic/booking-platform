import { describe, expect, it } from "vitest";

import { commonTimeZones, timeZoneOptions } from "./time-zone-options";

describe("timeZoneOptions", () => {
  it("lists the service zone first, then a different device zone, each zone once", () => {
    const options = timeZoneOptions("America/New_York", "Asia/Dubai");
    expect(options.slice(0, 3)).toEqual([
      { origin: "service", zone: "America/New_York" },
      { origin: "device", zone: "Asia/Dubai" },
      { origin: "common", zone: "Asia/Riyadh" },
    ]);
    const zones = options.map((option) => option.zone);
    expect(new Set(zones).size).toBe(zones.length);
  });

  it("omits the device entry when it matches the service zone or is unknown", () => {
    expect(
      timeZoneOptions("Asia/Riyadh", "Asia/Riyadh").filter(
        (option) => option.origin === "device",
      ),
    ).toEqual([]);
    expect(timeZoneOptions("Asia/Riyadh", null)).toHaveLength(commonTimeZones.length);
  });

  it("puts Gulf zones ahead of the rest of the curated list", () => {
    expect(commonTimeZones.slice(0, 6)).toEqual([
      "Asia/Riyadh",
      "Asia/Dubai",
      "Asia/Kuwait",
      "Asia/Qatar",
      "Asia/Bahrain",
      "Asia/Muscat",
    ]);
  });
});
