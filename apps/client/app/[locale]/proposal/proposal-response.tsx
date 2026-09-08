"use client";

import { parseProposalResponseV1, type ProposalResponseV1 } from "@wlbp/api-contracts";
import { formatDateTime, type Locale } from "@wlbp/i18n";
import {
  Badge,
  Button,
  ErrorSummary,
  StatusMessage,
  Surface,
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
      <Surface as="section" className="booking-confirmed" labelledBy="proposal-result">
        <Badge tone={accepted ? "positive" : "neutral"}>{result.publicReference}</Badge>
        <h1 id="proposal-result">
          {accepted
            ? message("proposalAcceptedTitle")
            : message("proposalDeclinedTitle")}
        </h1>
        <p>
          {accepted
            ? message("proposalAcceptedSummary")
            : message("proposalDeclinedSummary")}
        </p>
        {accepted ? (
          <StatusMessage tone="positive">
            {formatDateTime(result.startAt, locale, timeZone)}
          </StatusMessage>
        ) : null}
      </Surface>
    );
  }

  return (
    <Surface as="section" className="booking-flow" labelledBy="proposal-title">
      <h1 id="proposal-title">{message("proposalTitle")}</h1>
      <p>{message("proposalSummary")}</p>
      {errorCode === null ? null : (
        <ErrorSummary
          focusTarget
          id="proposal-error"
          title={message("proposalErrorTitle")}
        >
          <p>
            {errorCode === "revision_conflict" || errorCode === "slot_unavailable"
              ? message("proposalErrorExpired")
              : message("proposalErrorUnavailable")}
          </p>
        </ErrorSummary>
      )}
      {actionToken === null ? (
        <p>{message("proposalMissingToken")}</p>
      ) : (
        <div className="booking-flow__actions">
          <Button
            loading={busy === "accept"}
            loadingLabel={message("proposalAccepting")}
            onClick={() => void respond("accept")}
          >
            {message("proposalAccept")}
          </Button>
          <Button
            loading={busy === "decline"}
            loadingLabel={message("proposalDeclining")}
            onClick={() => void respond("decline")}
            variant="secondary"
          >
            {message("proposalDecline")}
          </Button>
        </div>
      )}
    </Surface>
  );
}
