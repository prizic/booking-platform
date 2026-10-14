/** Existing booking vocabulary, shared without importing the package barrel. */
export const bookingStatusesV1 = [
  "held",
  "requested",
  "pending_payment",
  "confirmed",
  "checked_in",
  "completed",
  "cancelled",
  "no_show",
  "rejected",
  "expired",
] as const;

export type BookingStatusDto = (typeof bookingStatusesV1)[number];
