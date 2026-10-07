import { z } from "zod";
import { idempotencyKey, recordId, requiredText } from "./fields";

export const addDomainSchema = z.object({
  tenantId: recordId,
  instanceId: recordId,
  hostname: requiredText(253).transform((value) => value.toLowerCase()),
  application: z.enum(["client", "dashboard"], { error: "required" }),
  idempotencyKey,
});
export type AddDomainInput = z.input<typeof addDomainSchema>;

export const requestDomainVerificationSchema = z.object({ domainId: recordId });
export type RequestDomainVerificationInput = z.input<
  typeof requestDomainVerificationSchema
>;
