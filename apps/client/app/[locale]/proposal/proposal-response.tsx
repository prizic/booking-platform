"use client";

import { parseProposalResponseV1, type ProposalResponseV1 } from "@wlbp/api-contracts";
import { formatDateTime, type Locale } from "@wlbp/i18n";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  PageHeader,
  ReferenceCode,
} from "@wlbp/ui-foundation";
import { useState } from "react";

interface ProposalResponseProps {
  readonly actionToken: string | null;
  readonly copy: Readonly<Record<string, string>>;
  readonly locale: Locale;
  readonly timeZone: string;
}

export function ProposalResponse({
  actionToken,
  copy,
  locale,
  timeZone,
}: ProposalResponseProps) {
  const message = (key: string) => copy[key] ?? key;
  const [result, setResult] = useState<ProposalResponseV1 | null>(null);
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  async function respond(action: "accept" | "decline") {
    if (actionToken === null) return;
    setBusy(action);
    setErrorCode(null);
    try {
      const response = await fetch("/api/proposals", {
        body: JSON.stringify({ action, actionToken }),
        credentials: "omit",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const code =
          typeof body === "object" && body !== null
            ? ((body as { error?: { code?: unknown } }).error?.code ?? null)
            : null;
        setErrorCode(typeof code === "string" ? code : "availability_unavailable");
        return;
      }
      setResult(parseProposalResponseV1(await response.json()));
    } catch {
      setErrorCode("availability_unavailable");
    } finally {
      setBusy(null);
    }
  }

  if (result !== null) {
    const accepted = result.proposalState === "accepted";
    return (
      <section aria-labelledby="proposal-result" className="grid gap-6">
        <PageHeader
          title={
            accepted
              ? message("proposalAcceptedTitle")
              : message("proposalDeclinedTitle")
          }
          titleId="proposal-result"
          description={
            accepted
              ? message("proposalAcceptedSummary")
              : message("proposalDeclinedSummary")
          }
          meta={<ReferenceCode>{result.publicReference}</ReferenceCode>}
        />
        {accepted ? (
          <Alert tone="positive">
            {formatDateTime(result.startAt, locale, timeZone)}
          </Alert>
        ) : null}
      </section>
    );
  }

  return (
    <section aria-labelledby="proposal-title" className="grid gap-6">
      <PageHeader
        title={message("proposalTitle")}
        titleId="proposal-title"
        description={message("proposalSummary")}
      />
      {errorCode === null ? null : (
        <Alert
          className="outline-none focus-visible:ring-[3px] focus-visible:ring-destructive/40"
          id="proposal-error"
          tabIndex={-1}
          tone="danger"
        >
          <AlertTitle>{message("proposalErrorTitle")}</AlertTitle>
          <AlertDescription>
            {errorCode === "revision_conflict" || errorCode === "slot_unavailable"
              ? message("proposalErrorExpired")
              : message("proposalErrorUnavailable")}
          </AlertDescription>
        </Alert>
      )}
      {actionToken === null ? (
        <Alert tone="info">{message("proposalMissingToken")}</Alert>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            loading={busy === "accept"}
            loadingLabel={message("proposalAccepting")}
            onClick={() => void respond("accept")}
            size="lg"
          >
            {message("proposalAccept")}
          </Button>
          <Button
            loading={busy === "decline"}
            loadingLabel={message("proposalDeclining")}
            onClick={() => void respond("decline")}
            size="lg"
            variant="outline"
          >
            {message("proposalDecline")}
          </Button>
        </div>
      )}
    </section>
  );
}
