"use client";

import type { Locale } from "@wlbp/i18n";
import {
  actionToastCopy,
  applyActionErrors,
  isNavigationSignal,
  useActionMutation,
  type ActionToastCopy,
  type ActionToastOption,
} from "@wlbp/ui-foundation";
import type { ActionResult } from "@wlbp/ui-foundation/actions";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import type {
  FieldPath,
  FieldPathValue,
  FieldValues,
  UseFormReturn,
} from "react-hook-form";

import { dashboardFormMessages } from "../form-messages";

/**
 * The Dashboard's promise toast for a create/update/delete: "Saving…" then
 * "Saved" (or the action's own success line) or "Could not save" with the
 * refusal's reason in the operator's language. On-page messages stay.
 */
export function dashboardToast<TData>(
  locale: Locale,
  options: {
    readonly messages?: Readonly<Record<string, string>>;
    readonly success?: ActionToastCopy<TData>["success"];
  } = {},
): ActionToastCopy<TData> {
  return actionToastCopy<TData>(locale, {
    messages: options.messages ?? dashboardFormMessages(locale),
    ...(options.success === undefined ? {} : { success: options.success }),
  });
}

/**
 * A Dashboard form's mutation. Field errors from the server land on their
 * fields. A refusal (stale revision, someone else decided first, ...) refreshes
 * the server-rendered page so the operator sees the current state, while the
 * form keeps every value they typed. When the action commits and redirects to
 * its outcome, the free-text fields named in `clearOnCommit` are emptied, as a
 * full page submit used to do; technical values follow the page's props.
 * A promise toast is on by default; pass `toast: false` (sign-in, workspace
 * selection) or an action-specific copy.
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
    readonly toast?: ActionToastOption<TData>;
  } = {},
) {
  const router = useRouter();
  const { locale } = useParams<{ locale: Locale }>();
  return useActionMutation(action, {
    toast: options.toast ?? dashboardToast<TData>(locale === "en" ? "en" : "ar"),
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
