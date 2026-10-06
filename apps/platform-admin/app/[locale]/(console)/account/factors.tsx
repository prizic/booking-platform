"use client";

import { formatDateTime, type Locale } from "@wlbp/i18n";
import { StatusMessage } from "@wlbp/ui-foundation";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { accountCopy as c, operatorsCopy } from "../../../_lib/admin-copy";
import { say } from "../../../_lib/copy";
import { getPlatformAdminBrowserClient } from "../../../_lib/supabase-browser";
import { StepUpPrompt } from "../../../_lib/ui/step-up-prompt";

type Factor = {
  id: string;
  friendly_name?: string;
  status: string;
  created_at: string;
};

export function Factors({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    void getPlatformAdminBrowserClient()
      .auth.mfa.listFactors()
      .then(({ data, error }) => {
        if (error || !data) setFailed(true);
        else setFactors(data.totp as Factor[]);
      });
  }, []);

  return (
    <>
      {failed ? (
        <p role="alert">{say(locale, c.loadFailed)}</p>
      ) : factors === null ? (
        <p role="status">{say(locale, c.loading)}</p>
      ) : (
        <ul>
          {factors.map((f) => (
            <li key={f.id}>
              <bdi>{f.friendly_name ?? f.id.slice(0, 8)}</bdi> ·{" "}
              {say(
                locale,
                f.status === "verified"
                  ? operatorsCopy.verified
                  : operatorsCopy.missing,
              )}{" "}
              · {say(locale, c.factorCreated)}{" "}
              {formatDateTime(f.created_at, locale, "UTC")}
            </li>
          ))}
        </ul>
      )}
      {verified ? (
        <StatusMessage tone="positive">{say(locale, c.verifiedNow)}</StatusMessage>
      ) : null}
      {verifying ? (
        <StepUpPrompt
          locale={locale}
          onVerified={() => {
            setVerifying(false);
            setVerified(true);
            router.refresh();
          }}
        />
      ) : (
        <button
          type="button"
          className="wlbp-button wlbp-button--secondary"
          onClick={() => {
            setVerified(false);
            setVerifying(true);
          }}
        >
          {say(locale, c.verifyNow)}
        </button>
      )}
    </>
  );
}
