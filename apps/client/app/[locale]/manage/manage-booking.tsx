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
  type Locale,
} from "@wlbp/i18n";
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
  DatePicker,
  Facts,
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
  Skeleton,
  StatusStamp,
  TimeSelect,
  useZodForm,
  type StampState,
} from "@wlbp/ui-foundation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { z } from "zod";

import { formatWallDateTime } from "../../_lib/wall-time";
import {
  manageFormCodes,
  rescheduleFormSchema,
  rescheduleStartAt,
  verifyStepUpSchema,
  type ManageActionInput,
  type ManageViewInput,
  type RequestStepUpInput,
} from "./manage-schema";

interface ManageBookingProps {
  readonly copy: Readonly<Record<string, string>>;
  readonly locale: Locale;
  readonly token: string | null;
}

type GrantedView = Extract<ManagementViewV1, { outcome: "granted" }>;
type AppliedAction = Extract<ManagementActionV1, { outcome: "applied" }>;

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

async function callManage(body: unknown): Promise<unknown> {
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

/** The cache entry for one link's booking view. */
function manageViewKey(token: string | null) {
  return ["manage", "view", token] as const;
}

export function ManageBooking({ copy, locale, token }: ManageBookingProps) {
  const message = (key: string) => copy[key] ?? key;
  const queryClient = useQueryClient();
  const formMessages = useMemo(
    () => ({
      [manageFormCodes.codeFormat]: copy.manageStepUpCodeFormat ?? "",
      [manageFormCodes.timeUnavailable]: copy.manageRescheduleTimeUnavailable ?? "",
    }),
    [copy],
  );
  const viewQuery = useQuery({
    enabled: token !== null,
    queryKey: manageViewKey(token),
    queryFn: async () =>
      parseManagementViewV1(
        await callManage({ intent: "view", token: token! } satisfies ManageViewInput),
      ),
    // Redeeming the link is an audited read: only on load and after a change.
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: Infinity,
  });
  // Any failure to read is the same refusal as a refused link.
  const view: ManagementViewV1 | null =
    viewQuery.data ?? (viewQuery.isError ? { outcome: "unavailable" } : null);

  const [applied, setApplied] = useState<{
    readonly action: AppliedAction;
    readonly booking: GrantedView["booking"];
  } | null>(null);
  const act = useMutation({
    mutationFn: async ({
      body,
    }: {
      body: ManageActionInput;
      booking: GrantedView["booking"];
    }) => parseManagementActionV1(await callManage(body)),
    // The confirmation keeps the booking the customer acted on, whatever the
    // refreshed view later says about the link.
    onSuccess: (result, { booking }) => {
      if (result.outcome === "applied") setApplied({ action: result, booking });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: manageViewKey(token) }),
    retry: false,
  });
  // A refusal is indistinguishable, so the page says what is true for the
  // customer: nothing changed, and the newest email is authoritative.
  const actionFailed = act.isError
    ? "failed"
    : act.data !== undefined && act.data.outcome !== "applied"
      ? "conflict"
      : null;

  function runAction(body: ManageActionInput, booking: GrantedView["booking"]) {
    act.mutate({ body, booking });
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

  if (applied !== null) {
    const { action, booking } = applied;
    return (
      <section aria-labelledby="manage-title" className="grid gap-6">
        <PageHeader
          title={
            action.status === "cancelled"
              ? message("manageCancelled")
              : message("manageRescheduled")
          }
          titleId="manage-title"
          meta={
            <>
              <StatusStamp
                state={action.status === "cancelled" ? "cancelled" : "confirmed"}
              >
                {message(statusKeys[action.status] ?? "manageStatusOther")}
              </StatusStamp>
              <ReferenceCode>{booking.publicReference}</ReferenceCode>
            </>
          }
        />
        {action.startAt === null ? null : (
          <Alert tone="positive">
            {formatDateTime(action.startAt, locale, booking.customerTimeZone)}
          </Alert>
        )}
        {action.refund === null ? null : (
          <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
            {action.refund.minorUnits > 0
              ? message("manageCancelRefund").replace(
                  "{amount}",
                  formatCurrency(
                    action.refund.minorUnits,
                    action.refund.currency,
                    locale,
                  ),
                )
              : message("manageCancelNoRefund")}
          </p>
        )}
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
              loading={act.isPending && act.variables?.body.action === "cancel"}
              loadingLabel={message("manageCancelling")}
              onClick={() =>
                runAction(
                  {
                    action: "cancel",
                    expectedRevision: booking.bookingRevision,
                    newStartAt: null,
                    token,
                  },
                  booking,
                )
              }
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
            <RescheduleForm
              customerTimeZone={booking.customerTimeZone}
              locale={locale}
              message={message}
              messages={formMessages}
              onResolved={(newStartAt) =>
                runAction(
                  {
                    action: "reschedule",
                    expectedRevision: booking.bookingRevision,
                    newStartAt,
                    token,
                  },
                  booking,
                )
              }
              pending={act.isPending && act.variables?.body.action === "reschedule"}
            />
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
              <StepUp
                locale={locale}
                message={message}
                messages={formMessages}
                onVerified={() =>
                  queryClient.invalidateQueries({ queryKey: manageViewKey(token) })
                }
                token={token}
              />
            )}
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}

interface StepUpProps {
  readonly locale: Locale;
  readonly message: (key: string) => string;
  readonly messages: Readonly<Record<string, string>>;
  /** Re-reads the view once the code is accepted. */
  readonly onVerified: () => Promise<unknown>;
  readonly token: string;
}

/** Email a one-time code, then confirm it before the link may act. */
function StepUp({ locale, message, messages, onVerified, token }: StepUpProps) {
  const form = useZodForm(verifyStepUpSchema, {
    defaultValues: { action: "verify-step-up", code: "", token },
  });
  const verify = useMutation({
    mutationFn: async (input: z.output<typeof verifyStepUpSchema>) =>
      (await callManage(input)) as { verified?: unknown },
    onSuccess: async (result) => {
      if (result.verified === true) await onVerified();
    },
    retry: false,
  });
  const sendCode = useMutation({
    mutationFn: async (input: RequestStepUpInput) =>
      parseManagementStepUpV1(await callManage(input)),
    retry: false,
  });
  // Whether a code was really sent is not something this page may confirm, so
  // a failure renders the same message as a success.
  const stepUpSent = sendCode.isSuccess || sendCode.isError;
  const stepUpFailed =
    verify.isError || (verify.isSuccess && verify.data.verified !== true);

  return (
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
        loading={sendCode.isPending}
        loadingLabel={message("manageStepUpSending")}
        onClick={() => {
          verify.reset();
          sendCode.mutate({ action: "request-step-up", token });
        }}
        variant="outline"
      >
        <Mail aria-hidden="true" />
        {message("manageStepUpSend")}
      </Button>
      {stepUpSent ? <Alert tone="info">{message("manageStepUpSent")}</Alert> : null}
      <Separator />
      <Form form={form} locale={locale} messages={messages}>
        <form
          className="grid gap-5"
          noValidate
          onSubmit={(event) =>
            void form.handleSubmit((values) => verify.mutate(values))(event)
          }
        >
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem className="max-w-xs">
                <FormLabel htmlFor="manage-step-up-code" required>
                  {message("manageStepUpCodeLabel")}
                </FormLabel>
                <FormDescription>{message("manageStepUpCodeHint")}</FormDescription>
                <FormControl>
                  <Input
                    {...field}
                    autoComplete="one-time-code"
                    dir="ltr"
                    id="manage-step-up-code"
                    inputMode="numeric"
                    maxLength={6}
                    name="code"
                    required
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button
            className="justify-self-start"
            loading={verify.isPending}
            loadingLabel={message("manageStepUpVerifying")}
            type="submit"
          >
            {message("manageStepUpVerify")}
          </Button>
        </form>
      </Form>
    </>
  );
}

interface RescheduleFormProps {
  readonly customerTimeZone: string;
  readonly locale: Locale;
  readonly message: (key: string) => string;
  readonly messages: Readonly<Record<string, string>>;
  /** Receives the one instant the chosen wall time names. */
  readonly onResolved: (newStartAt: string) => void;
  readonly pending: boolean;
}

/**
 * The new time is picked as wall time in the customer's own booking timezone
 * and resolved there by the schema; a DST gap or a repeated hour is refused
 * on the field instead of guessed.
 */
function RescheduleForm({
  customerTimeZone,
  locale,
  message,
  messages,
  onResolved,
  pending,
}: RescheduleFormProps) {
  const form = useZodForm(rescheduleFormSchema, {
    defaultValues: { customerTimeZone, date: "", time: "" },
  });
  return (
    <Form form={form} locale={locale} messages={messages}>
      <form
        className="grid gap-5"
        noValidate
        onSubmit={(event) =>
          void form.handleSubmit((values) => onResolved(rescheduleStartAt(values)))(
            event,
          )
        }
      >
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="manage-new-start" required>
                  {message("manageRescheduleTimeLabel")}
                </FormLabel>
                <FormControl>
                  <DatePicker
                    id="manage-new-start"
                    locale={locale}
                    name="newStartDate"
                    onValueChange={field.onChange}
                    placeholder={message("manageRescheduleDatePlaceholder")}
                    required
                    value={field.value}
                  />
                </FormControl>
                <FormDescription>{message("manageRescheduleTimeHint")}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="time"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="manage-new-start-time" required>
                  {message("manageRescheduleClockLabel")}
                </FormLabel>
                <FormControl>
                  <TimeSelect
                    id="manage-new-start-time"
                    locale={locale}
                    name="newStartTime"
                    onValueChange={field.onChange}
                    placeholder={message("manageRescheduleTimePlaceholder")}
                    required
                    value={field.value}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <Button
          className="justify-self-start"
          loading={pending}
          loadingLabel={message("manageRescheduling")}
          type="submit"
        >
          {message("manageRescheduleAction")}
        </Button>
      </form>
    </Form>
  );
}
