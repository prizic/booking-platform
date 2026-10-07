"use client";

import type { Locale } from "@wlbp/i18n";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  FieldSet,
  cn,
} from "@wlbp/ui-foundation";
import { usePathname, useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import type { ActionResult } from "../operator-action";
import { copyFor, errorCopy, formCopy, reasonCopy, say } from "../copy";
import { useActionFeedback } from "./action-feedback";
import { StepUpPrompt } from "./step-up-prompt";

export type FormAction = (
  previous: ActionResult,
  form: FormData,
) => Promise<ActionResult>;

const initial: ActionResult = { kind: "idle" };

function download({ filename, body }: { filename: string; body: string }) {
  const url = URL.createObjectURL(new Blob([body], { type: "text/csv;charset=utf-8" }));
  const link = Object.assign(document.createElement("a"), {
    href: url,
    download: filename,
  });
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * One form behaviour for every mutation: pending state disables input, errors
 * are announced in text, a step-up challenge re-submits the same form, and a
 * success either navigates, downloads, or announces itself.
 *
 * `compact` renders a single small action (e.g. inside a table row);
 * `className="inline-form"` from earlier callers means the same thing.
 * `secondaryAction` sits beside the submit button (a dialog's Cancel).
 */
export function OperatorForm({
  locale,
  action,
  submit,
  successMessage,
  danger,
  children,
  onSuccess,
  submitDisabled,
  className,
  compact,
  secondaryAction,
}: {
  locale: Locale;
  action: FormAction;
  submit: string;
  successMessage: string;
  danger?: boolean;
  children?: ReactNode;
  onSuccess?: () => void;
  submitDisabled?: boolean;
  className?: string;
  compact?: boolean;
  secondaryAction?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const form = useRef<HTMLFormElement>(null);
  const handled = useRef<ActionResult>(initial);
  const router = useRouter();
  const pathname = usePathname();
  const announce = useActionFeedback()?.announce;
  const inline = compact ?? className === "inline-form";

  useEffect(() => {
    if (state === handled.current || state.kind !== "success") return;
    handled.current = state;
    if (state.download) download(state.download);
    announce?.(successMessage, state.href?.split("?")[0] ?? pathname);
    onSuccess?.();
    if (state.href) router.push(state.href);
    else router.refresh();
  }, [state, router, onSuccess, announce, pathname, successMessage]);

  return (
    <div className={cn("grid gap-4", inline && "gap-2")}>
      {state.kind === "error" ? (
        <Alert tone="danger">
          <AlertTitle>{say(locale, formCopy.errorTitle)}</AlertTitle>
          <AlertDescription>
            <p>{copyFor(errorCopy, state.code, locale)}</p>
            {state.reasons?.length ? (
              <ul className="mt-1 grid list-disc gap-1 ps-5">
                {state.reasons.map((reason) => (
                  <li key={reason}>
                    {copyFor(reasonCopy, reason, locale)}{" "}
                    <bdi className="font-latin text-xs text-muted-foreground">
                      {reason}
                    </bdi>
                  </li>
                ))}
              </ul>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {state.kind === "success" && !state.href && !onSuccess && !announce ? (
        <Alert tone="positive">{successMessage}</Alert>
      ) : null}
      <form
        ref={form}
        action={formAction}
        className={cn(
          "grid gap-5",
          inline && "gap-0",
          className !== "inline-form" && className,
        )}
      >
        <input type="hidden" name="locale" value={locale} />
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
            disabled={submitDisabled ?? false}
            variant={danger ? "destructive" : inline ? "outline" : "default"}
          >
            {submit}
          </Button>
          {secondaryAction}
        </div>
      </form>
      {state.kind === "step-up" && !pending ? (
        <StepUpPrompt
          locale={locale}
          onVerified={() => form.current?.requestSubmit()}
        />
      ) : null}
    </div>
  );
}
