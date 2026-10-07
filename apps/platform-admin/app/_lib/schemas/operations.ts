import { z } from "zod";
import {
  asUuid,
  formLocale,
  idempotencyKey,
  optionalText,
  reason,
  recordId,
  requiredText,
} from "./fields";

/** The target select carries `tenantId|instanceId` of one provisioning instance. */
const provisioningTarget = z
  .string({ error: "required" })
  .transform((value, context) => {
    const [tenantRaw, instanceRaw] = value.split("|");
    const tenantId = asUuid(tenantRaw);
    const instanceId = asUuid(instanceRaw);
    if (!tenantId || !instanceId) {
      context.addIssue({ code: "custom", message: "not_found" });
      return z.NEVER;
    }
    return { tenantId, instanceId };
  });

const hostname = optionalText(253).transform((value) => value?.toLowerCase());

export const requestProvisioningSchema = z.object({
  target: provisioningTarget,
  releaseId: recordId,
  slug: requiredText(40)
    .min(3, { error: "too_short" })
    .transform((value) => value.toLowerCase()),
  planKey: requiredText(),
  defaultLocale: z.enum(["en", "ar"], { error: "required" }),
  timezone: requiredText(),
  currency: requiredText()
    .length(3, { error: "invalid" })
    .transform((value) => value.toUpperCase()),
  clientHostname: hostname,
  dashboardHostname: hostname,
  idempotencyKey,
  locale: formLocale,
});
export type RequestProvisioningInput = z.input<typeof requestProvisioningSchema>;

export const provisioningRunSchema = z.object({ runId: recordId });
export type ProvisioningRunInput = z.input<typeof provisioningRunSchema>;

export const deactivateRunSchema = z.object({ runId: recordId, reason: reason(10) });
export type DeactivateRunInput = z.input<typeof deactivateRunSchema>;

export const jobSchema = z.object({ jobId: recordId });
export type JobInput = z.input<typeof jobSchema>;

export const jobWithReasonSchema = z.object({ jobId: recordId, reason: reason(5) });
export type JobWithReasonInput = z.input<typeof jobWithReasonSchema>;
