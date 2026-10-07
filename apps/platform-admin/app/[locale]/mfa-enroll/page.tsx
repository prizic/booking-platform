"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Form,
  FormRootError,
  Skeleton,
  useActionMutation,
  useZodForm,
} from "@wlbp/ui-foundation";
import type { Locale } from "@wlbp/i18n";
import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useState } from "react";
import { verifyFactorCode } from "../../_lib/auth-flow";
import { say } from "../../_lib/copy";
import { authCopy } from "../../_lib/auth-copy";
import { authFormMessages } from "../../_lib/form-messages";
import { totpCodeSchema, type TotpCodeInput } from "../../_lib/schemas/auth";
import { getPlatformAdminBrowserClient } from "../../_lib/supabase-browser";
import { AuthFrame } from "../../_lib/ui/auth-frame";
import { TextFormField } from "../../_lib/ui/form-fields";

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

  return (
    <AuthFrame
      locale={locale}
      titleId="mfa-enroll-title"
      title={say(locale, authCopy.enrollTitle)}
      description={say(locale, authCopy.enrollBody)}
    >
      {error === null ? null : (
        <Alert tone="danger">
          <AlertTitle>{say(locale, authCopy.errorTitle)}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {factor === null && error === null ? (
        <div className="grid justify-items-center gap-3">
          <Skeleton className="size-[200px]" />
          <p role="status" className="text-sm text-muted-foreground">
            {say(locale, authCopy.preparing)}
          </p>
        </div>
      ) : null}
      {factor === null ? null : (
        <>
          <div className="grid justify-items-center gap-4">
            {/* A QR code needs a light quiet zone to scan, in the dark theme too. */}
            <div className="rounded-lg border bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- next/image cannot optimize a dynamically generated data-URI SVG */}
              <img
                alt={say(locale, authCopy.enrollQr)}
                height={200}
                src={factor.qrCode}
                width={200}
              />
            </div>
            <div className="grid w-full gap-1 text-center">
              <p className="text-xs font-semibold text-muted-foreground">
                {say(locale, authCopy.enrollKey)}
              </p>
              <code
                dir="ltr"
                className="rounded-md bg-muted px-3 py-2 font-latin text-sm font-semibold tracking-[0.12em] break-all select-all"
              >
                {factor.secret}
              </code>
            </div>
          </div>
          <VerifyForm
            locale={locale}
            factorId={factor.id}
            onVerified={() => {
              router.replace(`/${locale}`);
              router.refresh();
            }}
          />
        </>
      )}
    </AuthFrame>
  );
}

function VerifyForm({
  locale,
  factorId,
  onVerified,
}: {
  locale: Locale;
  factorId: string;
  onVerified: () => void;
}) {
  const form = useZodForm(totpCodeSchema, { defaultValues: { code: "" } });
  const messages = useMemo(() => authFormMessages(locale), [locale]);
  const mutation = useActionMutation(
    (input: TotpCodeInput) => verifyFactorCode(factorId, input),
    { refresh: false, onSuccess: () => onVerified() },
  );
  const failed =
    mutation.data && !mutation.data.ok ? mutation.data.formError : undefined;
  // Stays busy after success while the console loads.
  const busy = mutation.isPending || mutation.data?.ok === true;
  return (
    <Form form={form} locale={locale} messages={messages}>
      <FormRootError code={failed} />
      {mutation.isError ? <FormRootError code="auth_unavailable" /> : null}
      <form
        noValidate
        onSubmit={(event) =>
          void form.handleSubmit(() =>
            mutation.mutate(form.getValues() as TotpCodeInput),
          )(event)
        }
        className="grid gap-5"
      >
        <TextFormField
          autoComplete="one-time-code"
          id="code"
          inputMode="numeric"
          label={say(locale, authCopy.code)}
          maxLength={6}
          minLength={6}
          name="code"
          required
          dir="ltr"
          className="[&_input]:text-center [&_input]:text-lg [&_input]:tracking-[0.4em]"
        />
        <Button block loading={busy} type="submit">
          {say(locale, authCopy.enrollSubmit)}
        </Button>
      </form>
    </Form>
  );
}
