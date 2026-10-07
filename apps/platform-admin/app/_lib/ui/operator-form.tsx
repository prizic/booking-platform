"use client";

import type { Locale } from "@wlbp/i18n";
import {
  Alert,
  Button,
  actionToastCopy,
  FieldSet,
  Form,
  FormRootError,
  applyActionErrors,
  cn,
  useActionMutation,
  useZodForm,
} from "@wlbp/ui-foundation";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useWatch, type FieldErrors, type FieldValues } from "react-hook-form";
import { copyFor, formCopy, reasonCopy, say } from "../copy";
import { operatorFormMessages } from "../form-messages";
import {
  failureReasons,
  stepUpCode,
  type OperatorActionResult,
  type OperatorOutcome,
} from "../operator-result";
import {
  operations,
  type OperationInput,
  type OperationKey,
  type OperationSpec,
} from "../schemas";
import { useActionFeedback } from "./action-feedback";
import { operationActions } from "./operation-actions";
import { StepUpPrompt } from "./step-up-prompt";

type Input = Record<string, unknown>;
type Failure = { code: string; reasons: readonly string[] };

function download({ filename, body }: { filename: string; body: string }) {
  const url = URL.createObjectURL(new Blob([body], { type: "text/csv;charset=utf-8" }));
  const link = Object.assign(document.createElement("a"), {
    href: url,
    download: filename,
  });
  link.click();
  URL.revokeObjectURL(url);
}

/** Values the page supplies that have no visible control. */
const technicalKeys = ["locale", "idempotencyKey"];

/** Starting values keyed by the operation schema fields; the schema validates them. */
export type OperationValues<K extends OperationKey> = {
  [P in keyof OperationInput<K>]?: unknown;
};

export type OperatorFormProps<K extends OperationKey> = {
  locale: Locale;
  /** Which mutation: picks the shared Zod schema and the server action. */
  operation: K;
  submit: string;
  successMessage: string;
  danger?: boolean;
  children?: ReactNode;
  /** Starting values for the visible fields. */
  values?: OperationValues<K>;
  /** Technical values (ids, expected revisions) sent without a control. */
  hidden?: OperationValues<K>;
  onSuccess?: () => void;
  /** Submit stays disabled until the `confirmation` field equals this text. */
  confirmText?: string;
  className?: string;
  /** A single small action, e.g. inside a table row. */
  compact?: boolean;
  /** Sits beside the submit button (a dialog's Cancel). */
  secondaryAction?: ReactNode;
};

/**
 * One form behaviour for every Platform Admin mutation: React Hook Form with
 * the operation's Zod schema (the server action re-validates with the same
 * schema), a React Query mutation, error codes rendered in the form's
 * language, a step-up challenge that re-sends the same submission (same
 * idempotency key), and a success that navigates, downloads, or announces.
 * A promise toast ("Saving…" then the success message or "Could not save"
 * with the reason) runs alongside; the on-page alerts stay authoritative.
 *
 * Operator standing, MFA, step-up freshness and two-person rules are decided
 * by the database; this kit only presents the outcome.
 */
export function OperatorForm<K extends OperationKey>({
  locale,
  operation,
  submit,
  successMessage,
  danger,
  children,
  values,
  hidden,
  onSuccess,
  confirmText,
  className,
  compact,
  secondaryAction,
}: OperatorFormProps<K>) {
  const spec: OperationSpec = operations[operation];
  const action = operationActions[operation] as unknown as (
    input: Input,
  ) => Promise<OperatorActionResult>;
  // Generated once per mount: a dialog mounts its form on every open, and a
  // retry of the same submission re-sends the same key.
  const [defaults] = useState<Input>(() => ({
    ...(values as Input | undefined),
    ...(hidden as Input | undefined),
    locale,
    ...(spec.idempotent ? { idempotencyKey: crypto.randomUUID() } : {}),
  }));
  const technical = useMemo(
    () => new Set([...technicalKeys, ...Object.keys(hidden ?? {})]),
    [hidden],
  );
  const form = useZodForm(spec.schema, { defaultValues: defaults as never });
  const messages = useMemo(() => operatorFormMessages(locale), [locale]);
  const toast = useMemo(() => {
    const copy = actionToastCopy<OperatorOutcome>(locale, {
      messages,
      success: successMessage,
    });
    const error = copy.error as (failure: { code: string }) => ReactNode;
    // The step-up prompt below is the response to that refusal, not an error.
    return {
      ...copy,
      error: ({ code }: { code: string }) =>
        code === stepUpCode ? null : error({ code }),
    };
  }, [locale, messages, successMessage]);
  const router = useRouter();
  const pathname = usePathname();
  const announce = useActionFeedback()?.announce;
  const lastInput = useRef<Input | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [stepUp, setStepUp] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const typed: unknown = useWatch({
    control: form.control,
    name: "confirmation" as never,
  });

  const mutation = useActionMutation<Input, OperatorOutcome>(action, {
    // Navigation or a refresh is chosen per result below.
    refresh: false,
    toast,
    onFailure: (result) => {
      if (result.formError === stepUpCode) {
        setStepUp(true);
        return;
      }
      applyActionErrors(form, result);
      // An error on a value without a control (a stale id) is a form-level problem.
      const technicalError = Object.entries(result.fieldErrors ?? {}).find(([key]) =>
        technical.has(key),
      )?.[1][0];
      setFailure({
        code:
          technicalError ??
          (result.formError === "invalid"
            ? "fields_invalid"
            : (result.formError ?? "unavailable")),
        reasons: failureReasons(result),
      });
    },
    onSuccess: (data) => {
      if (data?.download) download(data.download);
      announce?.(successMessage, data?.href?.split("?")[0] ?? pathname);
      onSuccess?.();
      if (data?.href) router.push(data.href);
      else router.refresh();
      if (!data?.href && !onSuccess && !announce) setSucceeded(true);
    },
  });

  function send(input: Input) {
    lastInput.current = input;
    setFailure(null);
    setStepUp(false);
    setSucceeded(false);
    mutation.mutate(input);
  }

  function onInvalid(errors: FieldErrors<FieldValues>) {
    const key = Object.keys(errors).find((name) => technical.has(name));
    const code = key ? errors[key]?.message : undefined;
    setFailure(typeof code === "string" ? { code, reasons: [] } : null);
  }

  const pending = mutation.isPending;
  const inline = compact ?? false;
  const confirmBlocked = confirmText !== undefined && typed !== confirmText;

  return (
    <Form form={form} locale={locale} messages={messages}>
      <div className={cn("grid gap-4", inline && "gap-2")}>
        {failure ? (
          <div className="grid gap-2">
            <FormRootError code={failure.code} />
            {failure.reasons.length ? (
              <ul className="grid list-disc gap-1 ps-9 text-sm text-foreground">
                {failure.reasons.map((reason) => (
                  <li key={reason}>
                    {copyFor(reasonCopy, reason, locale)}{" "}
                    <bdi className="font-latin text-xs text-muted-foreground">
                      {reason}
                    </bdi>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {mutation.isError ? <FormRootError code="network" /> : null}
        {succeeded ? <Alert tone="positive">{successMessage}</Alert> : null}
        <form
          noValidate
          // The server receives the raw form values and parses them with the same schema.
          onSubmit={(event) =>
            void form.handleSubmit(
              () => send(form.getValues() as Input),
              onInvalid,
            )(event)
          }
          className={cn("grid gap-5", inline && "gap-0", className)}
        >
          {children ? (
            <FieldSet disabled={pending} className={cn(inline && "contents")}>
              {children}
            </FieldSet>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              loading={pending}
              loadingLabel={say(locale, formCopy.working)}
              disabled={confirmBlocked}
              variant={danger ? "destructive" : inline ? "outline" : "default"}
            >
              {submit}
            </Button>
            {secondaryAction}
          </div>
        </form>
        {stepUp && !pending ? (
          <StepUpPrompt
            locale={locale}
            onVerified={() => {
              if (lastInput.current) send(lastInput.current);
            }}
          />
        ) : null}
      </div>
    </Form>
  );
}
