"use client";

import type { Locale } from "@wlbp/i18n";
import { Alert, Button, TextField } from "@wlbp/ui-foundation";
import { ShieldAlert } from "lucide-react";
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
    <section
      aria-labelledby={id}
      className="grid gap-4 rounded-lg border border-warning/35 bg-warning-soft p-4"
    >
      <div className="flex items-start gap-3">
        <ShieldAlert
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 text-warning"
        />
        <div className="grid gap-1">
          <h3
            id={id}
            ref={heading}
            tabIndex={-1}
            className="rounded-sm text-base font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {say(locale, formCopy.stepUpTitle)}
          </h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {say(locale, formCopy.stepUpBody)}
          </p>
        </div>
      </div>
      {error ? <Alert tone="danger">{say(locale, error)}</Alert> : null}
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <TextField
          id={`${id}-code`}
          name="code"
          label={say(locale, formCopy.stepUpCode)}
          autoComplete="one-time-code"
          inputMode="numeric"
          dir="ltr"
          minLength={6}
          maxLength={6}
          required
          className="w-48"
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
