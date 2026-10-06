"use client";

import { Button, ErrorSummary, TextField } from "@wlbp/ui-foundation";
import type { Locale } from "@wlbp/i18n";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { say } from "../../_lib/copy";
import { authCopy } from "../../_lib/auth-copy";
import {
  getPlatformAdminBrowserClient,
  verifyMfaCode,
} from "../../_lib/supabase-browser";

type MfaEnrollPageProps = { params: Promise<{ locale: Locale }> };

export default function MfaEnrollPage({ params }: MfaEnrollPageProps) {
  const { locale } = use(params);
  const router = useRouter();

  const [factor, setFactor] = useState<{
    id: string;
    qrCode: string;
    secret: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function startEnrollment() {
      const client = getPlatformAdminBrowserClient();

      // An abandoned attempt (refresh, closed tab, a previous broken QR)
      // leaves an unverified factor behind, and Supabase refuses a second
      // one with the same friendly name — so a retry has to clear those
      // first rather than fail confusingly on the second visit.
      const { data: existing } = await client.auth.mfa.listFactors();
      const stale = existing?.all.filter(
        (factor) => factor.factor_type === "totp" && factor.status === "unverified",
      );
      for (const factor of stale ?? []) {
        await client.auth.mfa.unenroll({ factorId: factor.id });
      }
      if (cancelled) return;

      const { data, error: enrollError } = await client.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Atlas platform operations",
        // Without this the authenticator app labels the entry with the
        // project's site_url, which reads as "localhost".
        issuer: "Atlas Platform Admin",
      });
      if (cancelled) return;
      if (enrollError) {
        setError(say(locale, authCopy.enrollFailed));
        return;
      }
      setFactor({ id: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
    }

    void startEnrollment();
    return () => {
      cancelled = true;
    };
  }, [locale]);

  async function handleVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!factor) return;
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const code = String(form.get("code") ?? "");

    const client = getPlatformAdminBrowserClient();
    const { error: verifyError } = await verifyMfaCode(client, factor.id, code);
    if (verifyError) {
      setError(say(locale, authCopy.invalidCode));
      setPending(false);
      return;
    }
    router.replace(`/${locale}`);
    router.refresh();
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="mfa-enroll-title">
        <h1 id="mfa-enroll-title">{say(locale, authCopy.enrollTitle)}</h1>
        <p>{say(locale, authCopy.enrollBody)}</p>
        {error === null ? null : (
          <ErrorSummary title={say(locale, authCopy.errorTitle)}>{error}</ErrorSummary>
        )}
        {factor === null && error === null ? (
          <p role="status">{say(locale, authCopy.preparing)}</p>
        ) : null}
        {factor === null ? null : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- next/image cannot optimize a dynamically generated data-URI SVG */}
            <img
              alt={say(locale, authCopy.enrollQr)}
              height={200}
              src={factor.qrCode}
              width={200}
            />
            <p>
              <strong>{say(locale, authCopy.enrollKey)}:</strong>{" "}
              <code dir="ltr">{factor.secret}</code>
            </p>
            <form onSubmit={handleVerify}>
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
              <Button loading={pending} type="submit">
                {say(locale, authCopy.enrollSubmit)}
              </Button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
