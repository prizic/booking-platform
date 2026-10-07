import { z } from "zod";

import {
  isoDateField,
  localeField,
  nonEmptyText,
  timeZoneField,
  utcInstantField,
} from "../_lib/schema-primitives";

/** Domain code for a search submitted without a starting date. */
export const availabilityDateRequired = "availability_date_required";

/**
 * The availability search form: a starting day, the zone to show times in and
 * a party size. The browser turns the day into a seven-day window in that zone.
 */
export const availabilitySearchSchema = z.object({
  date: z
    .string({ error: availabilityDateRequired })
    .min(1, { error: availabilityDateRequired })
    .pipe(isoDateField),
  timeZone: timeZoneField,
  // The number control yields a string; coerce it deliberately.
  partySize: z.coerce
    .number({ error: "invalid_integer" })
    .int({ error: "invalid_integer" })
    .min(1, { error: "too_small" })
    .max(50, { error: "too_large" }),
});

export type AvailabilitySearchInput = z.input<typeof availabilitySearchSchema>;
export type AvailabilitySearchValues = z.output<typeof availabilitySearchSchema>;

/**
 * The query string `GET /api/availability` accepts. The browser builds its
 * request through this schema and the route validates the same schema before
 * the contract parser re-checks the window. Every value arrives as a string.
 */
export const availabilityQuerySchema = z.object({
  endBefore: utcInstantField,
  locale: localeField,
  locationId: nonEmptyText,
  partySize: z.coerce
    .number({ error: "invalid_integer" })
    .int({ error: "invalid_integer" })
    .min(1, { error: "too_small" })
    .max(50, { error: "too_large" }),
  serviceId: nonEmptyText,
  staffPreferenceId: z
    .string()
    .nullish()
    .transform((value) =>
      value === null || value === undefined || value.trim() === "" ? null : value,
    ),
  startAfter: utcInstantField,
  timeZone: timeZoneField,
});

export type AvailabilityQueryInput = z.input<typeof availabilityQuerySchema>;
