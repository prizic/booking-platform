/* One schema for the booking-email retry: the dialog-confirmed button and the server action. */
import { z } from "zod";
import { confirmed, localeField } from "../services/schema-kit";

export const communicationRetrySchema = z.object({
  locale: localeField,
  bookingId: z.string().regex(/^[a-f0-9-]{36}$/iu, { error: "invalid" }),
  confirm: confirmed,
});
export type CommunicationRetryInput = z.input<typeof communicationRetrySchema>;
