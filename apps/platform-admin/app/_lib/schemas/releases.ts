import { z } from "zod";
import {
  formLocale,
  idempotencyKey,
  integerText,
  lineList,
  reason,
  recordId,
  requiredText,
  splitNotes,
} from "./fields";

export const releaseChannels = ["internal", "candidate", "stable"] as const;
export const rolloutRings = ["canary", "early", "general"] as const;

const requiredNotes = requiredText().transform(splitNotes);

export const registerReleaseSchema = z.object({
  version: requiredText(40),
  channel: z.enum(releaseChannels, { error: "required" }),
  gitCommit: requiredText(64)
    .min(40, { error: "too_short" })
    .transform((value) => value.toLowerCase()),
  configSchemaVersion: integerText(),
  backendMin: integerText(),
  backendMax: integerText(),
  migrationIds: lineList,
  featureNotes: requiredNotes,
  upgradeNotes: requiredNotes,
  reversible: z.boolean(),
  idempotencyKey,
  locale: formLocale,
});
export type RegisterReleaseInput = z.input<typeof registerReleaseSchema>;

export const setReleaseStatusSchema = z.object({
  releaseId: recordId,
  status: z.enum(["available", "withdrawn"], { error: "transition_not_allowed" }),
  reason: reason(5),
});
export type SetReleaseStatusInput = z.input<typeof setReleaseStatusSchema>;

export const createRolloutSchema = z.object({
  releaseId: recordId,
  rings: z.array(z.enum(rolloutRings, { error: "invalid" })),
  instanceIds: z.array(recordId),
  reason: reason(5),
  idempotencyKey,
  locale: formLocale,
});
export type CreateRolloutInput = z.input<typeof createRolloutSchema>;

export const rolloutSchema = z.object({ rolloutId: recordId });
export type RolloutInput = z.input<typeof rolloutSchema>;

export const rolloutWithReasonSchema = z.object({
  rolloutId: recordId,
  reason: reason(5),
});
export type RolloutWithReasonInput = z.input<typeof rolloutWithReasonSchema>;

export const rollbackRolloutSchema = z.object({
  rolloutId: recordId,
  reason: reason(10),
});
export type RollbackRolloutInput = z.input<typeof rollbackRolloutSchema>;
