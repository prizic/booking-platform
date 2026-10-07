"use client";
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
  useZodForm,
} from "@wlbp/ui-foundation";
import type { ActionResult } from "@wlbp/ui-foundation/actions";
import { useState, type ReactNode } from "react";
import type { UseFormReturn } from "react-hook-form";

import { authMessage, type AuthMessageKey } from "./auth-copy";
import {
  recoverSchema,
  signInSchema,
  updatePasswordSchema,
  type RecoverInput,
  type SignInInput,
  type UpdatePasswordInput,
} from "./auth-schema";
import { dashboardFormMessages } from "./form-messages";
import { MutationErrors } from "./ui/mutation-errors";
import { useWorkspaceMutation } from "./ui/use-workspace-mutation";

/** Account outcome codes, in the account pages' own words. */
export function authFormMessages(locale: Locale): Readonly<Record<string, string>> {
  return {
    ...dashboardFormMessages(locale),
    invalid: authMessage(locale, "invalid"),
    credentials: authMessage(locale, "credentials"),
    unavailable: authMessage(locale, "unavailable"),
    expired: authMessage(locale, "expired"),
    invalid_mfa_code: authMessage(locale, "codeFormat"),
  };
}

function AuthFormFrame<T extends Record<string, unknown>>({
  form,
  locale,
  mutation,
  onSubmit,
  submitLabel,
  success,
  children,
}: {
  readonly form: UseFormReturn<T, unknown, unknown>;
  readonly locale: Locale;
  readonly mutation: {
    readonly data: ActionResult<unknown> | undefined;
    readonly error: Error | null;
    readonly isPending: boolean;
  };
  readonly onSubmit: () => void;
  readonly submitLabel: AuthMessageKey;
  readonly success?: AuthMessageKey | null;
  readonly children: ReactNode;
}) {
  return (
    <Form form={form} locale={locale} messages={authFormMessages(locale)}>
      <form
        noValidate
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        {success ? (
          <Alert tone="positive">
            <AlertDescription className="text-foreground">
              {authMessage(locale, success)}
            </AlertDescription>
          </Alert>
        ) : null}
        <MutationErrors mutation={mutation} />
        {children}
        <Button
          type="submit"
          block
          loading={mutation.isPending}
          loadingLabel={authMessage(locale, "pending")}
        >
          {authMessage(locale, submitLabel)}
        </Button>
      </form>
    </Form>
  );
}

function EmailField({ locale }: { readonly locale: Locale }) {
  return (
    <FormField
      name="email"
      render={({ field }) => (
        <FormItem>
          <FormLabel required>{authMessage(locale, "email")}</FormLabel>
          <FormControl>
            <Input
              {...field}
              type="email"
              dir="ltr"
              autoComplete="username"
              maxLength={254}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** Staff sign-in. A successful sign-in redirects to the normalized return path. */
export function SignInForm({
  action,
  locale,
  returnTo,
}: {
  readonly action: (input: SignInInput) => Promise<ActionResult>;
  readonly locale: Locale;
  readonly returnTo: string;
}) {
  const form = useZodForm(signInSchema, {
    defaultValues: { locale, email: "", password: "", returnTo },
  });
  const mutation = useWorkspaceMutation(action, form, { refresh: false });
  return (
    <AuthFormFrame
      form={form}
      locale={locale}
      mutation={mutation}
      submitLabel="signIn"
      onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
    >
      <EmailField locale={locale} />
      <FormField
        control={form.control}
        name="password"
        render={({ field }) => (
          <FormItem>
            <FormLabel required>{authMessage(locale, "password")}</FormLabel>
            <FormControl>
              <Input
                {...field}
                type="password"
                dir="ltr"
                autoComplete="current-password"
                maxLength={256}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </AuthFormFrame>
  );
}

/** Requests a recovery link; the answer never says whether the account exists. */
export function RecoverForm({
  action,
  locale,
}: {
  readonly action: (input: RecoverInput) => Promise<ActionResult>;
  readonly locale: Locale;
}) {
  const [sent, setSent] = useState(false);
  const form = useZodForm(recoverSchema, { defaultValues: { locale, email: "" } });
  const mutation = useWorkspaceMutation(action, form, {
    refresh: false,
    onSuccess: () => setSent(true),
  });
  return (
    <AuthFormFrame
      form={form}
      locale={locale}
      mutation={mutation}
      submitLabel="send"
      success={sent && !mutation.isPending ? "sent" : null}
      onSubmit={form.handleSubmit((values) => {
        setSent(false);
        mutation.mutate(values);
      })}
    >
      <EmailField locale={locale} />
    </AuthFormFrame>
  );
}

/** Sets a new password inside a recovery session, then signs out everywhere. */
export function UpdatePasswordForm({
  action,
  locale,
}: {
  readonly action: (input: UpdatePasswordInput) => Promise<ActionResult>;
  readonly locale: Locale;
}) {
  const form = useZodForm(updatePasswordSchema, {
    defaultValues: { locale, password: "", confirmation: "" },
  });
  const mutation = useWorkspaceMutation(action, form, { refresh: false });
  return (
    <AuthFormFrame
      form={form}
      locale={locale}
      mutation={mutation}
      submitLabel="update"
      onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
    >
      <FormField
        control={form.control}
        name="password"
        render={({ field }) => (
          <FormItem>
            <FormLabel required>{authMessage(locale, "newPassword")}</FormLabel>
            <FormControl>
              <Input
                {...field}
                type="password"
                dir="ltr"
                autoComplete="new-password"
                maxLength={256}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="confirmation"
        render={({ field }) => (
          <FormItem>
            <FormLabel required>{authMessage(locale, "confirmPassword")}</FormLabel>
            <FormControl>
              <Input
                {...field}
                type="password"
                dir="ltr"
                autoComplete="new-password"
                maxLength={256}
              />
            </FormControl>
            <FormDescription>{authMessage(locale, "passwordHint")}</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </AuthFormFrame>
  );
}
