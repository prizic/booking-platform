"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Locale } from "@wlbp/i18n";
import {
  Alert,
  AlertDescription,
  applyActionErrors,
  Button,
  Checkbox,
  FieldDescription,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  useActionMutation,
  useZodForm,
} from "@wlbp/ui-foundation";
import { authMessage, type AuthMessageKey } from "../../../_lib/auth-copy";
import { authFormMessages } from "../../../_lib/auth-form";
import { textLinkClass as authLinkClass } from "../../../_lib/ui/text-link";
import {
  enrollAuthenticator,
  verifyAuthenticator,
  removeAuthenticator,
  cancelAuthenticatorSetup,
  type AuthenticatorSetup,
} from "./actions";
import { removeAuthenticatorSchema, verifyAuthenticatorSchema } from "./mfa-schema";

export function MfaForm({
  locale,
  factors,
  unfinished,
  unavailable,
  returnTo,
}: {
  readonly locale: Locale;
  readonly factors: readonly { id: string; friendlyName: string }[];
  readonly unfinished: readonly { id: string; friendlyName: string }[];
  readonly unavailable: boolean;
  readonly returnTo: string;
}) {
  const [setup, setSetup] = useState<AuthenticatorSetup | null>(null);
  const [result, setResult] = useState<AuthMessageKey | null>(null);
  const message = (key: AuthMessageKey) => authMessage(locale, key);
  const messages = authFormMessages(locale);
  const available = setup
    ? [...factors, { id: setup.factorId, friendlyName: message("factor") }]
    : factors;

  const enroll = useActionMutation(enrollAuthenticator, {
    refresh: false,
    onSuccess: (data) => setSetup(data),
    onFailure: () => setResult("unavailable"),
    onError: () => setResult("unavailable"),
  });

  const verifyForm = useZodForm(verifyAuthenticatorSchema, {
    defaultValues: { factorId: factors[0]?.id ?? "", code: "" },
  });
  // A setup in progress is the factor being verified, as soon as it exists.
  const setupFactorId = setup?.factorId;
  useEffect(() => {
    if (setupFactorId !== undefined) verifyForm.setValue("factorId", setupFactorId);
  }, [setupFactorId, verifyForm]);
  const verify = useActionMutation(verifyAuthenticator, {
    onSuccess: () => {
      setResult("verified");
      setSetup(null);
      verifyForm.resetField("code");
    },
    onFailure: (failure) => {
      applyActionErrors(verifyForm, failure);
      setResult("invalid");
    },
    onError: () => setResult("unavailable"),
  });

  const cancel = useActionMutation(cancelAuthenticatorSetup, {
    onSuccess: () => {
      setSetup(null);
      setResult(null);
    },
    onFailure: () => setResult("unavailable"),
    onError: () => setResult("unavailable"),
  });

  const removeForm = useZodForm(removeAuthenticatorSchema, {
    defaultValues: { factorId: factors[0]?.id ?? "", confirm: false },
  });
  const remove = useActionMutation(removeAuthenticator, {
    onSuccess: () => {
      setResult("verified");
      removeForm.resetField("confirm");
    },
    onFailure: (failure) => {
      applyActionErrors(removeForm, failure);
      setResult("invalid");
    },
    onError: () => setResult("unavailable"),
  });

  const pending =
    enroll.isPending || verify.isPending || cancel.isPending || remove.isPending;

  return (
    <div className="grid gap-5">
      {unavailable ? (
        <Alert tone="danger">
          <AlertDescription className="text-foreground">
            {message("unavailable")}
          </AlertDescription>
        </Alert>
      ) : null}
      {result ? (
        <Alert tone={result === "verified" ? "positive" : "danger"}>
          <AlertDescription className="text-foreground">
            {message(result)}
          </AlertDescription>
        </Alert>
      ) : null}
      {setup ? (
        <section
          aria-label={message("setup")}
          className="grid justify-items-center gap-3"
        >
          <p className="text-sm leading-relaxed text-muted-foreground">
            {message("setup")}
          </p>
          {/* A QR code needs a light quiet zone to scan, in either theme, so
              this is the one place a fixed white is deliberate. */}
          <Image
            unoptimized
            src={setup.qrCode}
            alt={message("qr")}
            width={240}
            height={240}
            className="rounded-md border bg-white p-2"
          />
          <p
            dir="ltr"
            className="font-latin text-sm font-semibold tracking-[0.08em] break-all [font-variant-numeric:tabular-nums]"
          >
            {setup.secret}
          </p>
        </section>
      ) : null}
      {available.length === 0 ? (
        <p className="text-sm text-muted-foreground">{message("noFactor")}</p>
      ) : (
        <Form form={verifyForm} locale={locale} messages={messages}>
          <form
            noValidate
            className="grid gap-5"
            onSubmit={verifyForm.handleSubmit((values) => verify.mutate(values))}
          >
            <FormField
              control={verifyForm.control}
              name="factorId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{message("factor")}</FormLabel>
                  <Select
                    name={field.name}
                    value={field.value}
                    onValueChange={(value) => {
                      // Radix echoes "" from its hidden native select before a
                      // newly added option exists; never let that clear the choice.
                      if (value) field.onChange(value);
                    }}
                  >
                    <FormControl>
                      <SelectTrigger onBlur={field.onBlur}>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {available.map((factor) => (
                        <SelectItem key={factor.id} value={factor.id}>
                          {factor.friendlyName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={verifyForm.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>{message("code")}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      dir="ltr"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      className="font-latin tracking-[0.3em]"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              block
              loading={verify.isPending}
              disabled={pending}
              loadingLabel={message("pending")}
            >
              {message("verify")}
            </Button>
          </form>
        </Form>
      )}
      {!setup ? (
        <Button
          variant="outline"
          disabled={pending}
          loading={enroll.isPending}
          onClick={() => enroll.mutate(undefined)}
        >
          {message("enroll")}
        </Button>
      ) : null}
      {[
        ...(setup ? [{ id: setup.factorId, friendlyName: message("factor") }] : []),
        ...unfinished.filter((factor) => factor.id !== setup?.factorId),
      ].map((factor) => (
        <Button
          key={factor.id}
          variant="ghost"
          disabled={pending}
          onClick={() => cancel.mutate({ factorId: factor.id })}
        >
          {message("cancelSetup")} — {factor.friendlyName}
        </Button>
      ))}
      {factors.length ? (
        <>
          <Separator />
          <Form form={removeForm} locale={locale} messages={messages}>
            <form
              noValidate
              aria-labelledby="mfa-remove-title"
              className="grid gap-4"
              onSubmit={removeForm.handleSubmit((values) => remove.mutate(values))}
            >
              <div className="grid gap-1">
                <h2 id="mfa-remove-title" className="text-base font-semibold">
                  {message("remove")}
                </h2>
                <FieldDescription>{message("removeHint")}</FieldDescription>
              </div>
              <FormField
                control={removeForm.control}
                name="factorId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{message("factor")}</FormLabel>
                    <Select
                      name={field.name}
                      value={field.value}
                      onValueChange={(value) => {
                        // Radix echoes "" from its hidden native select before a
                        // newly added option exists; never let that clear the choice.
                        if (value) field.onChange(value);
                      }}
                    >
                      <FormControl>
                        <SelectTrigger onBlur={field.onBlur}>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {factors.map((factor) => (
                          <SelectItem key={factor.id} value={factor.id}>
                            {factor.friendlyName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={removeForm.control}
                name="confirm"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-start gap-3">
                      <FormControl>
                        <Checkbox
                          name={field.name}
                          checked={field.value === true}
                          onCheckedChange={(checked) =>
                            field.onChange(checked === true)
                          }
                          onBlur={field.onBlur}
                        />
                      </FormControl>
                      <FormLabel required>{message("removeHint")}</FormLabel>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                variant="destructive-outline"
                disabled={pending}
                loading={remove.isPending}
              >
                {message("remove")}
              </Button>
            </form>
          </Form>
        </>
      ) : null}
      <Link className={authLinkClass} href={returnTo}>
        {message("back")}
      </Link>
    </div>
  );
}
