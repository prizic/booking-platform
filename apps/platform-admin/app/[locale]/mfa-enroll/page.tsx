"use client";

import {
  Button,
  ErrorSummary,
  StatusMessage,
  Surface,
  TextField,
} from "@wlbp/ui-foundation";
import type { Locale } from "@wlbp/i18n";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { getAdminMessage } from "../../_lib/copy";
import {
  getPlatformAdminBrowserClient,
  verifyMfaCode,
} from "../../_lib/supabase-browser";

type MfaEnrollPageProps = { params: Promise<{ locale: Locale }> };

export default function MfaEnrollPage({ params }: MfaEnrollPageProps) {
  const { locale } = use(params);
  const message = (key: Parameters<typeof getAdminMessage>[1]) =>
    getAdminMessage(locale, key);
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
    getPlatformAdminBrowserClient()
      .auth.mfa.enroll({ factorType: "totp" })
      .then(({ data, error: enrollError }) => {
        if (cancelled) return;
        if (enrollError) {
          setError(enrollError.message);
          return;
        }
        setFactor({ id: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
      setError(verifyError.message);
      setPending(false);
      return;
    }
    router.push(`/${locale}`);
  }

  return (
    <main className="admin-shell">
      <Surface as="section" className="fleet-panel" labelledBy="mfa-enroll-title">
        <h1 id="mfa-enroll-title">{message("mfaEnrollTitle")}</h1>
        <StatusMessage>{message("mfaEnrollInstructions")}</StatusMessage>
        {error === null ? null : (
          <ErrorSummary title={message("mfaEnrollErrorTitle")}>{error}</ErrorSummary>
        )}
        {factor === null ? null : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- next/image cannot optimize a dynamically generated data-URI SVG */}
            <img
              alt=""
              height={200}
              src={factor.qrCode}
              width={200}
            />
            <p>
              <strong>{message("mfaEnrollSecretLabel")}:</strong>{" "}
              <code>{factor.secret}</code>
            </p>
            <form onSubmit={handleVerify}>
              <TextField
                autoComplete="one-time-code"
                id="code"
                inputMode="numeric"
                label={message("mfaEnrollCodeLabel")}
                maxLength={6}
                minLength={6}
                name="code"
                required
              />
              <Button loading={pending} type="submit">
                {message("mfaEnrollSubmit")}
              </Button>
            </form>
          </>
        )}
      </Surface>
    </main>
  );
}
