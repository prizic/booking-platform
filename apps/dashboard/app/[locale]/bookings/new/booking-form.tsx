"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useWatch } from "react-hook-form";
import type { Locale } from "@wlbp/i18n";
import type { AvailabilitySlotV1 } from "@wlbp/api-contracts";
import {
  Alert,
  AlertDescription,
  applyActionErrors,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  DatePicker,
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSet,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useActionMutation,
  useZodForm,
} from "@wlbp/ui-foundation";
import { formErrorMessage } from "@wlbp/ui-foundation/actions";
import type { OperationalChoices } from "../../../_lib/operational-choices";
import { civilDate } from "../../calendar/calendar-range";
import { availableOnBehalf, holdOnBehalf, confirmOnBehalf } from "./actions";
import { bookingMessage, type BookingMessage } from "./booking-copy";
import {
  anyStaff,
  offerKey,
  onBehalfConfirmSchema,
  onBehalfHoldSchema,
  onBehalfSearchSchema,
} from "./on-behalf-schema";
import { formatWhen } from "../../../_lib/booking-display";
import { dashboardFormMessages } from "../../../_lib/form-messages";
import { useSyncedValue } from "../../../_lib/ui/use-workspace-mutation";
import { workspaceMessage } from "../../../_lib/workspace-copy";
import { Money } from "../../../_lib/ui/money";

type Held = Extract<Awaited<ReturnType<typeof holdOnBehalf>>, { ok: true }>["data"];

/** The refusals this flow names in its own words; the rest read generically. */
const bookingCodes = [
  "slot_unavailable",
  "capacity_exhausted",
  "policy_denied",
  "revision_conflict",
  "payment_pending",
  "idempotency_conflict",
  "denied",
  "unavailable",
] as const satisfies readonly BookingMessage[];

function onBehalfMessages(locale: Locale): Readonly<Record<string, string>> {
  return {
    ...dashboardFormMessages(locale),
    ...Object.fromEntries(
      bookingCodes.map((code) => [code, bookingMessage(locale, code)]),
    ),
  };
}

export function OnBehalfBookingForm({
  locale,
  choices,
  attempt,
}: {
  locale: Locale;
  choices: OperationalChoices;
  attempt: string;
}) {
  const router = useRouter();
  const offers = choices.offers.filter((o) => o.canCreate);
  const first = offers[0];
  const messages = onBehalfMessages(locale);
  const [slots, setSlots] = useState<readonly AvailabilitySlotV1[] | null>(null);
  const [held, setHeld] = useState<Held | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState(attempt);
  const [sessionToken, setSessionToken] = useState("");
  const [now, setNow] = useState(0);
  useEffect(() => {
    const initialize = setTimeout(() => {
      setSessionToken(
        crypto.randomUUID().replaceAll("-", "") +
          crypto.randomUUID().replaceAll("-", ""),
      );
      setNow(Date.now());
    }, 0);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(initialize);
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (error) document.getElementById("on-behalf-error")?.focus();
  }, [error]);
  const message = (key: BookingMessage) => bookingMessage(locale, key);

  // Step 1: which offer, day and staff preference to search.
  const searchForm = useZodForm(onBehalfSearchSchema, {
    defaultValues: {
      locale,
      offer: first ? offerKey(first) : "",
      timeZone: first?.timeZone ?? "Asia/Riyadh",
      date: civilDate(new Date(), first?.timeZone ?? "Asia/Riyadh"),
      staffId: anyStaff,
    },
  });
  const chosenKey = useWatch({ control: searchForm.control, name: "offer" });
  const chosenStaff = useWatch({ control: searchForm.control, name: "staffId" });
  const offer = offers.find((o) => offerKey(o) === chosenKey) ?? first;

  // Step 2: the slot to hold, for exactly that search and this attempt.
  const holdForm = useZodForm(onBehalfHoldSchema, {
    defaultValues: {
      locale,
      offer: chosenKey,
      staffId: chosenStaff,
      start: "",
      sessionToken: "",
      requestId: attempt,
    },
  });
  useSyncedValue(holdForm, "offer", chosenKey);
  useSyncedValue(holdForm, "staffId", chosenStaff);
  useSyncedValue(holdForm, "sessionToken", sessionToken);
  useSyncedValue(holdForm, "requestId", requestId);
  const start = useWatch({ control: holdForm.control, name: "start" });

  // Step 3: contact, intake and consent for the held time. The contact card is
  // shown from the start and kept across restarts.
  const confirmForm = useZodForm(onBehalfConfirmSchema, {
    defaultValues: {
      locale,
      fullName: "",
      email: "",
      phone: "",
      consented: false,
      answers: {},
      intakeFields: [],
      holdId: "",
      sessionToken: "",
      requestId: attempt,
      consentVersion: "",
      customerTimeZone: first?.timeZone ?? "Asia/Riyadh",
    },
  });
  useSyncedValue(confirmForm, "sessionToken", sessionToken);
  useSyncedValue(confirmForm, "requestId", requestId);
  useSyncedValue(confirmForm, "customerTimeZone", offer?.timeZone ?? "Asia/Riyadh");

  const refused = (code: string | undefined) => setError(code ?? "unavailable");
  const find = useActionMutation(availableOnBehalf, {
    refresh: false,
    onSuccess: (data) => {
      setSlots(data.slots);
      holdForm.resetField("start");
    },
    onFailure: (result) => {
      applyActionErrors(searchForm, result);
      refused(result.formError);
    },
    onError: () => setError("unavailable"),
  });
  const hold = useActionMutation(holdOnBehalf, {
    refresh: false,
    onSuccess: (data) => {
      setHeld(data);
      confirmForm.setValue("holdId", data.hold.holdId);
      confirmForm.setValue("consentVersion", data.form.consentVersion);
      confirmForm.setValue(
        "intakeFields",
        data.form.fields.map((field) => ({
          key: field.key,
          required: field.required,
          maxLength: field.maxLength,
        })),
      );
      confirmForm.setValue(
        "answers",
        Object.fromEntries(data.form.fields.map((field) => [field.key, ""])),
      );
    },
    onFailure: (result) => {
      applyActionErrors(holdForm, result);
      refused(result.formError);
    },
    onError: () => setError("unavailable"),
  });
  const confirm = useActionMutation(confirmOnBehalf, {
    refresh: false,
    onSuccess: (data) => {
      router.push(`/${locale}/bookings/${data.bookingId}`);
      router.refresh();
    },
    onFailure: (result) => {
      applyActionErrors(confirmForm, result);
      refused(result.formError);
    },
    onError: () => setError("unavailable"),
  });
  const busy = find.isPending || hold.isPending || confirm.isPending;
  const expired = held && now >= new Date(held.hold.expiresAt).getTime();

  function restart() {
    setHeld(null);
    setSlots(null);
    holdForm.resetField("start");
    confirmForm.resetField("consented");
    setError(null);
    setRequestId(crypto.randomUUID());
  }

  if (!offer) {
    return (
      <Alert tone="warning">
        <AlertDescription className="text-foreground">
          {message("denied")}
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="grid max-w-3xl gap-6">
      {error ? (
        <Alert
          id="on-behalf-error"
          tone="danger"
          tabIndex={-1}
          className="outline-none"
        >
          <AlertDescription className="text-foreground">
            {formErrorMessage(error, locale, messages)}
          </AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardContent>
          <Form form={confirmForm} locale={locale} messages={messages}>
            <FieldSet disabled={busy}>
              <FieldLegend>{message("customer")}</FieldLegend>
              <FieldGroup columns={2}>
                <FormField
                  control={confirmForm.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel required>{message("name")}</FormLabel>
                      <FormControl>
                        <Input {...field} maxLength={160} autoComplete="off" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={confirmForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>{message("email")}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="email"
                          dir="ltr"
                          maxLength={254}
                          autoComplete="off"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={confirmForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{message("phone")}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="tel"
                          dir="ltr"
                          maxLength={32}
                          autoComplete="off"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </FieldGroup>
            </FieldSet>
          </Form>
        </CardContent>
      </Card>
      {!held ? (
        <Card>
          <CardContent>
            <Form form={searchForm} locale={locale} messages={messages}>
              <form
                noValidate
                onSubmit={searchForm.handleSubmit((values) => {
                  setError(null);
                  find.mutate(values);
                })}
              >
                <FieldSet disabled={busy}>
                  <FieldLegend>{message("offer")}</FieldLegend>
                  <FieldGroup columns={2}>
                    <FormField
                      control={searchForm.control}
                      name="offer"
                      render={({ field }) => (
                        <FormItem className="md:col-span-2">
                          <FormLabel>{message("offer")}</FormLabel>
                          <Select
                            name={field.name}
                            value={field.value}
                            onValueChange={(value) => {
                              const next = offers.find((o) => offerKey(o) === value);
                              field.onChange(value);
                              if (next) searchForm.setValue("timeZone", next.timeZone);
                              searchForm.setValue("staffId", anyStaff);
                              restart();
                            }}
                          >
                            <FormControl>
                              <SelectTrigger onBlur={field.onBlur}>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {offers.map((o) => (
                                <SelectItem value={offerKey(o)} key={offerKey(o)}>
                                  {o.name} · {o.locationName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FieldDescription>
                            <bdi>{offer.timeZone}</bdi>
                          </FieldDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={searchForm.control}
                      name="date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>{message("date")}</FormLabel>
                          <FormControl>
                            <DatePicker
                              name={field.name}
                              locale={locale}
                              value={field.value}
                              min={civilDate(new Date(), offer.timeZone)}
                              onValueChange={(value) => {
                                field.onChange(value);
                                restart();
                              }}
                              placeholder={workspaceMessage(locale, "datePlaceholder")}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={searchForm.control}
                      name="staffId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{message("staff")}</FormLabel>
                          <Select
                            name={field.name}
                            value={field.value}
                            onValueChange={(value) => {
                              field.onChange(value);
                              restart();
                            }}
                          >
                            <FormControl>
                              <SelectTrigger onBlur={field.onBlur}>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value={anyStaff}>{message("any")}</SelectItem>
                              {choices.staff
                                .filter((s) => s.locationId === offer.locationId)
                                .map((s) => (
                                  <SelectItem key={s.id} value={s.id}>
                                    {s.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </FieldGroup>
                  {offer.approvalRequired ? (
                    <Alert tone="info">
                      <AlertDescription>{message("request")}</AlertDescription>
                    </Alert>
                  ) : null}
                  {offer.paymentMode !== "none" ? (
                    <Alert tone="warning">
                      <AlertDescription className="text-foreground">
                        {message("paid")}
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Button
                      type="submit"
                      className="w-fit"
                      disabled={!sessionToken}
                      loading={find.isPending}
                      loadingLabel={message("busy")}
                    >
                      {message("find")}
                    </Button>
                  )}
                </FieldSet>
              </form>
            </Form>
          </CardContent>
        </Card>
      ) : null}
      {slots && !held ? (
        <Card>
          <CardContent>
            <Form form={holdForm} locale={locale} messages={messages}>
              <form
                noValidate
                onSubmit={holdForm.handleSubmit((values) => {
                  setError(null);
                  hold.mutate(values);
                })}
              >
                <FieldSet disabled={busy}>
                  <FieldLegend id="on-behalf-times">{message("time")}</FieldLegend>
                  {slots.length ? (
                    <FormField
                      control={holdForm.control}
                      name="start"
                      render={({ field }) => (
                        <FormItem>
                          <RadioGroup
                            name="available-time"
                            aria-labelledby="on-behalf-times"
                            value={field.value}
                            onValueChange={field.onChange}
                            className="grid gap-2 sm:grid-cols-2"
                          >
                            {[
                              ...new Map(
                                slots.map((slot) => [slot.startAt, slot]),
                              ).values(),
                            ].map((slot, index) => (
                              <Label
                                key={`${slot.startAt}:${slot.staffId ?? "resource"}`}
                                htmlFor={`on-behalf-slot-${index}`}
                                className="min-h-11 rounded-md border bg-card px-3 py-2.5 font-medium has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary-soft"
                              >
                                <RadioGroupItem
                                  id={`on-behalf-slot-${index}`}
                                  value={slot.startAt}
                                />
                                <span className="[font-variant-numeric:tabular-nums]">
                                  {formatWhen(slot.startAt, locale, offer.timeZone)}
                                </span>
                              </Label>
                            ))}
                          </RadioGroup>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">{message("empty")}</p>
                  )}
                  <Button
                    type="submit"
                    className="w-fit"
                    disabled={!start || !sessionToken}
                    loading={hold.isPending}
                    loadingLabel={message("busy")}
                  >
                    {message("hold")}
                  </Button>
                </FieldSet>
              </form>
            </Form>
          </CardContent>
        </Card>
      ) : null}
      {held ? (
        <Card>
          <CardHeader>
            <CardTitle>{message("review")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Form form={confirmForm} locale={locale} messages={messages}>
              <form
                noValidate
                className="grid gap-5"
                onSubmit={confirmForm.handleSubmit((values) => {
                  if (expired) return;
                  setError(null);
                  confirm.mutate(values);
                })}
              >
                <FieldSet disabled={busy || !!expired}>
                  <FieldLegend className="sr-only">{message("review")}</FieldLegend>
                  <div className="grid gap-1 rounded-md bg-neutral-1 p-4 text-sm">
                    <p className="text-base font-semibold">
                      {held.form.serviceName} · {held.form.locationName}
                    </p>
                    <p className="[font-variant-numeric:tabular-nums]">
                      {formatWhen(held.hold.slotStart, locale, offer.timeZone)} ·{" "}
                      <bdi className="font-latin text-muted-foreground">
                        {offer.timeZone}
                      </bdi>{" "}
                      ·{" "}
                      <Money
                        className="font-semibold"
                        minor={held.hold.price.minorUnits}
                        currency={held.hold.price.currency}
                        locale={locale}
                      />
                    </p>
                    <p className="text-muted-foreground [font-variant-numeric:tabular-nums]">
                      {message("expires")}:{" "}
                      {formatWhen(held.hold.expiresAt, locale, offer.timeZone)}
                    </p>
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-line">
                    {held.form.consentText}
                  </p>
                  {held.form.fields.map((intake) => (
                    <FormField
                      key={intake.key}
                      control={confirmForm.control}
                      name={`answers.${intake.key}`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required={intake.required}>
                            {intake.label}
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value ?? ""}
                              maxLength={intake.maxLength}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
                  <FormField
                    control={confirmForm.control}
                    name="consented"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-start gap-3">
                          <FormControl>
                            <Checkbox
                              name={field.name}
                              checked={field.value === true}
                              onCheckedChange={(checked) =>
                                field.onChange(checked === true)
                              }
                              onBlur={field.onBlur}
                            />
                          </FormControl>
                          <FormLabel required>{message("consent")}</FormLabel>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="w-fit"
                    loading={confirm.isPending}
                    loadingLabel={message("busy")}
                    disabled={held.form.paymentMode !== "none"}
                  >
                    {message("confirm")}
                  </Button>
                </FieldSet>
                {expired ? (
                  <Alert tone="danger">
                    <AlertDescription className="text-foreground">
                      {message("expired")}
                    </AlertDescription>
                  </Alert>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  className="w-fit"
                  disabled={busy}
                  onClick={restart}
                >
                  {message("restart")}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
