"use client";

import type { Locale } from "@wlbp/i18n";
import {
  Button,
  Form,
  FormRootError,
  useActionMutation,
  useZodForm,
} from "@wlbp/ui-foundation";
import { ShieldAlert } from "lucide-react";
import { useEffect, useId, useMemo, useRef } from "react";
import { formCopy, say } from "../copy";
import { authFormMessages } from "../form-messages";
import { totpCodeSchema, type TotpCodeInput } from "../schemas/auth";
import { TextFormField } from "./form-fields";
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
  const form = useZodForm(totpCodeSchema, { defaultValues: { code: "" } });
  const messages = useMemo(
    () => ({
      ...authFormMessages(locale),
      invalid_code: say(locale, formCopy.stepUpInvalid),
      no_factor: say(locale, formCopy.stepUpNoFactor),
    }),
    [locale],
  );
  // The fresh TOTP verification refreshes the session cookie; the caller then
  // re-sends its own action, so nothing here needs a page refresh.
  const mutation = useActionMutation(verifyStepUp, {
    refresh: false,
    onSuccess: () => onVerified(),
  });

  useEffect(() => heading.current?.focus(), []);

  const failed =
    mutation.data && !mutation.data.ok ? mutation.data.formError : undefined;

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
      <Form form={form} locale={locale} messages={messages}>
        <FormRootError code={failed} />
        {mutation.isError ? <FormRootError code="network" /> : null}
        <form
          noValidate
          onSubmit={(event) =>
            void form.handleSubmit(() =>
              mutation.mutate(form.getValues() as TotpCodeInput),
            )(event)
          }
          className="flex flex-wrap items-start gap-3"
        >
          <TextFormField
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
            className="mt-7"
            loading={mutation.isPending}
            loadingLabel={say(locale, formCopy.working)}
          >
            {say(locale, formCopy.stepUpSubmit)}
          </Button>
        </form>
      </Form>
    </section>
  );
}
