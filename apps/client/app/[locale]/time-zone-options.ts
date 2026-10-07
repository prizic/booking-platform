/**
 * Common customer time zones, Gulf and MENA first. The list only shapes the
 * picker; the availability route still validates whatever value arrives.
 */
export const commonTimeZones: readonly string[] = Object.freeze([
  "Asia/Riyadh",
  "Asia/Dubai",
  "Asia/Kuwait",
  "Asia/Qatar",
  "Asia/Bahrain",
  "Asia/Muscat",
  "Africa/Cairo",
  "Asia/Amman",
  "Asia/Beirut",
  "Asia/Baghdad",
  "Africa/Casablanca",
  "Europe/Istanbul",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Asia/Singapore",
  "Australia/Sydney",
  "UTC",
]);

export type TimeZoneOrigin = "service" | "device" | "common";

export interface TimeZoneOption {
  readonly origin: TimeZoneOrigin;
  readonly zone: string;
}

/**
 * The service location's zone first, then the visitor's device zone when it
 * differs, then the curated list, each zone once.
 */
export function timeZoneOptions(
  serviceZone: string,
  deviceZone: string | null,
): readonly TimeZoneOption[] {
  const options: TimeZoneOption[] = [{ origin: "service", zone: serviceZone }];
  if (deviceZone && deviceZone !== serviceZone) {
    options.push({ origin: "device", zone: deviceZone });
  }
  for (const zone of commonTimeZones) {
    if (!options.some((option) => option.zone === zone)) {
      options.push({ origin: "common", zone });
    }
  }
  return options;
}
