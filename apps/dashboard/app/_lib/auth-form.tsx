"use client";
import { useActionState } from "react";
import type { Locale } from "@wlbp/i18n";
import {
  Alert,
  AlertDescription,
  Button,
  Field,
  FieldDescription,
  Input,
  Label,
  RequiredMark,
} from "@wlbp/ui-foundation";
import { authMessage, type AuthMessageKey } from "./auth-copy";

export interface AuthFormState {
  readonly message?: AuthMessageKey;
  readonly field?: "email" | "password";
  readonly success?: boolean;
}
export function AuthForm({
  action,
  locale,
  mode,
  returnTo = "",
}: {
  readonly action: (state: AuthFormState, data: FormData) => Promise<AuthFormState>;
  readonly locale: Locale;
  readonly mode: "sign-in" | "recover" | "update-password";
  readonly returnTo?: string;
}) {
  const [state, submit, pending] = useActionState(action, {});
  const message = (key: AuthMessageKey) => authMessage(locale, key);
  return (
    <form action={submit} className="grid gap-5">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {state.message ? (
        <Alert id="auth-result" tone={state.success ? "positive" : "danger"}>
          <AlertDescription className="text-foreground">
            {message(state.message)}
          </AlertDescription>
        </Alert>
      ) : null}
      {mode !== "update-password" ? (
        <Field invalid={state.field === "email"}>
          <Label htmlFor="auth-email">
            {message("email")}
            <RequiredMark />
          </Label>
          <Input
            id="auth-email"
            name="email"
            type="email"
            dir="ltr"
            autoComplete="username"
            required
            maxLength={254}
            aria-invalid={state.field === "email"}
            aria-describedby={state.field === "email" ? "auth-result" : undefined}
          />
        </Field>
      ) : null}
      {mode !== "recover" ? (
        <Field invalid={state.field === "password"}>
          <Label htmlFor="auth-password">
            {mode === "update-password" ? message("newPassword") : message("password")}
            <RequiredMark />
          </Label>
          <Input
            id="auth-password"
            name="password"
            type="password"
            dir="ltr"
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            required
            minLength={mode === "update-password" ? 8 : 1}
            maxLength={256}
            aria-invalid={state.field === "password"}
            aria-describedby={
              state.field === "password"
                ? "auth-result"
                : mode === "update-password"
                  ? "password-hint"
                  : undefined
            }
          />
        </Field>
      ) : null}
      {mode === "update-password" ? (
        <Field>
          <Label htmlFor="auth-confirmation">
            {message("confirmPassword")}
            <RequiredMark />
          </Label>
          <Input
            id="auth-confirmation"
            name="confirmation"
            type="password"
            dir="ltr"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={256}
            aria-describedby="password-hint"
          />
          <FieldDescription id="password-hint">
            {message("passwordHint")}
          </FieldDescription>
        </Field>
      ) : null}
      <Button type="submit" block loading={pending} loadingLabel={message("pending")}>
        {message(
          mode === "recover"
            ? "send"
            : mode === "update-password"
              ? "update"
              : "signIn",
        )}
      </Button>
    </form>
  );
}
