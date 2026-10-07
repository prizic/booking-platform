/*
 * One schema for every login-access form (invite, edit, resend, revoke): the
 * browser form validates with it and `changeStaffAccessAction` validates the
 * same input again. It produces the exact command the access RPC receives;
 * the tenant comes from the verified session, never from here.
 */
import { z } from "zod";
import { EMAIL_PATTERN, localeField, optionalUuid, uuid } from "../services/schema-kit";

export const staffAccessOperations = [
  "invite",
  "resend",
  "revoke_invitation",
  "edit_membership",
  "revoke_membership",
] as const;

export const staffAccessSchema = z
  .object({
    locale: localeField,
    operation: z.enum(staffAccessOperations, { error: "invalid" }),
    requestId: uuid,
    targetId: optionalUuid,
    expectedRevision: z.string().max(20),
    roleId: optionalUuid,
    locationIds: z.array(uuid).max(100, { error: "too_large" }),
    email: z.string().trim().max(254, { error: "too_long" }),
    /** Present only when the operator confirmed a revocation in its dialog. */
    confirm: z.literal("yes", { error: "invalid" }).optional(),
  })
  .superRefine((value, context) => {
    const issue = (path: string, message: string) =>
      context.addIssue({ code: "custom", message, path: [path] });
    if (value.operation !== "invite") {
      if (value.targetId === "") issue("targetId", "invalid");
      if (
        !/^[1-9][0-9]*$/u.test(value.expectedRevision) ||
        !Number.isSafeInteger(Number(value.expectedRevision))
      )
        issue("expectedRevision", "invalid");
    }
    if (
      (value.operation === "invite" || value.operation === "edit_membership") &&
      value.roleId === ""
    )
      issue("roleId", "required");
    if (value.operation === "invite" && !EMAIL_PATTERN.test(value.email))
      issue("email", value.email === "" ? "required" : "invalid_email");
    if (value.operation.startsWith("revoke") && value.confirm !== "yes")
      issue("confirm", "invalid");
  })
  .transform((value) => ({
    action: value.operation,
    requestId: value.requestId,
    targetId: value.targetId || null,
    roleId: value.roleId || null,
    expectedRevision: value.expectedRevision ? Number(value.expectedRevision) : null,
    locationIds: value.locationIds,
    email: value.email ? value.email.toLowerCase() : null,
  }));
export type StaffAccessInput = z.input<typeof staffAccessSchema>;
