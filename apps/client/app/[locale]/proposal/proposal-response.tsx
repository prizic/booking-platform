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
import { useMutation } from "@tanstack/react-query";

import { errorCodeOf, postJson } from "../../_lib/client-api";
import { proposalResponseSchema, type ProposalResponseInput } from "./proposal-schema";

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
  const respond = useMutation({
    // The same schema the route applies: a well formed token and one answer.
    mutationFn: async (input: ProposalResponseInput) =>
      parseProposalResponseV1(
        await postJson("/api/proposals", proposalResponseSchema.parse(input)),
      ),
    retry: false,
  });
  const result: ProposalResponseV1 | null = respond.data ?? null;
  const errorCode = respond.isError ? errorCodeOf(respond.error) : null;
  const busy = respond.isPending ? (respond.variables?.action ?? null) : null;

  function answer(action: "accept" | "decline") {
    if (actionToken === null) return;
    respond.mutate({ action, actionToken });
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
            onClick={() => answer("accept")}
            size="lg"
          >
            {message("proposalAccept")}
          </Button>
          <Button
            loading={busy === "decline"}
            loadingLabel={message("proposalDeclining")}
            onClick={() => answer("decline")}
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
