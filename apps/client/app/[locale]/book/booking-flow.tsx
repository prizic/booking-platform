"use client";

import {
  parseConfirmBookingV1Response,
  parseCreateHoldV1Response,
  parseHoldFormV1,
  type AvailabilitySlotV1,
  type CheckoutStatusV1Response,
  type ConfirmBookingV1Response,
  type CreateHoldV1Response,
  type HoldFormV1,
} from "@wlbp/api-contracts";
import { formatCurrency, formatNumber, formatTimeZone, type Locale } from "@wlbp/i18n";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Facts,
  Field,
  FieldError,
  FieldLegend,
  FieldSet,
  Label,
  PageHeader,
  ReferenceCode,
  Separator,
  StatusStamp,
  TextField,
  cn,
} from "@wlbp/ui-foundation";
import { Check } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { formatWallDateTime } from "../../_lib/wall-time";
import {
  AvailabilityPicker,
  type AvailabilityPickerCopy,
} from "../availability-picker";

export interface BookingFlowCopy {
  readonly availability: AvailabilityPickerCopy;
  readonly booking: Readonly<Record<string, string>>;
}

interface BookingFlowProps {
  readonly copy: BookingFlowCopy;
  readonly locale: Locale;
  readonly locationId: string | null;
  readonly locationTimeZone: string;
  readonly serviceId: string | null;
}

interface HeldSlot {
  readonly form: HoldFormV1;
  readonly hold: CreateHoldV1Response;
}

/**
 * One opaque identity per browser tab. It exists so the platform can bound
 * slot hoarding and prove hold ownership; it is never authorization, and the
 * database only ever stores a tenant-salted digest of it.
 */
function sessionToken(): string {
  const existing = window.sessionStorage.getItem("wlbp.booking.session");
  if (existing !== null && existing.length >= 16) return existing;
  const created = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  window.sessionStorage.setItem("wlbp.booking.session", created);
  return created;
}

function customerTimeZone(fallback: string): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || fallback;
  } catch {
    return fallback;
  }
}

async function readError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    const code =
      typeof body === "object" && body !== null
        ? ((body as { error?: { code?: unknown } }).error?.code ?? null)
        : null;
    return typeof code === "string" ? code : "availability_unavailable";
  } catch {
    return "availability_unavailable";
  }
}

const errorCopyKeys: Readonly<Record<string, string>> = {
  capacity_exhausted: "bookingErrorSlotUnavailable",
  idempotency_conflict: "bookingErrorIdempotencyConflict",
  invalid_request: "bookingErrorInvalidRequest",
  not_authorized: "bookingErrorUnavailable",
  payment_pending: "bookingErrorPaymentPending",
  policy_denied: "bookingErrorPolicyDenied",
  revision_conflict: "bookingErrorRevisionConflict",
  slot_unavailable: "bookingErrorSlotUnavailable",
};

interface FieldProblem {
  /** The id of the control the problem belongs to. */
  readonly id: string;
  /** Shorter text shown beside the control, when it differs from the summary. */
  readonly inline?: string;
  readonly message: string;
}

type Step = 1 | 2 | 3;

function StepIndicator({
  current,
  label,
  locale,
  steps,
}: {
  current: Step;
  label: string;
  locale: Locale;
  steps: readonly [string, string, string];
}) {
  return (
    <nav aria-label={label}>
      <ol className="grid grid-cols-3 gap-2">
        {steps.map((name, index) => {
          const number = (index + 1) as Step;
          const done = number < current;
          const active = number === current;
          return (
            <li
              key={name}
              aria-current={active ? "step" : undefined}
              className={cn(
                "grid gap-2 border-t-2 pt-3 text-sm",
                active || done ? "border-primary" : "border-border",
              )}
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold",
                    active && "bg-primary text-primary-foreground",
                    done && "bg-primary-soft text-primary-ink",
                    !active && !done && "bg-neutral-2 text-muted-foreground",
                  )}
                >
                  {done ? <Check className="size-3.5" /> : formatNumber(number, locale)}
                </span>
                <span
                  className={cn(
                    "font-semibold",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {name}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function BookingFlow({
  copy,
  locale,
  locationId,
  locationTimeZone,
  serviceId,
}: BookingFlowProps) {
  const message = (key: string) => copy.booking[key] ?? key;
  const [slot, setSlot] = useState<AvailabilitySlotV1 | null>(null);
  const [held, setHeld] = useState<HeldSlot | null>(null);
  const [booking, setBooking] = useState<ConfirmBookingV1Response | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  // Each problem names the control it belongs to, so the summary can link to
  // it and the control can carry its own message.
  const [fieldErrors, setFieldErrors] = useState<readonly FieldProblem[]>([]);
  // Answers survive every failure: a lost slot never costs the customer the
  // details they already typed.
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consented, setConsented] = useState(false);
  const [intake, setIntake] = useState<Record<string, string>>({});
  // Issue #22. A payment in flight and, after the customer comes back, what our
  // own records say happened to it. The return URL itself proves nothing.
  const [checkout, setCheckout] = useState<{
    balanceMinor: number;
    currency: string;
    dueMinor: number;
    redirectUrl: string | null;
  } | null>(null);
  const [settlement, setSettlement] = useState<CheckoutStatusV1Response | null>(null);

  useEffect(() => {
    if (errorCode !== null || fieldErrors.length > 0) {
      document.querySelector<HTMLElement>("#booking-error")?.focus();
    }
  }, [errorCode, fieldErrors]);

  // Coming back from the provider. The URL says only which hold to ask about;
  // everything the customer is then told comes from our own records.
  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const returned = parameters.get("checkout");
    const holdId = parameters.get("hold");
    if ((returned !== "return" && returned !== "cancelled") || holdId === null) return;
    let abandoned = false;
    void (async () => {
      try {
        const response = await fetch("/api/checkout/status", {
          body: JSON.stringify({ holdId, sessionToken: sessionToken() }),
          credentials: "omit",
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        if (abandoned) return;
        if (!response.ok) {
          setErrorCode(await readError(response));
          return;
        }
        setSettlement((await response.json()) as CheckoutStatusV1Response);
      } catch {
        if (!abandoned) setErrorCode("availability_unavailable");
      }
    })();
    return () => {
      abandoned = true;
    };
  }, []);

  async function hold() {
    if (slot === null || serviceId === null || locationId === null) return;
    setBusy(true);
    setErrorCode(null);
    try {
      const response = await fetch("/api/holds", {
        body: JSON.stringify({
          expectedCacheTag: null,
          idempotencyKey: `hold-${slot.startAt}-${sessionToken().slice(0, 24)}`,
          locale,
          locationId,
          partySize: 1,
          serviceId,
          sessionToken: sessionToken(),
          staffPreferenceId: null,
          startAt: slot.startAt,
        }),
        credentials: "omit",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        setErrorCode(await readError(response));
        return;
      }
      const payload = (await response.json()) as { form: unknown; hold: unknown };
      setHeld({
        form: parseHoldFormV1(payload.form),
        hold: parseCreateHoldV1Response(payload.hold),
      });
    } catch {
      setErrorCode("availability_unavailable");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (held === null) return;
    const problems: FieldProblem[] = [];
    if (fullName.trim().length === 0) {
      problems.push({
        id: "booking-full-name",
        message: message("bookingNameRequired"),
      });
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(email.trim())) {
      problems.push({ id: "booking-email", message: message("bookingEmailRequired") });
    }
    for (const field of held.form.fields) {
      if (field.required && (intake[field.key] ?? "").trim().length === 0) {
        problems.push({
          id: `booking-intake-${field.key}`,
          inline: message("bookingFieldRequired"),
          message: `${field.label}: ${message("bookingFieldRequired")}`,
        });
      }
    }
    if (!consented) {
      problems.push({
        id: "booking-consent",
        message: message("bookingConsentRequired"),
      });
    }
    setFieldErrors(problems);
    if (problems.length > 0) return;

    setBusy(true);
    setErrorCode(null);
    try {
      const answers = Object.fromEntries(
        held.form.fields
          .map((field) => [field.key, (intake[field.key] ?? "").trim()] as const)
          .filter(([, answer]) => answer.length > 0),
      );
      const paid = held.form.paymentMode !== "none";
      const response = await fetch(paid ? "/api/checkout" : "/api/bookings", {
        body: JSON.stringify({
          consentVersion: held.form.consentVersion,
          contact: {
            email: email.trim().toLowerCase(),
            fullName: fullName.trim(),
            phone: phone.trim() === "" ? null : phone.trim(),
          },
          customerTimeZone: customerTimeZone(locationTimeZone),
          holdId: held.hold.holdId,
          // Derived from the hold, so a double submission is the same key and
          // the database replays the one booking it already committed.
          idempotencyKey: `confirm-${held.hold.holdId}`,
          intake: answers,
          locale,
          sessionToken: sessionToken(),
        }),
        credentials: "omit",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        setErrorCode(await readError(response));
        return;
      }
      if (paid) {
        const opened = (await response.json()) as {
          checkout: { balanceMinor: number; currency: string; dueMinor: number };
          redirectUrl: string | null;
        };
        if (opened.redirectUrl !== null) {
          // The provider page is the next step. Nothing is confirmed until a
          // signed event says the money moved.
          window.location.assign(opened.redirectUrl);
          return;
        }
        // No redirect means the provider or its function is unreachable. The
        // attempt is priced and resumable, so the customer sees that rather
        // than a dead end.
        setCheckout({ ...opened.checkout, redirectUrl: null });
        return;
      }
      setBooking(parseConfirmBookingV1Response(await response.json()));
    } catch {
      setErrorCode("availability_unavailable");
    } finally {
      setBusy(false);
    }
  }

  function chooseAnotherTime() {
    setHeld(null);
    setSlot(null);
    setErrorCode(null);
    setFieldErrors([]);
  }

  function problemFor(id: string): FieldProblem | undefined {
    return fieldErrors.find((problem) => problem.id === id);
  }

  function inlineError(id: string): string | undefined {
    const problem = problemFor(id);
    return problem === undefined ? undefined : (problem.inline ?? problem.message);
  }

  const step: Step =
    settlement !== null || checkout !== null || booking !== null
      ? 3
      : held === null
        ? 1
        : 2;

  const header = (
    <div className="grid gap-8">
      <PageHeader
        title={message("bookingTitle")}
        titleId="booking-title"
        description={message("bookingSummary")}
      />
      <StepIndicator
        current={step}
        label={message("bookingStepsLabel")}
        locale={locale}
        steps={[
          message("bookingStepSlot"),
          message("bookingStepDetails"),
          message("bookingStepConfirmed"),
        ]}
      />
    </div>
  );

  if (settlement !== null) {
    // Every state a payment can land in has a sentence and a way forward. A
    // customer whose money moved but whose slot did not is told plainly, and is
    // never shown a confirmation that does not exist.
    const settled = settlement.bookingId !== null;
    const failed =
      settlement.exceptionCode !== null ||
      settlement.status === "failed" ||
      settlement.status === "cancelled";
    return (
      <section aria-labelledby="booking-title" className="grid gap-8">
        {header}
        <Card aria-labelledby="booking-payment-title" role="region">
          <CardHeader>
            <StatusStamp state={settled ? "confirmed" : failed ? "failed" : "pending"}>
              {message(
                settled
                  ? "bookingStepConfirmed"
                  : failed
                    ? "bookingPaymentProblemStatus"
                    : "bookingPaymentPendingStatus",
              )}
            </StatusStamp>
            <CardTitle id="booking-payment-title" className="text-xl">
              {message(
                settled
                  ? "bookingSuccessTitle"
                  : settlement.exceptionCode !== null
                    ? "bookingPaymentExceptionTitle"
                    : failed
                      ? "bookingPaymentFailedTitle"
                      : "bookingPaymentPendingTitle",
              )}
            </CardTitle>
            <CardDescription>
              {message(
                settled
                  ? "bookingSuccessSummary"
                  : settlement.exceptionCode !== null
                    ? "bookingPaymentExceptionSummary"
                    : failed
                      ? "bookingPaymentFailedSummary"
                      : "bookingPaymentPendingSummary",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            {settlement.publicReference === null ? null : (
              <div className="grid gap-1">
                <p className="text-xs font-semibold text-muted-foreground">
                  {message("bookingReferenceLabel")}
                </p>
                <ReferenceCode size="lg">{settlement.publicReference}</ReferenceCode>
              </div>
            )}
            <Facts
              items={[
                {
                  key: "paid",
                  label: message("bookingPaidTodayLabel"),
                  value: formatCurrency(
                    settlement.dueMinor,
                    settlement.currency,
                    locale,
                  ),
                },
                ...(settlement.balanceMinor === 0
                  ? []
                  : [
                      {
                        key: "balance",
                        label: message("bookingBalanceDueLabel"),
                        value: formatCurrency(
                          settlement.balanceMinor,
                          settlement.currency,
                          locale,
                        ),
                      },
                    ]),
              ]}
            />
            {settled ? (
              <Alert tone="positive">{message("bookingNotificationQueued")}</Alert>
            ) : (
              <Alert tone="warning">
                {message(
                  settlement.exceptionCode === null
                    ? "bookingPaymentRetryHint"
                    : "bookingPaymentRefundHint",
                )}
              </Alert>
            )}
          </CardContent>
          <CardFooter>
            <Button onClick={chooseAnotherTime} type="button" variant="outline">
              {message("bookingRestart")}
            </Button>
          </CardFooter>
        </Card>
      </section>
    );
  }

  if (checkout !== null) {
    // The attempt is priced and resumable; only the provider hand-off failed.
    return (
      <section aria-labelledby="booking-title" className="grid gap-8">
        {header}
        <Card aria-labelledby="booking-checkout-title" role="region">
          <CardHeader>
            <StatusStamp state="failed">
              {message("bookingPaymentProblemStatus")}
            </StatusStamp>
            <CardTitle id="booking-checkout-title" className="text-xl">
              {message("bookingPaymentUnavailableTitle")}
            </CardTitle>
            <CardDescription>
              {message("bookingPaymentUnavailableSummary")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Facts
              items={[
                {
                  key: "due",
                  label: message("bookingDueTodayLabel"),
                  value: formatCurrency(checkout.dueMinor, checkout.currency, locale),
                },
                ...(checkout.balanceMinor === 0
                  ? []
                  : [
                      {
                        key: "balance",
                        label: message("bookingBalanceDueLabel"),
                        value: formatCurrency(
                          checkout.balanceMinor,
                          checkout.currency,
                          locale,
                        ),
                      },
                    ]),
              ]}
            />
          </CardContent>
          <CardFooter>
            <Button onClick={chooseAnotherTime} type="button" variant="outline">
              {message("bookingRestart")}
            </Button>
          </CardFooter>
        </Card>
      </section>
    );
  }

  if (booking !== null) {
    // An approval-gated service commits `requested`, never `confirmed`, so the
    // customer is told exactly that rather than being shown a booked time.
    const pending = booking.status === "requested";
    return (
      <section aria-labelledby="booking-title" className="grid gap-8">
        {header}
        <Card aria-labelledby="booking-confirmed-title" role="region">
          <CardHeader>
            <StatusStamp state={pending ? "requested" : "confirmed"}>
              {pending
                ? message("bookingRequestedStatus")
                : message("bookingStepConfirmed")}
            </StatusStamp>
            <CardTitle id="booking-confirmed-title" className="text-xl">
              {pending
                ? message("bookingRequestedTitle")
                : message("bookingSuccessTitle")}
            </CardTitle>
            <CardDescription>
              {pending
                ? message("bookingRequestedSummary")
                : message("bookingSuccessSummary")}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-1">
              <p className="text-xs font-semibold text-muted-foreground">
                {message("bookingReferenceLabel")}
              </p>
              <ReferenceCode size="lg">{booking.publicReference}</ReferenceCode>
            </div>
            <Facts
              items={[
                {
                  key: "service",
                  label: message("bookingServiceLabel"),
                  value: booking.serviceName,
                },
                {
                  key: "location",
                  label: message("bookingLocationLabel"),
                  value: booking.locationName,
                },
                {
                  key: "when",
                  label: message("bookingWhenLabel"),
                  value: formatWallDateTime(
                    booking.startAt,
                    locale,
                    booking.customerTimeZone,
                  ),
                },
                {
                  key: "zone",
                  label: message("bookingTimeZoneLabel"),
                  value: formatTimeZone(
                    booking.startAt,
                    locale,
                    booking.customerTimeZone,
                  ),
                },
                {
                  key: "total",
                  label: message("bookingTotalLabel"),
                  value: formatCurrency(
                    booking.price.minorUnits,
                    booking.price.currency,
                    locale,
                  ),
                },
                {
                  key: "status",
                  label: message("bookingStatusLabel"),
                  value: pending
                    ? message("bookingRequestedStatus")
                    : message("bookingStatusConfirmed"),
                },
                ...(booking.approvalDeadline === null
                  ? []
                  : [
                      {
                        key: "deadline",
                        label: message("bookingDecisionDueLabel"),
                        value: formatWallDateTime(
                          booking.approvalDeadline,
                          locale,
                          booking.customerTimeZone,
                        ),
                      },
                    ]),
                {
                  key: "consent",
                  label: message("bookingConsentVersionLabel"),
                  value: <bdi dir="ltr">{booking.consentVersion}</bdi>,
                },
              ]}
            />
            <Alert tone="positive">{message("bookingNotificationQueued")}</Alert>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {pending
                ? message("bookingRequestedNextSteps")
                : message("bookingNextSteps")}
            </p>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section aria-labelledby="booking-title" className="grid gap-8">
      {header}

      {errorCode === null && fieldErrors.length === 0 ? null : (
        <Alert
          className="outline-none focus-visible:ring-[3px] focus-visible:ring-destructive/40"
          id="booking-error"
          tabIndex={-1}
          tone="danger"
        >
          <AlertTitle>{message("bookingErrorTitle")}</AlertTitle>
          <AlertDescription className="grid justify-items-start gap-3">
            {errorCode === null ? null : (
              <p>{message(errorCopyKeys[errorCode] ?? "bookingErrorUnavailable")}</p>
            )}
            {fieldErrors.length === 0 ? null : (
              <ul className="grid list-disc gap-1 ps-5">
                {fieldErrors.map((problem) => (
                  <li key={problem.id}>
                    <a
                      className="font-semibold text-destructive underline underline-offset-4"
                      href={`#${problem.id}`}
                    >
                      {problem.message}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {held === null ? null : (
              <Button onClick={chooseAnotherTime} variant="outline">
                {message("bookingRestart")}
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {held === null ? (
        <div className="grid gap-4">
          <AvailabilityPicker
            copy={copy.availability}
            locale={locale}
            locationId={locationId}
            locationTimeZone={locationTimeZone}
            onSlotSelected={setSlot}
            serviceId={serviceId}
          />
          {slot === null ? null : (
            <Button
              className="justify-self-end"
              loading={busy}
              loadingLabel={message("bookingHolding")}
              onClick={() => void hold()}
              size="lg"
            >
              {message("bookingContinue")}
            </Button>
          )}
        </div>
      ) : (
        <Card aria-labelledby="booking-details-title" role="region">
          <CardHeader>
            <CardTitle id="booking-details-title">
              {message("bookingStepDetails")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form noValidate onSubmit={confirm} className="grid gap-6">
              <Alert tone="info">
                {message("bookingHoldExpires").replace(
                  "{time}",
                  formatWallDateTime(
                    held.hold.expiresAt,
                    locale,
                    customerTimeZone(locationTimeZone),
                  ),
                )}
              </Alert>
              <Facts
                items={[
                  {
                    key: "service",
                    label: message("bookingServiceLabel"),
                    value: held.form.serviceName,
                  },
                  {
                    key: "location",
                    label: message("bookingLocationLabel"),
                    value: held.form.locationName,
                  },
                  {
                    key: "when",
                    label: message("bookingWhenLabel"),
                    value: formatWallDateTime(
                      held.hold.slotStart,
                      locale,
                      customerTimeZone(locationTimeZone),
                    ),
                  },
                  {
                    key: "zone",
                    label: message("bookingTimeZoneLabel"),
                    value: formatTimeZone(
                      held.hold.slotStart,
                      locale,
                      customerTimeZone(locationTimeZone),
                    ),
                  },
                  {
                    key: "total",
                    label: message("bookingTotalLabel"),
                    value: formatCurrency(
                      held.hold.price.minorUnits,
                      held.hold.price.currency,
                      locale,
                    ),
                  },
                ]}
              />

              <Separator />

              <div className="grid gap-5 md:grid-cols-2">
                <TextField
                  autoComplete="name"
                  className="md:col-span-2"
                  description={message("bookingNameDescription")}
                  error={inlineError("booking-full-name")}
                  id="booking-full-name"
                  label={message("bookingNameLabel")}
                  maxLength={160}
                  name="fullName"
                  onChange={(event) => setFullName(event.currentTarget.value)}
                  required
                  value={fullName}
                />
                <TextField
                  autoComplete="email"
                  description={message("bookingEmailDescription")}
                  dir="ltr"
                  error={inlineError("booking-email")}
                  id="booking-email"
                  label={message("bookingEmailLabel")}
                  maxLength={320}
                  name="email"
                  onChange={(event) => setEmail(event.currentTarget.value)}
                  required
                  type="email"
                  value={email}
                />
                <TextField
                  autoComplete="tel"
                  description={message("bookingPhoneDescription")}
                  dir="ltr"
                  id="booking-phone"
                  label={message("bookingPhoneLabel")}
                  maxLength={40}
                  name="phone"
                  onChange={(event) => setPhone(event.currentTarget.value)}
                  type="tel"
                  value={phone}
                />
              </div>

              {held.form.fields.length === 0 ? null : (
                <FieldSet>
                  <FieldLegend>{message("bookingIntakeLegend")}</FieldLegend>
                  {held.form.fields.map((field) => (
                    <TextField
                      error={inlineError(`booking-intake-${field.key}`)}
                      id={`booking-intake-${field.key}`}
                      key={field.key}
                      label={field.label}
                      maxLength={field.maxLength}
                      name={`intake.${field.key}`}
                      onChange={(event) => {
                        // Read the value before the updater runs: React clears
                        // currentTarget once the event handler returns.
                        const answer = event.currentTarget.value;
                        setIntake((current) => ({ ...current, [field.key]: answer }));
                      }}
                      required={field.required}
                      value={intake[field.key] ?? ""}
                    />
                  ))}
                </FieldSet>
              )}

              <Field invalid={problemFor("booking-consent") !== undefined}>
                {held.form.consentText === "" ? null : (
                  <p className="rounded-md bg-muted px-4 py-3 text-sm leading-relaxed text-muted-foreground">
                    {held.form.consentText}
                  </p>
                )}
                <div className="flex items-start gap-3">
                  <Checkbox
                    aria-describedby={
                      problemFor("booking-consent") === undefined
                        ? undefined
                        : "booking-consent-error"
                    }
                    aria-invalid={
                      problemFor("booking-consent") === undefined ? undefined : true
                    }
                    checked={consented}
                    className="mt-0.5"
                    id="booking-consent"
                    name="consent"
                    onCheckedChange={(checked) => setConsented(checked === true)}
                  />
                  <Label htmlFor="booking-consent" className="font-medium">
                    {message("bookingConsentLabel")}
                  </Label>
                </div>
                <FieldError id="booking-consent-error">
                  {inlineError("booking-consent")}
                </FieldError>
              </Field>

              {/* Issue #22. What this will cost, stated before the customer is sent
                  anywhere, and taken from the server's own figures. */}
              {held.form.paymentMode === "none" ? null : (
                <Facts
                  items={[
                    {
                      key: "due",
                      label: message("bookingDueTodayLabel"),
                      value: formatCurrency(
                        held.form.dueMinor,
                        held.hold.price.currency,
                        locale,
                      ),
                    },
                    ...(held.form.balanceMinor === 0
                      ? []
                      : [
                          {
                            key: "balance",
                            label: message("bookingBalanceDueLabel"),
                            value: formatCurrency(
                              held.form.balanceMinor,
                              held.hold.price.currency,
                              locale,
                            ),
                          },
                        ]),
                  ]}
                />
              )}
              {held.form.paymentMode === "deposit" ? (
                <Alert tone="info">{message("bookingDepositNotice")}</Alert>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  loading={busy}
                  loadingLabel={message("bookingSubmitting")}
                  size="lg"
                  type="submit"
                >
                  {message(
                    held.form.paymentMode === "none"
                      ? "bookingSubmit"
                      : "bookingPayAction",
                  )}
                </Button>
                <Button onClick={chooseAnotherTime} size="lg" variant="ghost">
                  {message("bookingRestart")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
