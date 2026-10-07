import { z } from "zod";
import { integerText, reason, recordId, requiredText } from "./fields";

/** Support access lasts 5 to 480 minutes, as the dialogs have always allowed. */
const minutes = integerText({ min: 5, max: 480 });

export const requestSupportSchema = z.object({
  tenantId: recordId,
  ticket: requiredText(120),
  minutes,
  reason: reason(10),
});
export type RequestSupportInput = z.input<typeof requestSupportSchema>;

export const approveSupportSchema = z.object({ grantId: recordId, minutes });
export type ApproveSupportInput = z.input<typeof approveSupportSchema>;

export const revokeSupportSchema = z.object({ grantId: recordId, reason: reason(5) });
export type RevokeSupportInput = z.input<typeof revokeSupportSchema>;
