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
  FieldLegend,
  FieldSet,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  PageHeader,
  ReferenceCode,
  Separator,
  StatusStamp,
  cn,
  formErrorMessage,
  useZodForm,
} from "@wlbp/ui-foundation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { errorCodeOf, postJson } from "../../_lib/client-api";
import { formatWallDateTime } from "../../_lib/wall-time";
import {
  AvailabilityPicker,
  type AvailabilityPickerCopy,
} from "../availability-picker";
import {
  bookingDetailsFormSchema,
  bookingFormCodes,
  type BookingDetailsValues,
  type CheckoutStatusInput,
  type CreateHoldInput,
} from "./booking-schema";

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

interface OpenedCheckout {
  readonly checkout: { balanceMinor: number; currency: string; dueMinor: number };
  readonly redirectUrl: string | null;
}

type Confirmation =
  | { readonly kind: "booking"; readonly booking: ConfirmBookingV1Response }
  | { readonly kind: "checkout"; readonly opened: OpenedCheckout };

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

/**
 * Coming back from the provider. The URL says only which hold to ask about;
 * everything the customer is then told comes from our own records.
 */
function returnedHoldId(): string | null {
  if (typeof window === "undefined") return null;
  const parameters = new URLSearchParams(window.location.search);
  const returned = parameters.get("checkout");
  const holdId = parameters.get("hold");
  return (returned === "return" || returned === "cancelled") && holdId !== null
    ? holdId
    : null;
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

/** Domain validation codes and the copy that explains each. */
const formCodeCopyKeys: Readonly<Record<string, string>> = {
  [bookingFormCodes.consentRequired]: "bookingConsentRequired",
  [bookingFormCodes.emailRequired]: "bookingEmailRequired",
  [bookingFormCodes.fieldRequired]: "bookingFieldRequired",
  [bookingFormCodes.nameRequired]: "bookingNameRequired",
};

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
  const queryClient = useQueryClient();
  const [slot, setSlot] = useState<AvailabilitySlotV1 | null>(null);
  const [held, setHeld] = useState<HeldSlot | null>(null);
  const [booking, setBooking] = useState<ConfirmBookingV1Response | null>(null);
  // Issue #22. A payment in flight and, after the customer comes back, what our
  // own records say happened to it. The return URL itself proves nothing.
  const [checkout, setCheckout] = useState<{
    balanceMinor: number;
    currency: string;
    dueMinor: number;
    redirectUrl: string | null;
  } | null>(null);
  const [returnHold, setReturnHold] = useState<string | null>(returnedHoldId);
  const [summaryFocus, setSummaryFocus] = useState(0);

  const formMessages = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(formCodeCopyKeys).map(([code, key]) => [
          code,
          copy.booking[key] ?? key,
        ]),
      ),
    [copy.booking],
  );
  // Answers survive every failure: the form outlives each hold, so a lost slot
  // never costs the customer the details they already typed.
  const detailsSchema = useMemo(
    () => bookingDetailsFormSchema(held?.form.fields ?? []),
    [held],
  );
  const form = useZodForm(detailsSchema, {
    defaultValues: {
      consent: false,
      consentVersion: "",
      contact: { email: "", fullName: "", phone: "" },
      customerTimeZone: locationTimeZone,
      holdId: "",
      idempotencyKey: "",
      intake: {},
      locale,
      sessionToken: "",
    },
    // The error summary takes focus instead, then links to each field.
    shouldFocusError: false,
  });

  const settlementQuery = useQuery({
    enabled: returnHold !== null,
    queryKey: ["checkout-status", returnHold],
    queryFn: async () =>
      (await postJson("/api/checkout/status", {
        holdId: returnHold!,
        sessionToken: sessionToken(),
      } satisfies CheckoutStatusInput)) as CheckoutStatusV1Response,
    // Our records are read once per return; the customer restarts explicitly.
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: Infinity,
  });
  const settlement: CheckoutStatusV1Response | null =
    returnHold === null ? null : (settlementQuery.data ?? null);

  const holdMutation = useMutation({
    mutationFn: async (input: CreateHoldInput): Promise<HeldSlot> => {
      const payload = (await postJson("/api/holds", input)) as {
        form: unknown;
        hold: unknown;
      };
      return {
        form: parseHoldFormV1(payload.form),
        hold: parseCreateHoldV1Response(payload.hold),
      };
    },
    onSuccess: (next) => {
      // The hold decides the technical half of the details form.
      form.setValue("consentVersion", next.form.consentVersion);
      form.setValue("customerTimeZone", customerTimeZone(locationTimeZone));
      form.setValue("holdId", next.hold.holdId);
      // Derived from the hold, so a double submission is the same key and the
      // database replays the one booking it already committed.
      form.setValue("idempotencyKey", `confirm-${next.hold.holdId}`);
      form.setValue("sessionToken", sessionToken());
      setHeld(next);
      void queryClient.invalidateQueries({ queryKey: ["availability"] });
    },
    retry: false,
  });

  const confirmMutation = useMutation({
    mutationFn: async ({
      body,
      paid,
    }: {
      body: BookingDetailsValues;
      paid: boolean;
    }): Promise<Confirmation> => {
      const result = await postJson(paid ? "/api/checkout" : "/api/bookings", body);
      return paid
        ? { kind: "checkout", opened: result as OpenedCheckout }
        : { kind: "booking", booking: parseConfirmBookingV1Response(result) };
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["availability"] });
      if (result.kind === "booking") {
        setBooking(result.booking);
        return;
      }
      if (result.opened.redirectUrl !== null) {
        // The provider page is the next step. Nothing is confirmed until a
        // signed event says the money moved.
        window.location.assign(result.opened.redirectUrl);
        return;
      }
      // No redirect means the provider or its function is unreachable. The
      // attempt is priced and resumable, so the customer sees that rather than
      // a dead end.
      setCheckout({ ...result.opened.checkout, redirectUrl: null });
    },
    retry: false,
  });

  const errorCode = holdMutation.isError
    ? errorCodeOf(holdMutation.error)
    : confirmMutation.isError
      ? errorCodeOf(confirmMutation.error)
      : settlementQuery.isError
        ? errorCodeOf(settlementQuery.error)
        : null;

  useEffect(() => {
    if (errorCode !== null) {
      document.querySelector<HTMLElement>("#booking-error")?.focus();
    }
  }, [errorCode]);

  useEffect(() => {
    if (summaryFocus > 0) {
      document.querySelector<HTMLElement>("#booking-error")?.focus();
    }
  }, [summaryFocus]);

  function hold() {
    if (slot === null || serviceId === null || locationId === null) return;
    holdMutation.mutate({
      expectedCacheTag: null,
      idempotencyKey: `hold-${slot.startAt}-${sessionToken().slice(0, 24)}`,
      locale,
      locationId,
      partySize: 1,
      serviceId,
      sessionToken: sessionToken(),
      staffPreferenceId: null,
      startAt: slot.startAt,
    });
  }

  const confirm = form.handleSubmit(
    (values) => {
      if (held === null) return;
      confirmMutation.mutate({ body: values, paid: held.form.paymentMode !== "none" });
    },
    () => setSummaryFocus((count) => count + 1),
  );

  function chooseAnotherTime() {
    setHeld(null);
    setSlot(null);
    setCheckout(null);
    setReturnHold(null);
    holdMutation.reset();
    confirmMutation.reset();
    form.clearErrors();
  }

  // Each problem names the control it belongs to, so the summary can link to
  // it and the control carries its own message.
  const { formState } = form;
  const problemText = (path: string) => {
    const code = form.getFieldState(
      path as Parameters<typeof form.getFieldState>[0],
      formState,
    ).error?.message;
    return formErrorMessage(
      typeof code === "string" ? code : undefined,
      locale,
      formMessages,
    );
  };
  // The hold supplies these; a problem with one is not something the customer
  // can fix in a field, so it reads as a request to check and try again.
  const technicalProblem =
    formState.submitCount > 0 &&
    (
      [
        "consentVersion",
        "customerTimeZone",
        "holdId",
        "idempotencyKey",
        "locale",
        "sessionToken",
      ] as const
    ).some((path) => form.getFieldState(path, formState).error !== undefined);
  const problems =
    formState.submitCount === 0
      ? []
      : [
          { id: "booking-full-name", text: problemText("contact.fullName") },
          { id: "booking-email", text: problemText("contact.email") },
          { id: "booking-phone", text: problemText("contact.phone") },
          ...(held?.form.fields ?? []).map((field) => {
            const text = problemText(`intake.${field.key}`);
            return {
              id: `booking-intake-${field.key}`,
              text: text === undefined ? undefined : `${field.label}: ${text}`,
            };
          }),
          { id: "booking-consent", text: problemText("consent") },
        ].filter((problem): problem is { id: string; text: string } =>
          Boolean(problem.text),
        );

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

      {errorCode === null && problems.length === 0 && !technicalProblem ? null : (
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
            {technicalProblem && errorCode === null ? (
              <p>{message("bookingErrorInvalidRequest")}</p>
            ) : null}
            {problems.length === 0 ? null : (
              <ul className="grid list-disc gap-1 ps-5">
                {problems.map((problem) => (
                  <li key={problem.id}>
                    <a
                      className="font-semibold text-destructive underline underline-offset-4"
                      href={`#${problem.id}`}
                    >
                      {problem.text}
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
              loading={holdMutation.isPending}
              loadingLabel={message("bookingHolding")}
              onClick={hold}
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
            <Form form={form} locale={locale} messages={formMessages}>
              <form
                noValidate
                onSubmit={(event) => void confirm(event)}
                className="grid gap-6"
              >
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
                  <FormField
                    control={form.control}
                    name="contact.fullName"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel htmlFor="booking-full-name" required>
                          {message("bookingNameLabel")}
                        </FormLabel>
                        <FormDescription>
                          {message("bookingNameDescription")}
                        </FormDescription>
                        <FormControl>
                          <Input
                            {...field}
                            autoComplete="name"
                            id="booking-full-name"
                            maxLength={160}
                            name="fullName"
                            required
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="contact.email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel htmlFor="booking-email" required>
                          {message("bookingEmailLabel")}
                        </FormLabel>
                        <FormDescription>
                          {message("bookingEmailDescription")}
                        </FormDescription>
                        <FormControl>
                          <Input
                            {...field}
                            autoComplete="email"
                            dir="ltr"
                            id="booking-email"
                            maxLength={320}
                            name="email"
                            required
                            type="email"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="contact.phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel htmlFor="booking-phone">
                          {message("bookingPhoneLabel")}
                        </FormLabel>
                        <FormDescription>
                          {message("bookingPhoneDescription")}
                        </FormDescription>
                        <FormControl>
                          <Input
                            {...field}
                            autoComplete="tel"
                            dir="ltr"
                            id="booking-phone"
                            maxLength={40}
                            name="phone"
                            type="tel"
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {held.form.fields.length === 0 ? null : (
                  <FieldSet>
                    <FieldLegend>{message("bookingIntakeLegend")}</FieldLegend>
                    {held.form.fields.map((question) => (
                      <FormField
                        control={form.control}
                        key={question.key}
                        name={`intake.${question.key}`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel
                              htmlFor={`booking-intake-${question.key}`}
                              required={question.required}
                            >
                              {question.label}
                            </FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                id={`booking-intake-${question.key}`}
                                maxLength={question.maxLength}
                                name={`intake.${question.key}`}
                                required={question.required}
                                value={field.value ?? ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ))}
                  </FieldSet>
                )}

                <FormField
                  control={form.control}
                  name="consent"
                  render={({ field }) => (
                    <FormItem>
                      {held.form.consentText === "" ? null : (
                        <p className="rounded-md bg-muted px-4 py-3 text-sm leading-relaxed text-muted-foreground">
                          {held.form.consentText}
                        </p>
                      )}
                      <div className="flex items-start gap-3">
                        <FormControl>
                          <Checkbox
                            checked={field.value === true}
                            className="mt-0.5"
                            id="booking-consent"
                            name="consent"
                            onBlur={field.onBlur}
                            onCheckedChange={(checked) =>
                              field.onChange(checked === true)
                            }
                            ref={field.ref}
                          />
                        </FormControl>
                        <FormLabel htmlFor="booking-consent" className="font-medium">
                          {message("bookingConsentLabel")}
                        </FormLabel>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

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
                    loading={confirmMutation.isPending}
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
            </Form>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
