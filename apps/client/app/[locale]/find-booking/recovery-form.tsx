"use client";
import { parseBookingRecoveryV1Response } from "@wlbp/api-contracts";
import type { Locale } from "@wlbp/i18n";
import {
  Alert,
  AlertDescription,
  Button,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  actionOk,
  useActionMutation,
  useZodForm,
} from "@wlbp/ui-foundation";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { journeyMessage } from "../../_lib/journey-copy";
import { recoveryFormSchema, type RecoveryFormInput } from "./recovery-schema";

async function submitRecovery(input: RecoveryFormInput & { requestId: string }) {
  const response = await fetch("/api/booking-recovery", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    credentials: "omit",
    cache: "no-store",
    referrerPolicy: "no-referrer",
  });
  if (!response.ok) throw new Error("recovery_unavailable");
  parseBookingRecoveryV1Response(await response.json());
  return actionOk();
}

export function RecoveryForm({ locale }: { readonly locale: Locale }) {
  const message = (key: Parameters<typeof journeyMessage>[1]) =>
    journeyMessage(locale, key);
  const form = useZodForm(recoveryFormSchema, { defaultValues: { email: "" } });
  const [accepted, setAccepted] = useState(false);
  // Each completion gets focus even if consecutive acceptance updates batch.
  const [announcementVersion, setAnnouncementVersion] = useState(0);
  const status = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (announcementVersion > 0) status.current?.focus();
  }, [announcementVersion]);
  const mutation = useActionMutation(submitRecovery, {
    refresh: false,
    retry: false,
    onSuccess: () => {
      setAccepted(true);
      form.reset();
      setAnnouncementVersion((version) => version + 1);
    },
  });
  const submit = form.handleSubmit(async (values) => {
    if (mutation.isPending) return;
    setAccepted(false);
    try {
      await mutation.mutateAsync({ ...values, requestId: crypto.randomUUID() });
    } catch {
      // The same conditional message and delivery guidance; no inference about an address.
      setAccepted(true);
      form.reset();
      setAnnouncementVersion((version) => version + 1);
    }
  });
  const guidance = (
    <div className="grid gap-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        {message("recoveryGuidance")}
      </p>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {message("recoveryHelp")}
      </p>
      <div>
        <Button asChild variant="outline">
          <Link href={`/${locale}/contact`}>{message("contactBusiness")}</Link>
        </Button>
      </div>
    </div>
  );
  return (
    <div className="grid max-w-xl gap-6">
      <Form
        form={form}
        locale={locale}
        messages={{ recovery_email_invalid: message("recoveryEmailInvalid") }}
      >
        <form
          noValidate
          onSubmit={submit}
          aria-busy={mutation.isPending}
          className="grid gap-5"
        >
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>{message("recoveryEmail")}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    dir="ltr"
                    maxLength={320}
                    disabled={mutation.isPending}
                    required
                  />
                </FormControl>
                <FormDescription>{message("recoveryEmailHint")}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <div>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending
                ? message("recoveryPending")
                : message("recoverySubmit")}
            </Button>
          </div>
          {Object.keys(form.formState.errors).length ? (
            <p role="alert" className="text-sm text-destructive">
              {message("recoveryEmailInvalid")}
            </p>
          ) : null}
        </form>
      </Form>
      {mutation.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          {message("recoveryPending")}
        </p>
      ) : null}
      {accepted ? (
        <div
          role="status"
          aria-live="polite"
          tabIndex={-1}
          ref={status}
          className="rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Alert role="presentation" tone="positive">
            <AlertDescription>{message("recoveryAccepted")}</AlertDescription>
          </Alert>
        </div>
      ) : null}
      {guidance}
    </div>
  );
}
