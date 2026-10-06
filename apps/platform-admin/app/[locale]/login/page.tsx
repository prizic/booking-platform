"use client";

import { Button, ErrorSummary, TextField } from "@wlbp/ui-foundation";
import type { Locale } from "@wlbp/i18n";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { authCopy } from "../../_lib/auth-copy";
import { say, type Copy } from "../../_lib/copy";
import {
  getPlatformAdminBrowserClient,
  verifyMfaCode,
} from "../../_lib/supabase-browser";

type Step = { kind: "credentials" } | { kind: "mfa"; factorId: string };

export default function LoginPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = use(params);
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "credentials" });
  const [error, setError] = useState<Copy | null>(null);
  const [pending, setPending] = useState(false);

  // Signed in at aal1 with a verified factor (e.g. after the guard asked for a
  // step-up): go straight to the code instead of asking for the password again.
  useEffect(() => {
    void (async () => {
      const client = getPlatformAdminBrowserClient();
      const { data } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (data?.currentLevel === "aal1" && data.nextLevel === "aal2") {
        const { data: factors } = await client.auth.mfa.listFactors();
        const factor = factors?.totp.find((entry) => entry.status === "verified");
        if (factor) setStep({ kind: "mfa", factorId: factor.id });
      }
    })();
  }, []);

  async function finish() {
    router.replace(`/${locale}`);
    router.refresh();
  }

  async function onCredentials(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const client = getPlatformAdminBrowserClient();
    const { error: signInError } = await client.auth.signInWithPassword({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    if (signInError) {
      setError(
        signInError.status === 400 ? authCopy.invalidCredentials : authCopy.unavailable,
      );
      setPending(false);
      return;
    }
    const { data: aal } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      const { data: factors } = await client.auth.mfa.listFactors();
      const factor = factors?.totp.find((entry) => entry.status === "verified");
      setPending(false);
      if (!factor) {
        setError(authCopy.noFactor);
        return;
      }
      setStep({ kind: "mfa", factorId: factor.id });
      return;
    }
    if (aal?.nextLevel === "aal1") {
      router.replace(`/${locale}/mfa-enroll`);
      return;
    }
    await finish();
  }

  async function onCode(event: React.FormEvent<HTMLFormElement>, factorId: string) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const code = String(new FormData(event.currentTarget).get("code") ?? "");
    const { error: verifyError } = await verifyMfaCode(
      getPlatformAdminBrowserClient(),
      factorId,
      code,
    );
    if (verifyError) {
      setError(authCopy.invalidCode);
      setPending(false);
      return;
    }
    await finish();
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="login-title">
        <h1 id="login-title">
          {say(
            locale,
            step.kind === "credentials" ? authCopy.loginTitle : authCopy.mfaTitle,
          )}
        </h1>
        {error ? (
          <ErrorSummary title={say(locale, authCopy.errorTitle)}>
            {say(locale, error)}
          </ErrorSummary>
        ) : null}
        {step.kind === "credentials" ? (
          <form key="credentials" onSubmit={onCredentials}>
            <TextField
              autoComplete="email"
              id="email"
              label={say(locale, authCopy.email)}
              name="email"
              required
              type="email"
            />
            <TextField
              autoComplete="current-password"
              id="password"
              label={say(locale, authCopy.password)}
              name="password"
              required
              type="password"
            />
            <Button
              loading={pending}
              loadingLabel={say(locale, authCopy.signingIn)}
              type="submit"
            >
              {say(locale, authCopy.signIn)}
            </Button>
          </form>
        ) : (
          <form key="mfa" onSubmit={(event) => onCode(event, step.factorId)}>
            <TextField
              autoComplete="one-time-code"
              id="code"
              inputMode="numeric"
              label={say(locale, authCopy.code)}
              maxLength={6}
              minLength={6}
              name="code"
              required
            />
            <Button
              loading={pending}
              loadingLabel={say(locale, authCopy.verifying)}
              type="submit"
            >
              {say(locale, authCopy.verify)}
            </Button>
          </form>
        )}
      </section>
    </main>
  );
}
