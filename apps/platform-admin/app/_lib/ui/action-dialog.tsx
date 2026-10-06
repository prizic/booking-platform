"use client";

import type { Locale } from "@wlbp/i18n";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { fill, formCopy, say } from "../copy";
import { OperatorForm, type FormAction } from "./operator-form";

/**
 * A native modal <dialog>: focus moves in, Escape closes, focus returns to the
 * trigger. Destructive and high-impact actions always go through one.
 */
export function ActionDialog({
  locale,
  action,
  trigger,
  title,
  description,
  submit,
  successMessage,
  danger,
  triggerVariant = "secondary",
  hidden,
  reason,
  confirmText,
  children,
}: {
  locale: Locale;
  action: FormAction;
  trigger: string;
  title: string;
  description?: string | undefined;
  submit: string;
  successMessage: string;
  danger?: boolean;
  triggerVariant?: "primary" | "secondary" | "quiet";
  hidden?: Record<string, string>;
  reason?: { minLength: number };
  confirmText?: string;
  children?: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const fieldId = useId();
  const [typed, setTyped] = useState("");
  // A fresh form on every open, so a previous error or step-up does not linger.
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    // Open after the fresh keyed form commits, so initial focus is not removed.
    if (generation > 0) dialog.current?.showModal();
  }, [generation]);

  const close = useCallback(() => dialog.current?.close(), []);
  const onSuccess = useCallback(() => {
    dialog.current?.close();
  }, []);

  return (
    <>
      <button
        type="button"
        className={`wlbp-button wlbp-button--${danger && triggerVariant === "primary" ? "primary wlbp-button--danger" : triggerVariant}`}
        onClick={() => {
          setTyped("");
          setGeneration((value) => value + 1);
        }}
      >
        {trigger}
      </button>
      <dialog ref={dialog} className="dialog" aria-labelledby={titleId}>
        <h2 id={titleId}>{title}</h2>
        {description ? <p>{description}</p> : null}
        <OperatorForm
          key={generation}
          locale={locale}
          action={action}
          submit={submit}
          successMessage={successMessage}
          danger={danger ?? false}
          onSuccess={onSuccess}
          submitDisabled={confirmText !== undefined && typed !== confirmText}
        >
          {Object.entries(hidden ?? {}).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          {children}
          {reason ? (
            <label className="field" htmlFor={`${fieldId}-reason`}>
              <span>{say(locale, formCopy.reason)}</span>
              <textarea
                id={`${fieldId}-reason`}
                name="reason"
                required
                minLength={reason.minLength}
                maxLength={500}
                aria-describedby={`${fieldId}-reason-hint`}
              />
              <small id={`${fieldId}-reason-hint`}>
                {fill(locale, formCopy.reasonHint, { n: String(reason.minLength) })}
              </small>
            </label>
          ) : null}
          {confirmText !== undefined ? (
            <label className="field" htmlFor={`${fieldId}-confirm`}>
              <span>
                {fill(locale, formCopy.typeToConfirm, { value: confirmText })}
              </span>
              <input
                id={`${fieldId}-confirm`}
                name="confirmation"
                value={typed}
                autoComplete="off"
                onChange={(event) => setTyped(event.target.value)}
                required
              />
            </label>
          ) : null}
        </OperatorForm>
        <div className="form-actions">
          <button
            type="button"
            className="wlbp-button wlbp-button--quiet"
            onClick={close}
          >
            {say(locale, formCopy.cancel)}
          </button>
        </div>
      </dialog>
    </>
  );
}
