"use client";
import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Locale } from "@wlbp/i18n";
import {
  Alert,
  AlertDescription,
  Button,
  Checkbox,
  Field,
  FieldDescription,
  Input,
  Label,
  RequiredMark,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
} from "@wlbp/ui-foundation";
import { authMessage, type AuthMessageKey } from "../../../_lib/auth-copy";
import { textLinkClass as authLinkClass } from "../../../_lib/ui/text-link";
import {
  enrollAuthenticator,
  verifyAuthenticator,
  removeAuthenticator,
  cancelAuthenticatorSetup,
  type MfaResult,
} from "./actions";
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
  const [setup, setSetup] = useState<MfaResult | null>(null);
  const [result, setResult] = useState<AuthMessageKey | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const message = (key: AuthMessageKey) => authMessage(locale, key);
  const available = setup?.factorId
    ? [...factors, { id: setup.factorId, friendlyName: message("factor") }]
    : factors;
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
      {setup?.ok && setup.qrCode ? (
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
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const factor = String(data.get("factorId"));
            const code = String(data.get("code"));
            start(async () => {
              const response = await verifyAuthenticator(factor, code);
              setResult(response.ok ? "verified" : "invalid");
              if (response.ok) {
                setSetup(null);
                router.refresh();
              }
            });
          }}
        >
          <Field>
            <Label htmlFor="mfa-verify-factor">{message("factor")}</Label>
            <Select
              key={setup?.factorId ?? "existing"}
              name="factorId"
              defaultValue={setup?.factorId ?? factors[0]?.id ?? ""}
            >
              <SelectTrigger id="mfa-verify-factor">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {available.map((factor) => (
                  <SelectItem key={factor.id} value={factor.id}>
                    {factor.friendlyName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <Label htmlFor="mfa-code">
              {message("code")}
              <RequiredMark />
            </Label>
            <Input
              id="mfa-code"
              name="code"
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              required
              minLength={6}
              maxLength={6}
              className="font-latin tracking-[0.3em]"
            />
          </Field>
          <Button
            type="submit"
            block
            loading={pending}
            loadingLabel={message("pending")}
          >
            {message("verify")}
          </Button>
        </form>
      )}
      {!setup ? (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const response = await enrollAuthenticator();
              if (response.ok) setSetup(response);
              else setResult("unavailable");
            })
          }
        >
          {message("enroll")}
        </Button>
      ) : null}
      {[
        ...(setup?.factorId
          ? [{ id: setup.factorId, friendlyName: message("factor") }]
          : []),
        ...unfinished.filter((factor) => factor.id !== setup?.factorId),
      ].map((factor) => (
        <Button
          key={factor.id}
          variant="ghost"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const response = await cancelAuthenticatorSetup(factor.id);
              if (response.ok) {
                setSetup(null);
                setResult(null);
                router.refresh();
              } else setResult("unavailable");
            })
          }
        >
          {message("cancelSetup")} — {factor.friendlyName}
        </Button>
      ))}
      {factors.length ? (
        <>
          <Separator />
          <form
            aria-labelledby="mfa-remove-title"
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              start(async () => {
                const response = await removeAuthenticator(
                  String(data.get("factorId")),
                );
                setResult(response.ok ? "verified" : "invalid");
                if (response.ok) router.refresh();
              });
            }}
          >
            <div className="grid gap-1">
              <h2 id="mfa-remove-title" className="text-base font-semibold">
                {message("remove")}
              </h2>
              <FieldDescription>{message("removeHint")}</FieldDescription>
            </div>
            <Field>
              <Label htmlFor="mfa-remove-factor">{message("factor")}</Label>
              <Select name="factorId" defaultValue={factors[0]?.id ?? ""}>
                <SelectTrigger id="mfa-remove-factor">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {factors.map((factor) => (
                    <SelectItem key={factor.id} value={factor.id}>
                      {factor.friendlyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field orientation="horizontal">
              <Checkbox id="mfa-remove-confirm" required />
              <Label htmlFor="mfa-remove-confirm">{message("removeHint")}</Label>
            </Field>
            <Button type="submit" variant="destructive-outline" disabled={pending}>
              {message("remove")}
            </Button>
          </form>
        </>
      ) : null}
      <Link className={authLinkClass} href={returnTo}>
        {message("back")}
      </Link>
    </div>
  );
}
