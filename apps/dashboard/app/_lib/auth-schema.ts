import { z } from "zod";

import { localeField } from "./form-schema";

/**
 * The account forms. Browser-safe; each server action re-validates with the
 * same schema. The email rule is the one the actions always applied: at most
 * 254 characters, no whitespace, one "@", a dotted domain.
 */
const emailField = z
  .string()
  .min(1, { error: "required" })
  .max(254, { error: "too_long" })
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/u, { error: "invalid_email" });

export const signInSchema = z.object({
  locale: localeField,
  email: emailField,
  password: z.string().min(1, { error: "required" }).max(256, { error: "too_long" }),
  /** Re-normalized on the server; never trusted as a destination as given. */
  returnTo: z.string(),
});
export type SignInInput = z.input<typeof signInSchema>;

export const recoverSchema = z.object({
  locale: localeField,
  email: emailField,
});
export type RecoverInput = z.input<typeof recoverSchema>;

export const updatePasswordSchema = z
  .object({
    locale: localeField,
    password: z
      .string()
      .min(1, { error: "required" })
      .min(8, { error: "too_short" })
      .max(256, { error: "too_long" }),
    confirmation: z.string().min(1, { error: "required" }),
  })
  .refine((value) => value.password === value.confirmation, {
    error: "mismatch",
    path: ["confirmation"],
  });
export type UpdatePasswordInput = z.input<typeof updatePasswordSchema>;
