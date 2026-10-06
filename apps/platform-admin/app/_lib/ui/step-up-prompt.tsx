"use client";

import type { Locale } from "@wlbp/i18n";
import { Button, TextField } from "@wlbp/ui-foundation";
import { useEffect, useId, useRef, useState } from "react";
import { formCopy, say, type Copy } from "../copy";
import { verifyStepUp } from "./step-up";

export function StepUpPrompt({
  locale,
  onVerified,
}: {
  locale: Locale;
  onVerified: () => void;
}) {
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [error, setError] = useState<Copy | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => heading.current?.focus(), []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const outcome = await verifyStepUp(
      String(new FormData(event.currentTarget).get("code") ?? ""),
    );
    setPending(false);
    if (outcome === "ok") onVerified();
    else
      setError(
        outcome === "no-factor" ? formCopy.stepUpNoFactor : formCopy.stepUpInvalid,
      );
  }

  return (
    <section className="notice notice--warning" aria-labelledby={id}>
      <h3 id={id} ref={heading} tabIndex={-1}>
        {say(locale, formCopy.stepUpTitle)}
      </h3>
      <p>{say(locale, formCopy.stepUpBody)}</p>
      {error ? <p role="alert">{say(locale, error)}</p> : null}
      <form onSubmit={submit}>
        <TextField
          id={`${id}-code`}
          name="code"
          label={say(locale, formCopy.stepUpCode)}
          autoComplete="one-time-code"
          inputMode="numeric"
          minLength={6}
          maxLength={6}
          required
        />
        <Button
          type="submit"
          loading={pending}
          loadingLabel={say(locale, formCopy.working)}
        >
          {say(locale, formCopy.stepUpSubmit)}
        </Button>
      </form>
    </section>
  );
}
