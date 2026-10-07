"use client";

import { FormRootError } from "@wlbp/ui-foundation";
import type { ActionResult } from "@wlbp/ui-foundation/actions";

/**
 * A server action that ends in `redirect()` rejects its client promise with
 * Next's navigation signal while the router performs the navigation. That is a
 * success, not a transport failure, so it must never read as "network".
 */
export function isNavigationSignal(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("digest" in error)) return false;
  const digest = (error as { digest: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_");
}

/**
 * The form-level outcome of the last submit: a refused ActionResult's code, or
 * "network" when the action could not be reached. Field errors are rendered
 * next to their fields by `FormMessage`. Must sit inside `<Form>`.
 */
export function MutationErrors({
  mutation,
  className,
}: {
  readonly mutation: {
    readonly data: ActionResult<unknown> | undefined;
    readonly error: Error | null;
  };
  readonly className?: string;
}) {
  if (mutation.data !== undefined && !mutation.data.ok) {
    return (
      <FormRootError
        code={mutation.data.formError ?? "invalid"}
        {...(className === undefined ? {} : { className })}
      />
    );
  }
  if (mutation.error !== null && !isNavigationSignal(mutation.error)) {
    return (
      <FormRootError
        code="network"
        {...(className === undefined ? {} : { className })}
      />
    );
  }
  return null;
}
