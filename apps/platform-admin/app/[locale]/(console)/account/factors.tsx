"use client";

import type { Locale } from "@wlbp/i18n";
import { Alert, Button, Skeleton, StatusStamp } from "@wlbp/ui-foundation";
import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { accountCopy as c, operatorsCopy } from "../../../_lib/admin-copy";
import { say } from "../../../_lib/copy";
import { getPlatformAdminBrowserClient } from "../../../_lib/supabase-browser";
import { DataTable } from "../../../_lib/ui/data-table";
import { StepUpPrompt } from "../../../_lib/ui/step-up-prompt";
import { formatUtc } from "../../../_lib/ui/time";

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
    <div className="grid gap-4">
      {failed ? (
        <Alert tone="danger">{say(locale, c.loadFailed)}</Alert>
      ) : factors === null ? (
        <div className="grid gap-2">
          <p role="status" className="sr-only">
            {say(locale, c.loading)}
          </p>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        <DataTable
          id="factors-table"
          locale={locale}
          caption={say(locale, c.factors)}
          columns={[
            { label: say(locale, c.factorName) },
            { label: say(locale, c.factorStatus) },
            { label: say(locale, c.factorCreated) },
          ]}
          rows={factors.map((f) => ({
            key: f.id,
            cells: [
              <bdi key="n" className="font-medium">
                {f.friendly_name ?? f.id.slice(0, 8)}
              </bdi>,
              <StatusStamp
                key="s"
                state={f.status === "verified" ? "confirmed" : "pending"}
              >
                {say(
                  locale,
                  f.status === "verified"
                    ? operatorsCopy.verified
                    : operatorsCopy.missing,
                )}
              </StatusStamp>,
              <time key="t" dateTime={f.created_at}>
                {formatUtc(f.created_at, locale)}
              </time>,
            ],
          }))}
        />
      )}
      {verified ? <Alert tone="positive">{say(locale, c.verifiedNow)}</Alert> : null}
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
        <div>
          <Button
            variant="outline"
            onClick={() => {
              setVerified(false);
              setVerifying(true);
            }}
          >
            <ShieldCheck aria-hidden="true" />
            {say(locale, c.verifyNow)}
          </Button>
        </div>
      )}
    </div>
  );
}
