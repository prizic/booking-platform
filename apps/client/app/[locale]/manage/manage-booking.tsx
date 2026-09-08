"use client";

import {
  parseManagementActionV1,
  parseManagementStepUpV1,
  parseManagementViewV1,
  type ManagementActionV1,
  type ManagementViewV1,
} from "@wlbp/api-contracts";
import { formatCurrency, formatDateTime, type Locale } from "@wlbp/i18n";
import {
  Badge,
  Button,
  ErrorSummary,
  StatusMessage,
  Surface,
  TextField,
} from "@wlbp/ui-foundation";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

interface ManageBookingProps {
  readonly copy: Readonly<Record<string, string>>;
  readonly locale: Locale;
  readonly token: string | null;
}

const statusKeys: Readonly<Record<string, string>> = {
  cancelled: "manageStatusCancelled",
  confirmed: "manageStatusConfirmed",
  requested: "manageStatusRequested",
};

async function callManage(body: Record<string, unknown>): Promise<unknown> {
  // The token travels in the body, never the URL, so it cannot leak through a
  // referrer header, a browser history entry, or an access log.
  const response = await fetch("/api/manage", {
    body: JSON.stringify(body),
    credentials: "omit",
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return response.json();
}

export function ManageBooking({ copy, locale, token }: ManageBookingProps) {
  const message = (key: string) => copy[key] ?? key;
  const [view, setView] = useState<ManagementViewV1 | null>(null);
  const [stepUpSent, setStepUpSent] = useState(false);
  const [stepUpFailed, setStepUpFailed] = useState(false);
  const [busy, setBusy] = useState<"cancel" | "move" | "send" | "verify" | null>(null);
  const [code, setCode] = useState("");
  const [newStart, setNewStart] = useState("");
  const [applied, setApplied] = useState<Extract<
    ManagementActionV1,
    { outcome: "applied" }
  > | null>(null);
  const [actionFailed, setActionFailed] = useState<"conflict" | "failed" | null>(null);

  useEffect(() => {
    if (token === null) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = parseManagementViewV1(
          await callManage({ intent: "view", token }),
        );
        if (!cancelled) setView(result);
      } catch {
        if (!cancelled) setView({ outcome: "unavailable" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function sendCode() {
    if (token === null) return;
    setBusy("send");
    setStepUpFailed(false);
    try {
      parseManagementStepUpV1(await callManage({ action: "request-step-up", token }));
    } catch {
      // Ignored on purpose: whether a code was really sent is not something
      // this page may confirm, so both outcomes render the same message.
    } finally {
      setStepUpSent(true);
      setBusy(null);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (token === null) return;
    setBusy("verify");
    try {
      const result = (await callManage({
        action: "verify-step-up",
        code,
        token,
      })) as { verified?: unknown };
      if (result.verified === true) {
        setStepUpFailed(false);
        const refreshed = parseManagementViewV1(
          await callManage({ intent: "view", token }),
        );
        setView(refreshed);
      } else {
        setStepUpFailed(true);
      }
    } catch {
      setStepUpFailed(true);
    } finally {
      setBusy(null);
    }
  }

  async function act(action: "cancel" | "reschedule") {
    if (token === null || view === null || view.outcome !== "granted") return;
    setBusy(action === "cancel" ? "cancel" : "move");
    setActionFailed(null);
    try {
      const result = parseManagementActionV1(
        await callManage({
          action,
          expectedRevision: view.booking.bookingRevision,
          newStartAt:
            action === "reschedule" && newStart !== ""
              ? new Date(`${newStart}:00Z`).toISOString()
              : null,
          token,
        }),
      );
      // A refusal is indistinguishable, so the page says what is true for the
      // customer: nothing changed, and the newest email is authoritative.
      if (result.outcome === "applied") setApplied(result);
      else setActionFailed("conflict");
    } catch {
      setActionFailed("failed");
    } finally {
      setBusy(null);
    }
  }

  if (token === null) {
    return (
      <Surface as="section" className="booking-flow" labelledBy="manage-title">
        <h1 id="manage-title">{message("manageTitle")}</h1>
        <p>{message("manageMissingToken")}</p>
        <Link href={`/${locale}`}>{message("manageUnavailableAction")}</Link>
      </Surface>
    );
  }

  if (view === null) {
    return (
      <Surface as="section" className="booking-flow" labelledBy="manage-title">
        <h1 id="manage-title">{message("manageTitle")}</h1>
        <p>{message("manageSummary")}</p>
      </Surface>
    );
  }

  if (view.outcome === "unavailable") {
    return (
      <Surface as="section" className="booking-flow" labelledBy="manage-title">
        <h1 id="manage-title">{message("manageUnavailableTitle")}</h1>
        <p>{message("manageUnavailableBody")}</p>
        <Link href={`/${locale}`}>{message("manageUnavailableAction")}</Link>
      </Surface>
    );
  }

  const { booking } = view;
  if (applied !== null) {
    return (
      <Surface as="section" className="booking-confirmed" labelledBy="manage-title">
        <Badge tone="positive">{booking.publicReference}</Badge>
        <h1 id="manage-title">
          {applied.status === "cancelled"
            ? message("manageCancelled")
            : message("manageRescheduled")}
        </h1>
        {applied.startAt === null ? null : (
          <StatusMessage tone="positive">
            {formatDateTime(applied.startAt, locale, booking.customerTimeZone)}
          </StatusMessage>
        )}
        {applied.refund === null ? null : (
          <p>
            {applied.refund.minorUnits > 0
              ? message("manageCancelRefund").replace(
                  "{amount}",
                  formatCurrency(
                    applied.refund.minorUnits,
                    applied.refund.currency,
                    locale,
                  ),
                )
              : message("manageCancelNoRefund")}
          </p>
        )}
      </Surface>
    );
  }
  return (
    <Surface as="section" className="booking-confirmed" labelledBy="manage-title">
      <Badge tone={booking.status === "cancelled" ? "neutral" : "positive"}>
        {message(statusKeys[booking.status] ?? "manageStatusOther")}
      </Badge>
      <h1 id="manage-title">{message("manageTitle")}</h1>
      <p>{message("manageSummary")}</p>
      <dl className="booking-confirmed__facts">
        <div>
          <dt>{message("manageReferenceLabel")}</dt>
          <dd dir="ltr">{booking.publicReference}</dd>
        </div>
        <div>
          <dt>{message("manageServiceLabel")}</dt>
          <dd>{booking.serviceName}</dd>
        </div>
        <div>
          <dt>{message("manageLocationLabel")}</dt>
          <dd>{booking.locationName}</dd>
        </div>
        <div>
          <dt>{message("manageWhenLabel")}</dt>
          <dd>{formatDateTime(booking.startAt, locale, booking.customerTimeZone)}</dd>
        </div>
        <div>
          <dt>{message("manageTimezoneLabel")}</dt>
          <dd dir="ltr">{booking.customerTimeZone}</dd>
        </div>
        <div>
          <dt>{message("manageTotalLabel")}</dt>
          <dd>
            {formatCurrency(booking.price.minorUnits, booking.price.currency, locale)}
          </dd>
        </div>
        <div>
          <dt>{message("managePolicyVersionLabel")}</dt>
          <dd dir="ltr">{booking.consentVersion}</dd>
        </div>
        <div>
          <dt>{message("manageLinkExpiresLabel")}</dt>
          <dd>
            {formatDateTime(view.tokenExpiresAt, locale, booking.customerTimeZone)}
          </dd>
        </div>
      </dl>

      <StatusMessage tone={view.canReschedule ? "positive" : "warning"}>
        {view.canReschedule
          ? message("manageRescheduleEligible")
          : message("manageRescheduleIneligible")}
      </StatusMessage>
      <StatusMessage tone={view.canCancel ? "positive" : "warning"}>
        {view.canCancel
          ? message("manageCancelEligible")
          : message("manageCancelIneligible")}
      </StatusMessage>
      <p>{message("manageActionsPending")}</p>

      {actionFailed === null ? null : (
        <ErrorSummary
          focusTarget
          id="manage-action-error"
          title={message("manageActionFailed")}
        >
          <p>
            {actionFailed === "conflict"
              ? message("manageActionConflict")
              : message("manageActionFailed")}
          </p>
        </ErrorSummary>
      )}

      {view.stepUpVerified && view.intent === "cancel" ? (
        <section aria-labelledby="manage-cancel">
          <h2 id="manage-cancel">{message("manageCancelConfirmTitle")}</h2>
          <Button
            loading={busy === "cancel"}
            loadingLabel={message("manageCancelling")}
            onClick={() => void act("cancel")}
          >
            {message("manageCancelAction")}
          </Button>
        </section>
      ) : null}

      {view.stepUpVerified && view.intent === "reschedule" ? (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void act("reschedule");
          }}
        >
          <TextField
            description={message("manageRescheduleTimeHint")}
            id="manage-new-start"
            label={message("manageRescheduleTimeLabel")}
            name="newStartAt"
            onChange={(event) => setNewStart(event.currentTarget.value)}
            required
            type="datetime-local"
            value={newStart}
          />
          <Button
            loading={busy === "move"}
            loadingLabel={message("manageRescheduling")}
            type="submit"
          >
            {message("manageRescheduleAction")}
          </Button>
        </form>
      ) : null}

      {view.stepUpRequired ? (
        <section aria-labelledby="manage-step-up">
          <h2 id="manage-step-up">{message("manageStepUpTitle")}</h2>
          <p>{message("manageStepUpSummary")}</p>
          {view.stepUpVerified ? (
            <StatusMessage tone="positive">
              {message("manageStepUpVerified")}
            </StatusMessage>
          ) : (
            <>
              {stepUpFailed ? (
                <ErrorSummary
                  focusTarget
                  id="manage-step-up-error"
                  title={message("manageStepUpTitle")}
                >
                  <p>{message("manageStepUpFailed")}</p>
                </ErrorSummary>
              ) : null}
              <Button
                loading={busy === "send"}
                loadingLabel={message("manageStepUpSending")}
                onClick={() => void sendCode()}
                variant="secondary"
              >
                {message("manageStepUpSend")}
              </Button>
              {stepUpSent ? (
                <StatusMessage>{message("manageStepUpSent")}</StatusMessage>
              ) : null}
              <form noValidate onSubmit={verifyCode}>
                <TextField
                  autoComplete="one-time-code"
                  description={message("manageStepUpCodeHint")}
                  id="manage-step-up-code"
                  inputMode="numeric"
                  label={message("manageStepUpCodeLabel")}
                  maxLength={6}
                  name="code"
                  onChange={(event) => setCode(event.currentTarget.value)}
                  required
                  value={code}
                />
                <Button
                  loading={busy === "verify"}
                  loadingLabel={message("manageStepUpVerifying")}
                  type="submit"
                >
                  {message("manageStepUpVerify")}
                </Button>
              </form>
            </>
          )}
        </section>
      ) : null}
    </Surface>
  );
}
