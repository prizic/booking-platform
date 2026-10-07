import { z } from "zod";

export const signInSchema = z.object({
  email: z
    .string({ error: "required" })
    .trim()
    .min(1, { error: "required" })
    .pipe(z.email({ error: "invalid_email" })),
  // Never trimmed: a password is exactly what was typed.
  password: z.string({ error: "required" }).min(1, { error: "required" }),
});
export type SignInInput = z.input<typeof signInSchema>;

/** A TOTP code from an authenticator app: six digits. */
export const totpCodeSchema = z.object({
  code: z
    .string({ error: "required" })
    .trim()
    .min(1, { error: "required" })
    .regex(/^\d{6}$/u, { error: "code_format" }),
});
export type TotpCodeInput = z.input<typeof totpCodeSchema>;
