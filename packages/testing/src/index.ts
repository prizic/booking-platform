export interface FixtureIds {
  readonly bookingId: string;
  readonly brandId: string;
  readonly instanceId: string;
  readonly locationId: string;
  readonly tenantId: string;
}

/** Safe, deterministic identifiers for non-production tests. */
export function createFixtureIds(seed = "fixture"): FixtureIds {
  if (!/^[a-z0-9-]+$/i.test(seed)) {
    throw new Error("Fixture seed may contain only letters, digits, and hyphens");
  }

  return Object.freeze({
    bookingId: `booking-${seed}`,
    brandId: `brand-${seed}`,
    instanceId: `instance-${seed}`,
    locationId: `location-${seed}`,
    tenantId: `tenant-${seed}`,
  });
}

export interface TestClock {
  readonly now: () => Date;
}

export function createFixedClock(instant: string): TestClock {
  const epochMilliseconds = Date.parse(instant);
  if (!Number.isFinite(epochMilliseconds)) {
    throw new Error("Fixed clock requires a valid instant");
  }

  return Object.freeze({
    now: () => new Date(epochMilliseconds),
  });
}

export function unreachable(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}
