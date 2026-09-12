"use server";

import type { Locale } from "@wlbp/i18n";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { BookingTransitionAction } from "../../_lib/dashboard-access";
import { DashboardRpcError } from "../../_lib/dashboard-data-source";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import {
  decisionOutcomeFor,
  resolveProposedInstant,
  type DecisionOutcome,
} from "../../_lib/request-decisions";

type BookingOutcome = DecisionOutcome | "moved" | "resend-unavailable" | "resent";

type DetailOutcome =
  | DecisionOutcome
  | "checked-in"
  | "completed"
  | "corrected"
  | "no-show"
  | "not-allowed"
  | "note-added"
  | "reason-required";

const outcomeForAction = {
  check_in: "checked-in",
  complete: "completed",
  correct: "corrected",
  no_show: "no-show",
} as const satisfies Record<BookingTransitionAction, DetailOutcome>;

function resultUrl(locale: Locale, outcome: BookingOutcome): string {
  return `/${locale}/bookings?result=${outcome}`;
}

function detailUrl(locale: Locale, bookingId: string, outcome: DetailOutcome): string {
  return `/${locale}/bookings/${bookingId}?result=${outcome}`;
}

/**
 * The two refusals this surface adds to the shared vocabulary. "You cannot do
 * that from here" and "your read was stale" are different facts, and an
 * operator who is told the wrong one retries the wrong thing.
 */
function detailOutcomeFor(error: unknown): DetailOutcome {
  const stable = error instanceof DashboardRpcError ? (error.stableMessage ?? "") : "";
  if (stable === "transition_not_allowed") return "not-allowed";
  if (stable === "booking_reason_required") return "reason-required";
  return decisionOutcomeFor(error);
}

function trimmed(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export async function transitionBookingAction(formData: FormData): Promise<never> {
  const locale: Locale = formData.get("locale") === "ar" ? "ar" : "en";
  const action = formData.get("action");
  const bookingId = formData.get("bookingId");
  const expectedRevision = Number(formData.get("expectedRevision"));
  if (
    typeof bookingId !== "string" ||
    !Object.hasOwn(outcomeForAction, action as string) ||
    !Number.isSafeInteger(expectedRevision)
  ) {
    redirect(resultUrl(locale, "invalid-request"));
  }
  const transition = action as BookingTransitionAction;

  const request = await loadDashboardRequestAccess(locale);
  if (
    request.source === null ||
    request.state.kind !== "ready" ||
    request.source.transitionBooking === undefined
  ) {
    redirect(detailUrl(locale, bookingId, "not-authorized"));
  }

  // The key is the booking, the action, and the revision it was asked from, so
  // a double submit of the same button is one transition while a genuine later
  // repeat of the same action is a new one.
  const idempotencyKey = `transition:${bookingId}:${transition}:${expectedRevision}`;
  let outcome: DetailOutcome;
  try {
    await request.source.transitionBooking({
      action: transition,
      bookingId,
      expectedRevision,
      idempotencyKey,
      reason: trimmed(formData, "reason"),
      tenantId: request.state.context.tenantId,
    });
    outcome = outcomeForAction[transition];
  } catch (error) {
    outcome = detailOutcomeFor(error);
  }
  if (outcome === outcomeForAction[transition]) {
    revalidatePath(`/${locale}/bookings/${bookingId}`);
    revalidatePath(`/${locale}/today`);
    revalidatePath(`/${locale}/calendar`);
  }
  redirect(detailUrl(locale, bookingId, outcome));
}

export async function addBookingNoteAction(formData: FormData): Promise<never> {
  const locale: Locale = formData.get("locale") === "ar" ? "ar" : "en";
  const bookingId = formData.get("bookingId");
  const visibility = formData.get("visibility");
  const body = trimmed(formData, "body");
  if (
    typeof bookingId !== "string" ||
    body === null ||
    (visibility !== "operational" && visibility !== "sensitive")
  ) {
    redirect(resultUrl(locale, "invalid-request"));
  }

  const request = await loadDashboardRequestAccess(locale);
  if (
    request.source === null ||
    request.state.kind !== "ready" ||
    request.source.addBookingNote === undefined
  ) {
    redirect(detailUrl(locale, bookingId, "not-authorized"));
  }

  let outcome: DetailOutcome;
  try {
    await request.source.addBookingNote({
      bookingId,
      body,
      tenantId: request.state.context.tenantId,
      visibility,
    });
    outcome = "note-added";
  } catch (error) {
    outcome = detailOutcomeFor(error);
  }
  if (outcome === "note-added") revalidatePath(`/${locale}/bookings/${bookingId}`);
  redirect(detailUrl(locale, bookingId, outcome));
}

export async function changeBookingAction(formData: FormData): Promise<never> {
  const locale: Locale = formData.get("locale") === "ar" ? "ar" : "en";
  const request = await loadDashboardRequestAccess(locale);
  if (
    request.source === null ||
    request.state.kind !== "ready" ||
    request.source.changeBooking === undefined
  ) {
    redirect(resultUrl(locale, "not-authorized"));
  }

  const action = formData.get("action");
  const bookingId = formData.get("bookingId");
  const expectedRevision = Number(formData.get("expectedRevision"));
  const timeZone = formData.get("locationTimeZone");
  if (action === "resend") {
    // Resending is the same authorized replay of the message that already
    // exists, never a second logical message.
    let resendOutcome: BookingOutcome = "resent";
    try {
      if (
        typeof bookingId !== "string" ||
        request.source.resendBookingNotification === undefined
      ) {
        throw new Error("invalid");
      }
      await request.source.resendBookingNotification({
        bookingId,
        tenantId: request.state.context.tenantId,
      });
    } catch {
      resendOutcome = "resend-unavailable";
    }
    if (resendOutcome === "resent") revalidatePath(`/${locale}/bookings`);
    redirect(resultUrl(locale, resendOutcome));
  }
  if (
    (action !== "cancel" && action !== "reschedule") ||
    typeof bookingId !== "string" ||
    !Number.isSafeInteger(expectedRevision)
  ) {
    redirect(resultUrl(locale, "invalid-request"));
  }

  const newStartAt =
    action === "reschedule"
      ? resolveProposedInstant(
          trimmed(formData, "newStartAt"),
          typeof timeZone === "string" && timeZone !== "" ? timeZone : "UTC",
        )
      : null;
  if (action === "reschedule" && newStartAt === null) {
    redirect(resultUrl(locale, "invalid-request"));
  }

  // The redirect stays outside the try: it signals by throwing, and a change
  // that already committed must never be reported as a failure.
  let outcome: BookingOutcome;
  try {
    await request.source.changeBooking({
      action,
      bookingId,
      expectedRevision,
      internalReason: trimmed(formData, "internalReason"),
      newStartAt,
      publicReason: trimmed(formData, "publicReason"),
      tenantId: request.state.context.tenantId,
    });
    outcome = action === "cancel" ? "rejected" : "moved";
  } catch (error) {
    outcome = decisionOutcomeFor(error);
  }
  if (outcome === "rejected" || outcome === "moved") {
    revalidatePath(`/${locale}/bookings`);
  }
  redirect(resultUrl(locale, outcome));
}
