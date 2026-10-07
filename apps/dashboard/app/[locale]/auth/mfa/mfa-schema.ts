import { z } from "zod";

/** Authenticator factor ids, as the actions have always accepted them. */
const factorIdField = z.string().regex(/^[a-f0-9-]{36}$/iu, { error: "required" });

export const verifyAuthenticatorSchema = z.object({
  factorId: factorIdField,
  code: z
    .string()
    .trim()
    .min(1, { error: "required" })
    .regex(/^\d{6}$/u, { error: "invalid_mfa_code" }),
});
export type VerifyAuthenticatorInput = z.input<typeof verifyAuthenticatorSchema>;

/** Removing a factor is confirmed explicitly; the server also requires recent AAL2. */
export const removeAuthenticatorSchema = z.object({
  factorId: factorIdField,
  confirm: z.boolean().refine((checked) => checked, { error: "required" }),
});
export type RemoveAuthenticatorInput = z.input<typeof removeAuthenticatorSchema>;

export const cancelAuthenticatorSetupSchema = z.object({ factorId: factorIdField });
export type CancelAuthenticatorSetupInput = z.input<
  typeof cancelAuthenticatorSetupSchema
>;
