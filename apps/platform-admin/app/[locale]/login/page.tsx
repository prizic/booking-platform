"use client";

import { Button, ErrorSummary, Surface, TextField } from "@wlbp/ui-foundation";
import type { Locale } from "@wlbp/i18n";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { getAdminMessage } from "../../_lib/copy";
import {
  getPlatformAdminBrowserClient,
  verifyMfaCode,
} from "../../_lib/supabase-browser";

type LoginPageProps = { params: Promise<{ locale: Locale }> };

type Step = { kind: "credentials" } | { kind: "mfa-challenge"; factorId: string };

export default function LoginPage({ params }: LoginPageProps) {
  const { locale } = use(params);
  const message = (key: Parameters<typeof getAdminMessage>[1]) =>
    getAdminMessage(locale, key);
  const router = useRouter();

  const [step, setStep] = useState<Step>({ kind: "credentials" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleCredentials(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");

    const client = getPlatformAdminBrowserClient();
    const { error: signInError } = await client.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      setError(signInError.message);
      setPending(false);
      return;
    }

    const { data: aal } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      const { data: factors } = await client.auth.mfa.listFactors();
      const factor = factors?.totp.find((entry) => entry.status === "verified");
      if (!factor) {
        setError(message("loginErrorTitle"));
        setPending(false);
        return;
      }
      setStep({ factorId: factor.id, kind: "mfa-challenge" });
      setPending(false);
      return;
    }

    if (aal?.nextLevel === "aal1") {
      router.push(`/${locale}/mfa-enroll`);
      return;
    }

    router.push(`/${locale}`);
  }

  async function handleMfaChallenge(
    event: React.FormEvent<HTMLFormElement>,
    factorId: string,
  ) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const code = String(form.get("code") ?? "");

    const client = getPlatformAdminBrowserClient();
    const { error: verifyError } = await verifyMfaCode(client, factorId, code);
    if (verifyError) {
      setError(verifyError.message);
      setPending(false);
      return;
    }
    router.push(`/${locale}`);
  }

  return (
    <main className="admin-shell">
      <Surface as="section" className="fleet-panel" labelledBy="login-title">
        <h1 id="login-title">
          {step.kind === "credentials"
            ? message("loginTitle")
            : message("loginMfaCodeLabel")}
        </h1>
        {error === null ? null : (
          <ErrorSummary title={message("loginErrorTitle")}>{error}</ErrorSummary>
        )}
        {step.kind === "credentials" ? (
          <form onSubmit={handleCredentials}>
            <TextField
              autoComplete="email"
              id="email"
              label={message("loginEmailLabel")}
              name="email"
              required
              type="email"
            />
            <TextField
              autoComplete="current-password"
              id="password"
              label={message("loginPasswordLabel")}
              name="password"
              required
              type="password"
            />
            <Button loading={pending} type="submit">
              {message("loginSubmit")}
            </Button>
          </form>
        ) : (
          <form onSubmit={(event) => handleMfaChallenge(event, step.factorId)}>
            <TextField
              autoComplete="one-time-code"
              id="code"
              inputMode="numeric"
              label={message("loginMfaCodeLabel")}
              maxLength={6}
              minLength={6}
              name="code"
              required
            />
            <Button loading={pending} type="submit">
              {message("loginMfaSubmit")}
            </Button>
          </form>
        )}
      </Surface>
    </main>
  );
}
