"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDateTime, type Locale } from "@wlbp/i18n";
import type { AvailabilitySlotV1 } from "@wlbp/api-contracts";
import type { OperationalChoices } from "../../../_lib/operational-choices";
import { calendarRange, civilDate } from "../../calendar/calendar-range";
import { availableOnBehalf, holdOnBehalf, confirmOnBehalf } from "./actions";
import { bookingMessage, type BookingMessage } from "./booking-copy";
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
  if (!offer) return <p>{message("denied")}</p>;
  return (
    <div className="catalog-form">
      <fieldset disabled={busy}>
        <legend>{message("customer")}</legend>
        <label htmlFor="on-behalf-name">
          {message("name")}
          <input
            id="on-behalf-name"
            value={fullName}
            onChange={(e) => setName(e.target.value)}
            maxLength={160}
            autoComplete="off"
            required
          />
        </label>
        <label htmlFor="on-behalf-email">
          {message("email")}
          <input
            id="on-behalf-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={254}
            autoComplete="off"
            required
          />
        </label>
        <label htmlFor="on-behalf-phone">
          {message("phone")}
          <input
            id="on-behalf-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={32}
            autoComplete="off"
          />
        </label>
      </fieldset>
      {!held ? (
        <form onSubmit={find}>
          <fieldset disabled={busy}>
            <legend>{message("offer")}</legend>
            <label htmlFor="on-behalf-offer">
              {message("offer")}
              <select
                id="on-behalf-offer"
                value={offerIndex}
                onChange={(e) => {
                  setOfferIndex(Number(e.target.value));
                  setStaffId("");
                  restart();
                }}
              >
                {offers.map((o, index) => (
                  <option value={index} key={`${o.id}:${o.locationId}`}>
                    {o.name} · {o.locationName}
                  </option>
                ))}
              </select>
            </label>
            <p>
              <bdi>{offer.timeZone}</bdi>
            </p>
            <label htmlFor="on-behalf-date">
              {message("date")}
              <input
                id="on-behalf-date"
                type="date"
                required
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  restart();
                }}
              />
            </label>
            <label htmlFor="on-behalf-staff">
              {message("staff")}
              <select
                id="on-behalf-staff"
                value={staffId}
                onChange={(e) => {
                  setStaffId(e.target.value);
                  restart();
                }}
              >
                <option value="">{message("any")}</option>
                {choices.staff
                  .filter((s) => s.locationId === offer.locationId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </label>
            {offer.approvalRequired ? <p>{message("request")}</p> : null}
            {offer.paymentMode !== "none" ? (
              <p>{message("paid")}</p>
            ) : (
              <button type="submit" disabled={!sessionToken}>
                {message(busy ? "busy" : "find")}
              </button>
            )}
          </fieldset>
        </form>
      ) : null}
      {slots && !held ? (
        <fieldset disabled={busy}>
          <legend>{message("time")}</legend>
          {slots.length ? (
            [...new Map(slots.map((slot) => [slot.startAt, slot])).values()].map(
              (slot) => (
                <label key={`${slot.startAt}:${slot.staffId ?? "resource"}`}>
                  <input
                    type="radio"
                    name="available-time"
                    value={slot.startAt}
                    checked={start === slot.startAt}
                    onChange={() => setStart(slot.startAt)}
                  />
                  {formatDateTime(slot.startAt, locale, offer.timeZone)}
                </label>
              ),
            )
          ) : (
            <p>{message("empty")}</p>
          )}
          <button
            type="button"
            disabled={!start || !sessionToken}
            onClick={() => void hold()}
          >
            {message(busy ? "busy" : "hold")}
          </button>
        </fieldset>
      ) : null}
      {held ? (
        <form onSubmit={confirm}>
          <fieldset disabled={busy || !!expired}>
            <legend>{message("review")}</legend>
            <p>
              {held.form.serviceName} · {held.form.locationName}
            </p>
            <p>
              {formatDateTime(held.hold.slotStart, locale, offer.timeZone)} ·{" "}
              {formatCurrency(
                held.hold.price.minorUnits,
                held.hold.price.currency,
                locale,
              )}
            </p>
            <p>
              {message("expires")}:{" "}
              {formatDateTime(held.hold.expiresAt, locale, offer.timeZone)}
            </p>
            <p>{held.form.consentText}</p>
            {held.form.fields.map((field) => (
              <label key={field.key} htmlFor={`intake-${field.key}`}>
                {field.label}
                <input
                  id={`intake-${field.key}`}
                  value={answers[field.key] ?? ""}
                  onChange={(e) =>
                    setAnswers({ ...answers, [field.key]: e.target.value })
                  }
                  required={field.required}
                  maxLength={field.maxLength}
                />
              </label>
            ))}
            <input name="fullName" type="hidden" value={fullName} />
            <input name="email" type="hidden" value={email} />
            <label>
              <input type="checkbox" name="consented" required />
              {message("consent")}
            </label>
            <button
              type="submit"
              disabled={
                !fullName.trim() ||
                !/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(email) ||
                held.form.paymentMode !== "none"
              }
            >
              {message(busy ? "busy" : "confirm")}
            </button>
          </fieldset>
          {expired ? <p role="alert">{message("expired")}</p> : null}
          <button type="button" disabled={busy} onClick={restart}>
            {message("restart")}
          </button>
        </form>
      ) : null}
      {error ? (
        <p id="on-behalf-error" role="alert" tabIndex={-1}>
          {message(error)}
        </p>
      ) : null}
    </div>
  );
}
