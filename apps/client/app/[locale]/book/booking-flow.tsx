"use client";

import {
  parseConfirmBookingV1Response,
  parseCreateHoldV1Response,
  parseHoldFormV1,
  type AvailabilitySlotV1,
  type ConfirmBookingV1Response,
  type CreateHoldV1Response,
  type HoldFormV1,
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
import { useEffect, useState, type FormEvent } from "react";

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
  const [fieldErrors, setFieldErrors] = useState<readonly string[]>([]);
  // Answers survive every failure: a lost slot never costs the customer the
  // details they already typed.
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consented, setConsented] = useState(false);
  const [intake, setIntake] = useState<Record<string, string>>({});

  useEffect(() => {
    if (errorCode !== null || fieldErrors.length > 0) {
      document.querySelector<HTMLElement>("#booking-error")?.focus();
    }
  }, [errorCode, fieldErrors]);

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
    const problems: string[] = [];
    if (fullName.trim().length === 0) problems.push(message("bookingNameRequired"));
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(email.trim())) {
      problems.push(message("bookingEmailRequired"));
    }
    for (const field of held.form.fields) {
      if (field.required && (intake[field.key] ?? "").trim().length === 0) {
        problems.push(`${field.label}: ${message("bookingFieldRequired")}`);
      }
    }
    if (!consented) problems.push(message("bookingConsentRequired"));
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
      const response = await fetch("/api/bookings", {
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

  if (booking !== null) {
    // An approval-gated service commits `requested`, never `confirmed`, so the
    // customer is told exactly that rather than being shown a booked time.
    const pending = booking.status === "requested";
    return (
      <Surface
        as="section"
        className="booking-confirmed"
        labelledBy="booking-confirmed-title"
      >
        <Badge tone={pending ? "warning" : "positive"}>
          {pending
            ? message("bookingRequestedStatus")
            : message("bookingStepConfirmed")}
        </Badge>
        <h2 id="booking-confirmed-title">
          {pending ? message("bookingRequestedTitle") : message("bookingSuccessTitle")}
        </h2>
        <p>
          {pending
            ? message("bookingRequestedSummary")
            : message("bookingSuccessSummary")}
        </p>
        <dl className="booking-confirmed__facts">
          <div>
            <dt>{message("bookingReferenceLabel")}</dt>
            <dd dir="ltr">{booking.publicReference}</dd>
          </div>
          <div>
            <dt>{message("bookingServiceLabel")}</dt>
            <dd>{booking.serviceName}</dd>
          </div>
          <div>
            <dt>{message("bookingLocationLabel")}</dt>
            <dd>{booking.locationName}</dd>
          </div>
          <div>
            <dt>{message("bookingWhenLabel")}</dt>
            <dd>
              {formatDateTime(booking.startAt, locale, booking.customerTimeZone)}{" "}
              <span dir="ltr">({booking.customerTimeZone})</span>
            </dd>
          </div>
          <div>
            <dt>{message("bookingTotalLabel")}</dt>
            <dd>
              {formatCurrency(booking.price.minorUnits, booking.price.currency, locale)}
            </dd>
          </div>
          <div>
            <dt>{message("bookingStatusLabel")}</dt>
            <dd>
              {pending
                ? message("bookingRequestedStatus")
                : message("bookingStatusConfirmed")}
            </dd>
          </div>
          {booking.approvalDeadline === null ? null : (
            <div>
              <dt>{message("bookingDecisionDueLabel")}</dt>
              <dd>
                {formatDateTime(
                  booking.approvalDeadline,
                  locale,
                  booking.customerTimeZone,
                )}
              </dd>
            </div>
          )}
          <div>
            <dt>{message("bookingConsentVersionLabel")}</dt>
            <dd dir="ltr">{booking.consentVersion}</dd>
          </div>
        </dl>
        <StatusMessage tone="positive">
          {message("bookingNotificationQueued")}
        </StatusMessage>
        <p>
          {pending ? message("bookingRequestedNextSteps") : message("bookingNextSteps")}
        </p>
      </Surface>
    );
  }

  return (
    <section aria-labelledby="booking-title" className="booking-flow">
      <h1 id="booking-title">{message("bookingTitle")}</h1>
      <p>{message("bookingSummary")}</p>

      {errorCode === null && fieldErrors.length === 0 ? null : (
        <ErrorSummary
          focusTarget
          id="booking-error"
          title={message("bookingErrorTitle")}
        >
          {errorCode === null ? null : (
            <p>{message(errorCopyKeys[errorCode] ?? "bookingErrorUnavailable")}</p>
          )}
          {fieldErrors.length === 0 ? null : (
            <ul>
              {fieldErrors.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
          {held === null ? null : (
            <Button onClick={chooseAnotherTime} variant="secondary">
              {message("bookingRestart")}
            </Button>
          )}
        </ErrorSummary>
      )}

      {held === null ? (
        <>
          <h2>{message("bookingStepSlot")}</h2>
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
              loading={busy}
              loadingLabel={message("bookingHolding")}
              onClick={() => void hold()}
            >
              {message("bookingContinue")}
            </Button>
          )}
        </>
      ) : (
        <form noValidate onSubmit={confirm}>
          <h2>{message("bookingStepDetails")}</h2>
          <StatusMessage>
            {message("bookingHoldExpires").replace(
              "{time}",
              formatDateTime(
                held.hold.expiresAt,
                locale,
                customerTimeZone(locationTimeZone),
              ),
            )}
          </StatusMessage>
          <dl className="booking-flow__review">
            <div>
              <dt>{message("bookingServiceLabel")}</dt>
              <dd>{held.form.serviceName}</dd>
            </div>
            <div>
              <dt>{message("bookingLocationLabel")}</dt>
              <dd>{held.form.locationName}</dd>
            </div>
            <div>
              <dt>{message("bookingWhenLabel")}</dt>
              <dd>
                {formatDateTime(
                  held.hold.slotStart,
                  locale,
                  customerTimeZone(locationTimeZone),
                )}
              </dd>
            </div>
            <div>
              <dt>{message("bookingTotalLabel")}</dt>
              <dd>
                {formatCurrency(
                  held.hold.price.minorUnits,
                  held.hold.price.currency,
                  locale,
                )}
              </dd>
            </div>
          </dl>

          <TextField
            autoComplete="name"
            description={message("bookingNameDescription")}
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
            id="booking-phone"
            label={message("bookingPhoneLabel")}
            maxLength={40}
            name="phone"
            onChange={(event) => setPhone(event.currentTarget.value)}
            type="tel"
            value={phone}
          />

          {held.form.fields.length === 0 ? null : (
            <fieldset>
              <legend>{message("bookingIntakeLegend")}</legend>
              {held.form.fields.map((field) => (
                <TextField
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
            </fieldset>
          )}

          {held.form.consentText === "" ? null : <p>{held.form.consentText}</p>}
          <label className="booking-flow__consent" htmlFor="booking-consent">
            <input
              checked={consented}
              id="booking-consent"
              name="consent"
              onChange={(event) => setConsented(event.currentTarget.checked)}
              type="checkbox"
            />
            <span>{message("bookingConsentLabel")}</span>
          </label>

          <Button
            loading={busy}
            loadingLabel={message("bookingSubmitting")}
            type="submit"
          >
            {message("bookingSubmit")}
          </Button>
          <Button onClick={chooseAnotherTime} variant="secondary">
            {message("bookingRestart")}
          </Button>
        </form>
      )}
    </section>
  );
}
