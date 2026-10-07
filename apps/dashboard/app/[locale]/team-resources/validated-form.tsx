"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";

type ManagementAction = (formData: FormData) => Promise<void>;

interface ValidatedFormProps {
  readonly action: ManagementAction;
  readonly children: ReactNode;
  readonly invalidMessage: string;
}

type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export function ValidatedForm({
  action,
  children,
  invalidMessage,
}: ValidatedFormProps) {
  const errorId = useId();
  const [showError, setShowError] = useState(false);

  function handleInvalid(event: FormEvent<HTMLFormElement>) {
    const control = event.target as FormControl;
    control.setCustomValidity(invalidMessage);
    control.setAttribute("aria-invalid", "true");
    control.setAttribute("aria-errormessage", errorId);
    setShowError(true);
  }

  function handleInput(event: FormEvent<HTMLFormElement>) {
    const control = event.target as FormControl;
    control.setCustomValidity("");
    control.removeAttribute("aria-invalid");
    control.removeAttribute("aria-errormessage");
    setShowError(false);
  }

  return (
    <form
      action={action}
      className="grid gap-5 pt-1"
      onInput={handleInput}
      // Foundation selects report their choice through a bubbling change event.
      onChange={handleInput}
      onInvalid={handleInvalid}
    >
      {children}
      <p
        className="text-sm font-medium text-destructive"
        hidden={!showError}
        id={errorId}
        role="alert"
      >
        {invalidMessage}
      </p>
    </form>
  );
}
