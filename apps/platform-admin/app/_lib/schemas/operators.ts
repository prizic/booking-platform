import { z } from "zod";
import { optionalInstant, reason, recordId } from "./fields";

export const operatorRoles = ["viewer", "operator", "admin", "break_glass"] as const;
const role = z.enum(operatorRoles, { error: "required" });

export const addOperatorSchema = z.object({
  email: z
    .string({ error: "required" })
    .trim()
    .min(1, { error: "required" })
    .pipe(z.email({ error: "invalid_email" })),
  role,
  expiresAt: optionalInstant,
  reason: reason(5),
});
export type AddOperatorInput = z.input<typeof addOperatorSchema>;

export const setOperatorRoleSchema = z.object({
  operatorId: recordId,
  role,
  expiresAt: optionalInstant,
  reason: reason(5),
});
export type SetOperatorRoleInput = z.input<typeof setOperatorRoleSchema>;

export const operatorStandingSchema = z.object({
  operatorId: recordId,
  reason: reason(5),
});
export type OperatorStandingInput = z.input<typeof operatorStandingSchema>;
