"use client";

import { applyActionErrors, useActionMutation } from "@wlbp/ui-foundation";
import type { ActionResult } from "@wlbp/ui-foundation/actions";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type {
  FieldPath,
  FieldPathValue,
  FieldValues,
  UseFormReturn,
} from "react-hook-form";

import { isNavigationSignal } from "./mutation-errors";

/**
 * A Dashboard form's mutation. Field errors from the server land on their
 * fields. A refusal (stale revision, someone else decided first, ...) refreshes
 * the server-rendered page so the operator sees the current state, while the
 * form keeps every value they typed. When the action commits and redirects to
 * its outcome, the free-text fields named in `clearOnCommit` are emptied, as a
 * full page submit used to do; technical values follow the page's props.
 */
export function useWorkspaceMutation<TInput, TData, TValues extends FieldValues>(
  action: (input: TInput) => Promise<ActionResult<TData>>,
  form: UseFormReturn<TValues, unknown, unknown>,
  options: {
    readonly clearOnCommit?: readonly FieldPath<TValues>[];
    readonly onSuccess?: (
      data: TData,
      message: string | undefined,
      input: TInput,
    ) => void;
    readonly refresh?: boolean;
  } = {},
) {
  const router = useRouter();
  return useActionMutation(action, {
    ...(options.refresh === undefined ? {} : { refresh: options.refresh }),
    onFailure: (result) => {
      applyActionErrors(form, result);
      if (result.formError !== undefined && result.formError !== "invalid")
        router.refresh();
    },
    onError: (error) => {
      if (!isNavigationSignal(error)) return;
      for (const name of options.clearOnCommit ?? []) form.resetField(name);
    },
    ...(options.onSuccess === undefined ? {} : { onSuccess: options.onSuccess }),
  });
}

/**
 * Keeps a technical form value (an expected revision, the record being edited)
 * equal to what the server last rendered, without touching what the operator
 * typed. A refreshed page therefore retries against the current read.
 */
export function useSyncedValue<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
>(
  form: UseFormReturn<TValues, unknown, unknown>,
  name: TName,
  value: FieldPathValue<TValues, TName>,
): void {
  useEffect(() => {
    if (form.getValues(name) !== value) form.setValue(name, value);
  }, [form, name, value]);
}
