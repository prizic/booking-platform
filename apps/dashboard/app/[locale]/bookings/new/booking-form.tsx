"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@wlbp/i18n";
import type { AvailabilitySlotV1 } from "@wlbp/api-contracts";
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  DatePicker,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSet,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  RequiredMark,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wlbp/ui-foundation";
import type { OperationalChoices } from "../../../_lib/operational-choices";
import { calendarRange, civilDate } from "../../calendar/calendar-range";
import { availableOnBehalf, holdOnBehalf, confirmOnBehalf } from "./actions";
import { bookingMessage, type BookingMessage } from "./booking-copy";
import { formatWhen } from "../../../_lib/booking-display";
import { workspaceMessage } from "../../../_lib/workspace-copy";
import { Money } from "../../../_lib/ui/money";

/** Radix Select cannot hold an empty value, so "any eligible staff" is this sentinel. */
const anyStaff = "any";
type Held = NonNullable<
  Awaited<ReturnType<typeof holdOnBehalf>> extends infer R
    ? R extends { held: infer H }
      ? H
      : never
    : never
>;
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
  const [offerIndex, setOfferIndex] = useState(0);
  const offer = offers[offerIndex];
  const [date, setDate] = useState(
    civilDate(new Date(), offer?.timeZone ?? "Asia/Riyadh"),
  );
  const [staffId, setStaffId] = useState("");
  const [fullName, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [slots, setSlots] = useState<readonly AvailabilitySlotV1[] | null>(null);
  const [start, setStart] = useState("");
  const [held, setHeld] = useState<Held | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<BookingMessage | null>(null);
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
  const expired = held && now >= new Date(held.hold.expiresAt).getTime();
  const failure = (code: string) =>
    setError(
      code in
        {
          slot_unavailable: 1,
          capacity_exhausted: 1,
          policy_denied: 1,
          revision_conflict: 1,
          payment_pending: 1,
          idempotency_conflict: 1,
          denied: 1,
        }
        ? (code as BookingMessage)
        : "unavailable",
    );
  function restart() {
    setHeld(null);
    setSlots(null);
    setStart("");
    setError(null);
    setRequestId(crypto.randomUUID());
  }
  async function find(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!offer) return;
    setBusy(true);
    setError(null);
    try {
      const range = calendarRange(date, offer.timeZone);
      const result = await availableOnBehalf({
        startAfter: range.from,
        endBefore: range.to,
        locale,
        locationId: offer.locationId,
        serviceId: offer.id,
        staffPreferenceId: staffId || null,
        partySize: 1,
        timeZone: offer.timeZone,
      });
      if ("error" in result) failure(result.error);
      else {
        setSlots(result.availability.slots);
        setStart("");
      }
    } catch {
      setError("unavailable");
    } finally {
      setBusy(false);
    }
  }
  async function hold() {
    if (!offer || !start) return;
    setBusy(true);
    setError(null);
    try {
      const result = await holdOnBehalf({
        startAt: start,
        locale,
        locationId: offer.locationId,
        serviceId: offer.id,
        staffPreferenceId: staffId || null,
        partySize: 1,
        expectedCacheTag: null,
        sessionToken,
        idempotencyKey: `hold:${requestId}`,
      });
      if ("error" in result) failure(result.error);
      else {
        setHeld(result.held);
        setAnswers({});
      }
    } catch {
      setError("unavailable");
    } finally {
      setBusy(false);
    }
  }
  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!held || !offer || expired) return;
    setBusy(true);
    setError(null);
    try {
      const result = await confirmOnBehalf({
        holdId: held.hold.holdId,
        sessionToken,
        idempotencyKey: `booking:${requestId}`,
        contact: { fullName, email, phone: phone || null },
        consentVersion: held.form.consentVersion,
        locale,
        intake: answers,
        customerTimeZone: offer.timeZone,
      });
      if ("error" in result) failure(result.error);
      else {
        router.push(`/${locale}/bookings/${result.booking.bookingId}`);
        router.refresh();
      }
    } catch {
      setError("unavailable");
    } finally {
      setBusy(false);
    }
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
            {message(error)}
          </AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardContent>
          <FieldSet disabled={busy}>
            <FieldLegend>{message("customer")}</FieldLegend>
            <FieldGroup columns={2}>
              <Field className="md:col-span-2">
                <Label htmlFor="on-behalf-name">
                  {message("name")}
                  <RequiredMark />
                </Label>
                <Input
                  id="on-behalf-name"
                  value={fullName}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={160}
                  autoComplete="off"
                  required
                />
              </Field>
              <Field>
                <Label htmlFor="on-behalf-email">
                  {message("email")}
                  <RequiredMark />
                </Label>
                <Input
                  id="on-behalf-email"
                  type="email"
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={254}
                  autoComplete="off"
                  required
                />
              </Field>
              <Field>
                <Label htmlFor="on-behalf-phone">{message("phone")}</Label>
                <Input
                  id="on-behalf-phone"
                  type="tel"
                  dir="ltr"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  maxLength={32}
                  autoComplete="off"
                />
              </Field>
            </FieldGroup>
          </FieldSet>
        </CardContent>
      </Card>
      {!held ? (
        <Card>
          <CardContent>
            <form onSubmit={find}>
              <FieldSet disabled={busy}>
                <FieldLegend>{message("offer")}</FieldLegend>
                <FieldGroup columns={2}>
                  <Field className="md:col-span-2">
                    <Label htmlFor="on-behalf-offer">{message("offer")}</Label>
                    <Select
                      value={String(offerIndex)}
                      onValueChange={(value) => {
                        setOfferIndex(Number(value));
                        setStaffId("");
                        restart();
                      }}
                    >
                      <SelectTrigger
                        id="on-behalf-offer"
                        aria-describedby="on-behalf-zone"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {offers.map((o, index) => (
                          <SelectItem
                            value={String(index)}
                            key={`${o.id}:${o.locationId}`}
                          >
                            {o.name} · {o.locationName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldDescription id="on-behalf-zone">
                      <bdi>{offer.timeZone}</bdi>
                    </FieldDescription>
                  </Field>
                  <Field>
                    <Label htmlFor="on-behalf-date">
                      {message("date")}
                      <RequiredMark />
                    </Label>
                    <DatePicker
                      id="on-behalf-date"
                      locale={locale}
                      required
                      value={date}
                      min={civilDate(new Date(), offer.timeZone)}
                      onValueChange={(value) => {
                        setDate(value);
                        restart();
                      }}
                      placeholder={workspaceMessage(locale, "datePlaceholder")}
                    />
                  </Field>
                  <Field>
                    <Label htmlFor="on-behalf-staff">{message("staff")}</Label>
                    <Select
                      value={staffId || anyStaff}
                      onValueChange={(value) => {
                        setStaffId(value === anyStaff ? "" : value);
                        restart();
                      }}
                    >
                      <SelectTrigger id="on-behalf-staff">
                        <SelectValue />
                      </SelectTrigger>
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
                  </Field>
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
                    loading={busy}
                    loadingLabel={message("busy")}
                  >
                    {message("find")}
                  </Button>
                )}
              </FieldSet>
            </form>
          </CardContent>
        </Card>
      ) : null}
      {slots && !held ? (
        <Card>
          <CardContent>
            <FieldSet disabled={busy}>
              <FieldLegend id="on-behalf-times">{message("time")}</FieldLegend>
              {slots.length ? (
                <RadioGroup
                  name="available-time"
                  aria-labelledby="on-behalf-times"
                  value={start}
                  onValueChange={setStart}
                  className="grid gap-2 sm:grid-cols-2"
                >
                  {[...new Map(slots.map((slot) => [slot.startAt, slot])).values()].map(
                    (slot, index) => (
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
                    ),
                  )}
                </RadioGroup>
              ) : (
                <p className="text-sm text-muted-foreground">{message("empty")}</p>
              )}
              <Button
                className="w-fit"
                disabled={!start || !sessionToken}
                loading={busy}
                loadingLabel={message("busy")}
                onClick={() => void hold()}
              >
                {message("hold")}
              </Button>
            </FieldSet>
          </CardContent>
        </Card>
      ) : null}
      {held ? (
        <Card>
          <CardHeader>
            <CardTitle>{message("review")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={confirm} className="grid gap-5">
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
                {held.form.fields.map((field) => (
                  <Field key={field.key}>
                    <Label htmlFor={`intake-${field.key}`}>
                      {field.label}
                      {field.required ? <RequiredMark /> : null}
                    </Label>
                    <Input
                      id={`intake-${field.key}`}
                      value={answers[field.key] ?? ""}
                      onChange={(e) =>
                        setAnswers({ ...answers, [field.key]: e.target.value })
                      }
                      required={field.required}
                      maxLength={field.maxLength}
                    />
                  </Field>
                ))}
                <input name="fullName" type="hidden" value={fullName} />
                <input name="email" type="hidden" value={email} />
                <Field orientation="horizontal">
                  <Checkbox id="on-behalf-consent" name="consented" required />
                  <Label htmlFor="on-behalf-consent">{message("consent")}</Label>
                </Field>
                <Button
                  type="submit"
                  className="w-fit"
                  loading={busy}
                  loadingLabel={message("busy")}
                  disabled={
                    !fullName.trim() ||
                    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(email) ||
                    held.form.paymentMode !== "none"
                  }
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
                variant="ghost"
                className="w-fit"
                disabled={busy}
                onClick={restart}
              >
                {message("restart")}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
