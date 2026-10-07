"use client";

import {
  parseManagementActionV1,
  parseManagementStepUpV1,
  parseManagementViewV1,
  type ManagementActionV1,
  type ManagementViewV1,
} from "@wlbp/api-contracts";
import {
  formatCurrency,
  formatDateTime,
  formatTimeZone,
  resolveZonedLocalDateTime,
  type Locale,
} from "@wlbp/i18n";
import {
  Alert,
  AlertDescription,
  DateTimePicker,
  Field,
  FieldDescription,
  Label,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Facts,
  PageHeader,
  ReferenceCode,
  Separator,
  Skeleton,
  StatusStamp,
  TextField,
  type StampState,
} from "@wlbp/ui-foundation";
import { Mail } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import { formatWallDateTime } from "../../_lib/wall-time";

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

const stampStates: Readonly<Record<string, StampState>> = {
  cancelled: "cancelled",
  confirmed: "confirmed",
  requested: "requested",
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

  async function act(action: "cancel" | "reschedule", newStart = "") {
    if (token === null || view === null || view.outcome !== "granted") return;
    // The picker shows wall time in the customer's own zone; resolve it there,
    // refusing a DST gap or an ambiguous repeated hour instead of guessing.
    let newStartAt: string | null = null;
    if (action === "reschedule" && newStart !== "") {
      const match = /^(d{4})-(d{2})-(d{2})T(d{2}):(d{2})$/u.exec(newStart);
      const resolution = match
        ? resolveZonedLocalDateTime(
            {
              year: Number(match[1]),
              month: Number(match[2]),
              day: Number(match[3]),
              hour: Number(match[4]),
              minute: Number(match[5]),
            },
            view.booking.customerTimeZone,
          )
        : null;
      if (resolution?.kind !== "exact") {
        setActionFailed("failed");
        return;
      }
      newStartAt = resolution.instants[0];
    }
    setBusy(action === "cancel" ? "cancel" : "move");
    setActionFailed(null);
    try {
      const result = parseManagementActionV1(
        await callManage({
          action,
          expectedRevision: view.booking.bookingRevision,
          newStartAt,
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

  const homeLink = (
    <Button asChild variant="outline">
      <Link href={`/${locale}`}>{message("manageUnavailableAction")}</Link>
    </Button>
  );

  if (token === null) {
    return (
      <section aria-labelledby="manage-title" className="grid gap-6">
        <PageHeader title={message("manageTitle")} titleId="manage-title" />
        <Alert tone="info">{message("manageMissingToken")}</Alert>
        <div>{homeLink}</div>
      </section>
    );
  }

  if (view === null) {
    return (
      <section aria-busy="true" aria-labelledby="manage-title" className="grid gap-6">
        <PageHeader
          title={message("manageTitle")}
          titleId="manage-title"
          description={message("manageSummary")}
        />
        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </CardContent>
        </Card>
      </section>
    );
  }

  if (view.outcome === "unavailable") {
    return (
      <section aria-labelledby="manage-title" className="grid gap-6">
        <PageHeader
          title={message("manageUnavailableTitle")}
          titleId="manage-title"
          description={message("manageUnavailableBody")}
        />
        <div>{homeLink}</div>
      </section>
    );
  }

  const { booking } = view;
  if (applied !== null) {
    return (
      <section aria-labelledby="manage-title" className="grid gap-6">
        <PageHeader
          title={
            applied.status === "cancelled"
              ? message("manageCancelled")
              : message("manageRescheduled")
          }
          titleId="manage-title"
          meta={
            <>
              <StatusStamp
                state={applied.status === "cancelled" ? "cancelled" : "confirmed"}
              >
                {message(statusKeys[applied.status] ?? "manageStatusOther")}
              </StatusStamp>
              <ReferenceCode>{booking.publicReference}</ReferenceCode>
            </>
          }
        />
        {applied.startAt === null ? null : (
          <Alert tone="positive">
            {formatDateTime(applied.startAt, locale, booking.customerTimeZone)}
          </Alert>
        )}
        {applied.refund === null ? null : (
          <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
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
      </section>
    );
  }
  return (
    <section aria-labelledby="manage-title" className="grid gap-6">
      <PageHeader
        title={message("manageTitle")}
        titleId="manage-title"
        description={message("manageSummary")}
        meta={
          <StatusStamp state={stampStates[booking.status] ?? "neutral"}>
            {message(statusKeys[booking.status] ?? "manageStatusOther")}
          </StatusStamp>
        }
      />

      <Card>
        <CardHeader>
          <p className="text-xs font-semibold text-muted-foreground">
            {message("manageReferenceLabel")}
          </p>
          <ReferenceCode size="lg">{booking.publicReference}</ReferenceCode>
        </CardHeader>
        <CardContent>
          <Facts
            items={[
              {
                key: "service",
                label: message("manageServiceLabel"),
                value: booking.serviceName,
              },
              {
                key: "location",
                label: message("manageLocationLabel"),
                value: booking.locationName,
              },
              {
                key: "when",
                label: message("manageWhenLabel"),
                value: formatWallDateTime(
                  booking.startAt,
                  locale,
                  booking.customerTimeZone,
                ),
              },
              {
                key: "zone",
                label: message("manageTimezoneLabel"),
                value: formatTimeZone(
                  booking.startAt,
                  locale,
                  booking.customerTimeZone,
                ),
              },
              {
                key: "total",
                label: message("manageTotalLabel"),
                value: formatCurrency(
                  booking.price.minorUnits,
                  booking.price.currency,
                  locale,
                ),
              },
              {
                key: "policy",
                label: message("managePolicyVersionLabel"),
                value: <bdi dir="ltr">{booking.consentVersion}</bdi>,
              },
              {
                key: "expires",
                label: message("manageLinkExpiresLabel"),
                value: formatWallDateTime(
                  view.tokenExpiresAt,
                  locale,
                  booking.customerTimeZone,
                ),
              },
            ]}
          />
        </CardContent>
      </Card>

      <div className="grid gap-3">
        <Alert tone={view.canReschedule ? "positive" : "warning"}>
          {view.canReschedule
            ? message("manageRescheduleEligible")
            : message("manageRescheduleIneligible")}
        </Alert>
        <Alert tone={view.canCancel ? "positive" : "warning"}>
          {view.canCancel
            ? message("manageCancelEligible")
            : message("manageCancelIneligible")}
        </Alert>
        <p className="text-sm text-muted-foreground">
          {message("manageActionsPending")}
        </p>
      </div>

      {actionFailed === null ? null : (
        <Alert
          className="outline-none focus-visible:ring-[3px] focus-visible:ring-destructive/40"
          id="manage-action-error"
          tabIndex={-1}
          tone="danger"
        >
          <AlertTitle>{message("manageActionFailed")}</AlertTitle>
          <AlertDescription>
            {actionFailed === "conflict"
              ? message("manageActionConflict")
              : message("manageActionFailed")}
          </AlertDescription>
        </Alert>
      )}

      {view.stepUpVerified && view.intent === "cancel" ? (
        <Card aria-labelledby="manage-cancel" role="region">
          <CardHeader>
            <CardTitle id="manage-cancel">
              {message("manageCancelConfirmTitle")}
            </CardTitle>
          </CardHeader>
          <CardFooter>
            <Button
              loading={busy === "cancel"}
              loadingLabel={message("manageCancelling")}
              onClick={() => void act("cancel")}
              variant="destructive"
            >
              {message("manageCancelAction")}
            </Button>
          </CardFooter>
        </Card>
      ) : null}

      {view.stepUpVerified && view.intent === "reschedule" ? (
        <Card aria-labelledby="manage-reschedule" role="region">
          <CardHeader>
            <CardTitle id="manage-reschedule">
              {message("manageRescheduleAction")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-5"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                // The picker submits YYYY-MM-DDTHH:MM under `newStartAt`, the
                // same string the native datetime-local field produced.
                const value = new FormData(event.currentTarget).get("newStartAt");
                void act("reschedule", typeof value === "string" ? value : "");
              }}
            >
              <Field>
                <Label htmlFor="manage-new-start">
                  {message("manageRescheduleTimeLabel")}
                </Label>
                <DateTimePicker
                  aria-describedby="manage-new-start-hint"
                  datePlaceholder={message("manageRescheduleDatePlaceholder")}
                  id="manage-new-start"
                  locale={locale}
                  name="newStartAt"
                  required
                  timeLabel={message("manageRescheduleClockLabel")}
                  timePlaceholder={message("manageRescheduleTimePlaceholder")}
                />
                <FieldDescription id="manage-new-start-hint">
                  {message("manageRescheduleTimeHint")}
                </FieldDescription>
              </Field>
              <Button
                className="justify-self-start"
                loading={busy === "move"}
                loadingLabel={message("manageRescheduling")}
                type="submit"
              >
                {message("manageRescheduleAction")}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {view.stepUpRequired ? (
        <Card aria-labelledby="manage-step-up" role="region">
          <CardHeader>
            <CardTitle id="manage-step-up">{message("manageStepUpTitle")}</CardTitle>
            <CardDescription>{message("manageStepUpSummary")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            {view.stepUpVerified ? (
              <Alert tone="positive">{message("manageStepUpVerified")}</Alert>
            ) : (
              <>
                {stepUpFailed ? (
                  <Alert
                    className="outline-none focus-visible:ring-[3px] focus-visible:ring-destructive/40"
                    id="manage-step-up-error"
                    tabIndex={-1}
                    tone="danger"
                  >
                    <AlertTitle>{message("manageStepUpTitle")}</AlertTitle>
                    <AlertDescription>{message("manageStepUpFailed")}</AlertDescription>
                  </Alert>
                ) : null}
                <Button
                  className="justify-self-start"
                  loading={busy === "send"}
                  loadingLabel={message("manageStepUpSending")}
                  onClick={() => void sendCode()}
                  variant="outline"
                >
                  <Mail aria-hidden="true" />
                  {message("manageStepUpSend")}
                </Button>
                {stepUpSent ? (
                  <Alert tone="info">{message("manageStepUpSent")}</Alert>
                ) : null}
                <Separator />
                <form className="grid gap-5" noValidate onSubmit={verifyCode}>
                  <TextField
                    autoComplete="one-time-code"
                    className="max-w-xs"
                    description={message("manageStepUpCodeHint")}
                    dir="ltr"
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
                    className="justify-self-start"
                    loading={busy === "verify"}
                    loadingLabel={message("manageStepUpVerifying")}
                    type="submit"
                  >
                    {message("manageStepUpVerify")}
                  </Button>
                </form>
              </>
            )}
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
