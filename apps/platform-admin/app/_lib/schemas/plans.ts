import { z } from "zod";
import { lineList, reason, requiredText } from "./fields";

export const savePlanSchema = z.object({
  mode: z.enum(["create", "edit"], { error: "not_found" }),
  key: requiredText(41)
    .min(2, { error: "too_short" })
    .transform((value) => value.toLowerCase()),
  name: requiredText(80),
  features: lineList.transform((features) =>
    features.map((feature) => feature.toLowerCase()),
  ),
  active: z.boolean(),
  reason: reason(5),
});
export type SavePlanInput = z.input<typeof savePlanSchema>;

/** Only a well-formed plan key is recorded as the audit target. */
export const planKeyPattern = /^[a-z][a-z0-9_-]{1,40}$/u;
