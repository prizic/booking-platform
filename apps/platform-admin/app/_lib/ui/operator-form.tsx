"use client";

import type { Locale } from "@wlbp/i18n";
import { Button, ErrorSummary, StatusMessage } from "@wlbp/ui-foundation";
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
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const form = useRef<HTMLFormElement>(null);
  const handled = useRef<ActionResult>(initial);
  const router = useRouter();
  const pathname = usePathname();
  const announce = useActionFeedback()?.announce;

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
    <>
      {state.kind === "error" ? (
        <ErrorSummary title={say(locale, formCopy.errorTitle)}>
          <p>{copyFor(errorCopy, state.code, locale)}</p>
          {state.reasons?.length ? (
            <ul>
              {state.reasons.map((reason) => (
                <li key={reason}>
                  {copyFor(reasonCopy, reason, locale)}{" "}
                  <bdi className="secondary">{reason}</bdi>
                </li>
              ))}
            </ul>
          ) : null}
        </ErrorSummary>
      ) : null}
      {state.kind === "success" && !state.href && !onSuccess && !announce ? (
        <StatusMessage tone="positive">{successMessage}</StatusMessage>
      ) : null}
      <form ref={form} action={formAction} className={className}>
        <input type="hidden" name="locale" value={locale} />
        <fieldset disabled={pending}>{children}</fieldset>
        <div className="form-actions">
          <Button
            type="submit"
            loading={pending}
            loadingLabel={say(locale, formCopy.working)}
            disabled={submitDisabled ?? false}
            className={danger ? "wlbp-button--danger" : ""}
          >
            {submit}
          </Button>
        </div>
      </form>
      {state.kind === "step-up" && !pending ? (
        <StepUpPrompt
          locale={locale}
          onVerified={() => form.current?.requestSubmit()}
        />
      ) : null}
    </>
  );
}
