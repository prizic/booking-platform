/**
 * Server-action contract shared by every form in every app. Server-safe: no
 * React, no "use client". A server action receives plain input, validates it
 * with the SAME Zod schema the browser form uses, and returns ActionResult.
 *
 * Validation messages are stable codes (e.g. "required"), never prose, so the
 * browser renders them in the visitor's language. Database functions remain
 * the final authority for booking, capacity, price and permissions.
 */
import type { z } from "zod";

export type FieldErrors = Readonly<Record<string, readonly string[]>>;

export type ActionResult<T = undefined> =
  | { readonly ok: true; readonly data: T; readonly message?: string }
  | {
      readonly ok: false;
      /** A form-level error code or app message key (not field-specific). */
      readonly formError?: string;
      /** Field path ("price" or "items.0.name") → error codes. */
      readonly fieldErrors?: FieldErrors;
    };

export function actionOk<T = undefined>(data?: T, message?: string): ActionResult<T> {
  return {
    ok: true,
    data: data as T,
    ...(message === undefined ? {} : { message }),
  };
}

export function actionError(
  formError?: string,
  fieldErrors?: FieldErrors,
): ActionResult<never> {
  return {
    ok: false,
    ...(formError === undefined ? {} : { formError }),
    ...(fieldErrors === undefined ? {} : { fieldErrors }),
  };
}

/** Field errors keyed by dotted path, from a Zod error. */
export function zodFieldErrors(error: z.ZodError): FieldErrors {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_form";
    (fields[key] ??= []).push(issue.message);
  }
  return fields;
}

/**
 * Validate untrusted action input against the form's schema. Server actions
 * must call this first: the browser's validation is a convenience, never trust.
 */
export function parseActionInput<S extends z.ZodType>(
  schema: S,
  input: unknown,
):
  | { readonly ok: true; readonly data: z.output<S> }
  | { readonly ok: false; readonly result: ActionResult<never> } {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, result: actionError("invalid", zodFieldErrors(parsed.error)) };
}
