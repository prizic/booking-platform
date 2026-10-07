"use client";

import type { Locale } from "@wlbp/i18n";
import {
  Button,
  Form,
  FormRootError,
  useActionMutation,
  useZodForm,
} from "@wlbp/ui-foundation";
import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useState } from "react";
import {
  pendingFactor,
  signInWithPassword,
  verifyFactorCode,
  type SignInNext,
} from "../../_lib/auth-flow";
import { authCopy } from "../../_lib/auth-copy";
import { say } from "../../_lib/copy";
import { authFormMessages } from "../../_lib/form-messages";
import {
  signInSchema,
  totpCodeSchema,
  type SignInInput,
  type TotpCodeInput,
} from "../../_lib/schemas/auth";
import { AuthFrame } from "../../_lib/ui/auth-frame";
import { TextFormField } from "../../_lib/ui/form-fields";

type Step = { kind: "credentials" } | { kind: "mfa"; factorId: string };

export default function LoginPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = use(params);
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "credentials" });

  // Signed in at aal1 with a verified factor (e.g. after the guard asked for a
  // step-up): go straight to the code instead of asking for the password again.
  useEffect(() => {
    void pendingFactor().then((factorId) => {
      if (factorId) setStep({ kind: "mfa", factorId });
    });
  }, []);

  function finish() {
    router.replace(`/${locale}`);
    router.refresh();
  }

  return (
    <AuthFrame
      locale={locale}
      titleId="login-title"
      title={say(
        locale,
        step.kind === "credentials" ? authCopy.loginTitle : authCopy.mfaTitle,
      )}
    >
      {step.kind === "credentials" ? (
        <CredentialsForm
          key="credentials"
          locale={locale}
          onNext={(next) => {
            if (next.next === "mfa") setStep({ kind: "mfa", factorId: next.factorId });
            else if (next.next === "enroll") router.replace(`/${locale}/mfa-enroll`);
            else finish();
          }}
        />
      ) : (
        <CodeForm
          key="mfa"
          locale={locale}
          factorId={step.factorId}
          onVerified={finish}
        />
      )}
    </AuthFrame>
  );
}

function CredentialsForm({
  locale,
  onNext,
}: {
  locale: Locale;
  onNext: (next: SignInNext) => void;
}) {
  const form = useZodForm(signInSchema, { defaultValues: { email: "", password: "" } });
  const messages = useMemo(() => authFormMessages(locale), [locale]);
  const mutation = useActionMutation(signInWithPassword, {
    refresh: false,
    onSuccess: (next) => onNext(next),
  });
  const failed =
    mutation.data && !mutation.data.ok ? mutation.data.formError : undefined;
  // Stays busy after success while the next step or page loads.
  const busy = mutation.isPending || mutation.data?.ok === true;

  return (
    <Form form={form} locale={locale} messages={messages}>
      <FormRootError code={failed} />
      {mutation.isError ? <FormRootError code="auth_unavailable" /> : null}
      <form
        noValidate
        onSubmit={(event) =>
          void form.handleSubmit(() =>
            mutation.mutate(form.getValues() as SignInInput),
          )(event)
        }
        className="grid gap-5"
      >
        <TextFormField
          autoComplete="email"
          id="email"
          label={say(locale, authCopy.email)}
          name="email"
          required
          type="email"
          dir="ltr"
        />
        <TextFormField
          autoComplete="current-password"
          id="password"
          label={say(locale, authCopy.password)}
          name="password"
          required
          type="password"
          dir="ltr"
        />
        <Button
          block
          loading={busy}
          loadingLabel={say(locale, authCopy.signingIn)}
          type="submit"
        >
          {say(locale, authCopy.signIn)}
        </Button>
      </form>
    </Form>
  );
}

function CodeForm({
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
        <Button
          block
          loading={busy}
          loadingLabel={say(locale, authCopy.verifying)}
          type="submit"
        >
          {say(locale, authCopy.verify)}
        </Button>
      </form>
    </Form>
  );
}
