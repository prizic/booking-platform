"use client";
import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Locale } from "@wlbp/i18n";
import { authMessage, type AuthMessageKey } from "../../../_lib/auth-copy";
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
    <div className="auth-form">
      {unavailable ? <p role="alert">{message("unavailable")}</p> : null}
      {result ? (
        <p role={result === "verified" ? "status" : "alert"}>{message(result)}</p>
      ) : null}
      {setup?.ok && setup.qrCode ? (
        <section aria-label={message("setup")}>
          <p>{message("setup")}</p>
          <Image
            unoptimized
            src={setup.qrCode}
            alt={message("qr")}
            width={240}
            height={240}
          />
          <p dir="ltr">{setup.secret}</p>
        </section>
      ) : null}
      {available.length === 0 ? (
        <p>{message("noFactor")}</p>
      ) : (
        <form
          className="auth-form"
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
          <label>
            {message("factor")}
            <select
              key={setup?.factorId ?? "existing"}
              className="wlbp-field__input"
              name="factorId"
              defaultValue={setup?.factorId ?? factors[0]?.id}
            >
              {available.map((factor) => (
                <option key={factor.id} value={factor.id}>
                  {factor.friendlyName}
                </option>
              ))}
            </select>
          </label>
          <label>
            {message("code")}
            <input
              className="wlbp-field__input"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              required
              minLength={6}
              maxLength={6}
            />
          </label>
          <button className="wlbp-button" disabled={pending} type="submit">
            {message(pending ? "pending" : "verify")}
          </button>
        </form>
      )}
      {!setup ? (
        <button
          className="wlbp-button wlbp-button--quiet"
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
        </button>
      ) : null}
      {[
        ...(setup?.factorId
          ? [{ id: setup.factorId, friendlyName: message("factor") }]
          : []),
        ...unfinished.filter((factor) => factor.id !== setup?.factorId),
      ].map((factor) => (
        <button
          key={factor.id}
          className="wlbp-button wlbp-button--quiet"
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
        </button>
      ))}
      {factors.length ? (
        <details>
          <summary>{message("remove")}</summary>
          <p>{message("removeHint")}</p>
          <form
            className="auth-form"
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
            <label>
              {message("factor")}
              <select className="wlbp-field__input" name="factorId">
                {factors.map((factor) => (
                  <option key={factor.id} value={factor.id}>
                    {factor.friendlyName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <input type="checkbox" required />
              {message("removeHint")}
            </label>
            <button className="wlbp-button wlbp-button--quiet" disabled={pending}>
              {message("remove")}
            </button>
          </form>
        </details>
      ) : null}
      <Link href={returnTo}>{message("back")}</Link>
    </div>
  );
}
