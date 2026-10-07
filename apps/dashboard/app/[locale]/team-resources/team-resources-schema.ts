/*
 * One schema per Team and resources form: the browser form validates with it
 * and the server action validates the same input again before the command
 * (which re-checks capabilities and shapes) runs. Tenant and authority come
 * from the verified session, never from these values.
 */
import { z } from "zod";
import {
  KEY_PATTERN,
  localeField,
  optionalRevision,
  optionalUuid,
  uuid,
} from "../services/schema-kit";

/** Select value meaning "no linked login account" (Radix selects cannot submit ""). */
export const NO_LINKED_ACCOUNT = "none";

const FORM_ID_PATTERN = /^[a-z0-9-]{1,100}$/u;

/** What every Team and resources form carries besides its fields. */
const context = {
  locale: localeField,
  /** Which editor submitted; a retried attempt reuses its own id. */
  formId: z.string().regex(FORM_ID_PATTERN, { error: "invalid" }),
  requestId: uuid,
  reason: z
    .string()
    .trim()
    .min(1, { error: "required" })
    .max(500, { error: "too_long" }),
};

const key = z
  .string()
  .trim()
  .min(1, { error: "required" })
  .max(80, { error: "too_long" })
  .regex(KEY_PATTERN, { error: "team_key_invalid" });

const name = z
  .string()
  .trim()
  .min(1, { error: "required" })
  .max(160, { error: "too_long" });
const notes = z.string().trim().max(2000, { error: "too_long" });
const choice = z.enum(["true", "false"], { error: "invalid" });

/** A new record has neither id nor revision; an existing one has both. */
function pairedRevision<T extends { expectedRevision: number | null }>(
  value: T,
  id: string,
) {
  return (id === "") === (value.expectedRevision === null);
}

export const staffProfileSchema = z
  .object({
    ...context,
    staffId: optionalUuid,
    expectedRevision: optionalRevision,
    publicName: name,
    membershipId: z
      .union([z.literal(NO_LINKED_ACCOUNT), optionalUuid])
      .transform((value) => (value === NO_LINKED_ACCOUNT ? "" : value)),
    bio: notes,
    internalNotes: notes,
    offeredHoursPerWeek: z
      .string()
      .trim()
      .min(1, { error: "required" })
      .refine((value) => Number.isFinite(Number(value)), { error: "invalid_number" })
      .refine((value) => Number(value) > 0, { error: "too_small" })
      .refine((value) => Number(value) <= 168, { error: "too_large" }),
  })
  .refine((value) => pairedRevision(value, value.staffId), {
    error: "invalid",
    path: ["expectedRevision"],
  });
export type StaffProfileInput = z.input<typeof staffProfileSchema>;

export const resourceTypeSchema = z
  .object({
    ...context,
    resourceTypeId: optionalUuid,
    expectedRevision: optionalRevision,
    key,
    name,
    /** Resource types created here are exclusive. */
    exclusive: z.literal(true),
  })
  .refine((value) => pairedRevision(value, value.resourceTypeId), {
    error: "invalid",
    path: ["expectedRevision"],
  });
export type ResourceTypeInput = z.input<typeof resourceTypeSchema>;

export const resourceSchema = z
  .object({
    ...context,
    resourceId: optionalUuid,
    expectedRevision: optionalRevision,
    resourceTypeId: z.string().min(1, { error: "required" }).pipe(uuid),
    key,
    publicName: name,
    status: z.enum(["active", "maintenance"], { error: "invalid" }),
    internalNotes: notes,
  })
  .refine((value) => pairedRevision(value, value.resourceId), {
    error: "invalid",
    path: ["expectedRevision"],
  });
export type ResourceInput = z.input<typeof resourceSchema>;

const requiredId = z.string().min(1, { error: "required" }).pipe(uuid);

export const staffEligibilitySchema = z.object({
  ...context,
  staffId: uuid,
  serviceId: requiredId,
  locationId: requiredId,
  eligible: choice,
});
export type StaffEligibilityInput = z.input<typeof staffEligibilitySchema>;

export const resourceLocationEligibilitySchema = z.object({
  ...context,
  resourceId: uuid,
  locationId: requiredId,
  eligible: choice,
});
export type ResourceLocationEligibilityInput = z.input<
  typeof resourceLocationEligibilitySchema
>;

export const resourceRequirementSchema = z
  .object({
    ...context,
    serviceId: requiredId,
    resourceTypeId: optionalUuid,
    required: choice,
  })
  .refine((value) => value.required === "false" || value.resourceTypeId !== "", {
    error: "required",
    path: ["resourceTypeId"],
  });
export type ResourceRequirementInput = z.input<typeof resourceRequirementSchema>;

const resolution = z.enum(["defer", "cancel", "reassign"], { error: "invalid" });

export const staffDeactivationSchema = z
  .object({
    ...context,
    staffId: uuid,
    resolution,
    replacementStaffId: optionalUuid,
  })
  .refine(
    (value) =>
      value.resolution !== "reassign" ||
      (value.replacementStaffId !== "" && value.replacementStaffId !== value.staffId),
    { error: "required", path: ["replacementStaffId"] },
  );
export type StaffDeactivationInput = z.input<typeof staffDeactivationSchema>;

export const resourceDeactivationSchema = z
  .object({
    ...context,
    resourceId: uuid,
    resolution,
    replacementResourceId: optionalUuid,
  })
  .refine(
    (value) =>
      value.resolution !== "reassign" ||
      (value.replacementResourceId !== "" &&
        value.replacementResourceId !== value.resourceId),
    { error: "required", path: ["replacementResourceId"] },
  );
export type ResourceDeactivationInput = z.input<typeof resourceDeactivationSchema>;
