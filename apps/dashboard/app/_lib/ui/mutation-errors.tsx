"use client";

import { FormRootError, isNavigationSignal } from "@wlbp/ui-foundation";
import type { ActionResult } from "@wlbp/ui-foundation/actions";

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
