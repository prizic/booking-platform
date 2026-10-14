import { z } from "zod";

export const recoveryFormSchema = z.strictObject({
  email: z
    .string({ error: "recovery_email_invalid" })
    .trim()
    .toLowerCase()
    .max(320, { error: "recovery_email_invalid" })
    .regex(/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/u, {
      error: "recovery_email_invalid",
    }),
});
export const recoveryRequestSchema = recoveryFormSchema.extend({
  requestId: z.uuid({ error: "invalid" }),
});
export type RecoveryFormInput = z.input<typeof recoveryFormSchema>;
