"use client";
import { useActionState } from "react";
import type { Locale } from "@wlbp/i18n";
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
    <form action={submit} className="auth-form">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {state.message ? (
        <p id="auth-result" role={state.success ? "status" : "alert"}>
          {message(state.message)}
        </p>
      ) : null}
      {mode !== "update-password" ? (
        <label>
          {message("email")}
          <input
            className="wlbp-field__input"
            name="email"
            type="email"
            autoComplete="username"
            required
            maxLength={254}
            aria-invalid={state.field === "email"}
            aria-describedby={state.field === "email" ? "auth-result" : undefined}
          />
        </label>
      ) : null}
      {mode !== "recover" ? (
        <label>
          {mode === "update-password" ? message("newPassword") : message("password")}
          <input
            className="wlbp-field__input"
            name="password"
            type="password"
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
        </label>
      ) : null}
      {mode === "update-password" ? (
        <>
          <label>
            {message("confirmPassword")}
            <input
              className="wlbp-field__input"
              name="confirmation"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={256}
            />
          </label>
          <p id="password-hint">{message("passwordHint")}</p>
        </>
      ) : null}
      <button className="wlbp-button" disabled={pending} type="submit">
        {message(
          pending
            ? "pending"
            : mode === "recover"
              ? "send"
              : mode === "update-password"
                ? "update"
                : "signIn",
        )}
      </button>
    </form>
  );
}
