import type { ReactNode } from "react";
import { toast } from "sonner";

import type { ActionResult } from "../forms/action-result.js";
import {
  formErrorCodes,
  formErrorMessage,
  type FormLocale,
} from "../forms/messages.js";
import { isNavigationSignal } from "../lib/navigation-signal.js";

/**
 * What a mutation's toast says while it runs and once it settles. A function
 * receives the outcome so a caller can reuse an action-specific success line
 * or put the refusal's localized message in the error toast. The thrown
 * (transport) failure arrives as the "network" code. An error function that
 * returns null closes the toast silently: the form handles that refusal itself
 * (e.g. a step-up challenge).
 */
export interface ActionToastCopy<TData = unknown> {
  readonly loading: ReactNode;
  readonly success:
    ReactNode | ((data: TData | undefined, message?: string) => ReactNode);
  readonly error:
    ReactNode | ((failure: { readonly code: string }) => ReactNode | null);
}

/** `undefined` and `false` both mean no toast; only a copy turns it on. */
export type ActionToastOption<TData = unknown> = ActionToastCopy<TData> | false;

const defaults: Record<
  FormLocale,
  { loading: string; success: string; error: string }
> = {
  en: { loading: "Saving…", success: "Saved", error: "Could not save" },
  ar: { loading: "جارٍ الحفظ…", success: "تم الحفظ", error: "تعذّر الحفظ" },
};

const ERROR_DURATION_MS = 8_000;

/**
 * The default "Saving… → Saved / Could not save" copy in the operator's
 * language. With `messages` (the form's code dictionary) a refusal also names
 * its reason; a generic code that only says "check this value" adds nothing
 * the inline field errors do not already say, so it is left out.
 */
export function actionToastCopy<TData = unknown>(
  locale: FormLocale,
  options: {
    readonly messages?: Readonly<Record<string, string>>;
    readonly loading?: ReactNode;
    readonly success?: ActionToastCopy<TData>["success"];
    readonly error?: ReactNode;
  } = {},
): ActionToastCopy<TData> {
  const text = defaults[locale];
  const title = options.error ?? text.error;
  return {
    loading: options.loading ?? text.loading,
    success: options.success ?? text.success,
    error: ({ code }) => {
      const known =
        options.messages?.[code] !== undefined ||
        (code !== "invalid" && (formErrorCodes as readonly string[]).includes(code));
      const reason = known
        ? formErrorMessage(code, locale, options.messages)
        : undefined;
      return reason === undefined ? (
        title
      ) : (
        <span className="grid gap-0.5">
          <span className="font-semibold">{title}</span>
          <span>{reason}</span>
        </span>
      );
    },
  };
}

/**
 * A refusal that only carries field errors from schema validation: the fields
 * already say what is wrong, so the operator gets no toast for it.
 */
export function isValidationOnlyFailure(result: ActionResult<unknown>): boolean {
  if (result.ok) return false;
  const fields = Object.keys(result.fieldErrors ?? {}).length;
  return (
    fields > 0 && (result.formError === undefined || result.formError === "invalid")
  );
}

/**
 * One mutation's toast: a loading toast now, replaced in place by its outcome.
 * Toast content never carries role="status" (on-page status messages own that
 * role); success is announced by the toaster's polite region, and an error's
 * content is an alert.
 */
export function startActionToast<TData>(copy: ActionToastCopy<TData>): {
  settle: (result: ActionResult<TData>) => void;
  fail: (error: unknown) => void;
} {
  const id = toast.loading(copy.loading);
  const succeed = (data: TData | undefined, message?: string) => {
    const content =
      typeof copy.success === "function" ? copy.success(data, message) : copy.success;
    toast.success(content, { id });
  };
  const refuse = (code: string) => {
    const content =
      typeof copy.error === "function" ? copy.error({ code }) : copy.error;
    if (content === null || content === undefined) {
      toast.dismiss(id);
      return;
    }
    toast.error(<span role="alert">{content}</span>, {
      id,
      duration: ERROR_DURATION_MS,
    });
  };
  return {
    settle: (result) => {
      if (result.ok) succeed(result.data, result.message);
      else if (isValidationOnlyFailure(result)) toast.dismiss(id);
      else refuse(result.formError ?? "invalid");
    },
    fail: (error) => {
      if (isNavigationSignal(error)) succeed(undefined);
      else refuse("network");
    },
  };
}

/** Runs a server action, with its promise toast when `toast` is a copy. */
export async function runActionWithToast<TInput, TData>(
  action: (input: TInput) => Promise<ActionResult<TData>>,
  input: TInput,
  toast: ActionToastOption<TData> | undefined,
): Promise<ActionResult<TData>> {
  if (!toast) return action(input);
  const feedback = startActionToast(toast);
  try {
    const result = await action(input);
    feedback.settle(result);
    return result;
  } catch (error) {
    feedback.fail(error);
    throw error;
  }
}
