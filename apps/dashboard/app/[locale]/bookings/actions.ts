"use server";

import type { Locale } from "@wlbp/i18n";
import {
  actionError,
  parseActionInput,
  type ActionResult,
} from "@wlbp/ui-foundation/actions";
import { refreshWorkspace } from "../../_lib/refresh-workspace";
import { redirect } from "next/navigation";

import type { BookingTransitionAction } from "../../_lib/dashboard-access";
import { DashboardRpcError } from "../../_lib/dashboard-data-source";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { foldValue, textOrNull, zoneOrUtc } from "../../_lib/form-schema";
import {
  decisionOutcomeFor,
  resolveProposedInstant,
  type DecisionOutcome,
} from "../../_lib/request-decisions";
import {
  bookingChangeSchema,
  bookingNoteSchema,
  bookingTransitionSchema,
  type BookingChangeInput,
  type BookingNoteInput,
  type BookingTransitionInput,
} from "./booking-schema";

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

/*
 * Every action below redirects to its outcome when the change commits, as the
 * pages have always reported it. A refusal returns the outcome code instead,
 * so the form keeps what the operator typed and says why next to it.
 */

export async function transitionBookingAction(
  input: BookingTransitionInput,
): Promise<ActionResult> {
  const parsed = parseActionInput(bookingTransitionSchema, input);
  if (!parsed.ok) return parsed.result;
  const { bookingId, expectedRevision, locale } = parsed.data;
  const transition: BookingTransitionAction = parsed.data.action;

  const request = await loadDashboardRequestAccess(locale);
  if (
    request.source === null ||
    request.state.kind !== "ready" ||
    request.source.transitionBooking === undefined
  ) {
    return actionError("not-authorized");
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
      reason: textOrNull(parsed.data.reason),
      tenantId: request.state.context.tenantId,
    });
    outcome = outcomeForAction[transition];
  } catch (error) {
    outcome = detailOutcomeFor(error);
  }
  if (outcome !== outcomeForAction[transition]) return actionError(outcome);
  refreshWorkspace(locale);
  redirect(detailUrl(locale, bookingId, outcome));
}

export async function addBookingNoteAction(
  input: BookingNoteInput,
): Promise<ActionResult> {
  const parsed = parseActionInput(bookingNoteSchema, input);
  if (!parsed.ok) return parsed.result;
  const { body, bookingId, locale, visibility } = parsed.data;

  const request = await loadDashboardRequestAccess(locale);
  if (
    request.source === null ||
    request.state.kind !== "ready" ||
    request.source.addBookingNote === undefined
  ) {
    return actionError("not-authorized");
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
  if (outcome !== "note-added") return actionError(outcome);
  refreshWorkspace(locale);
  redirect(detailUrl(locale, bookingId, outcome));
}

export async function changeBookingAction(
  input: BookingChangeInput,
): Promise<ActionResult> {
  const parsed = parseActionInput(bookingChangeSchema, input);
  if (!parsed.ok) return parsed.result;
  const { action, bookingId, expectedRevision, locale } = parsed.data;

  const request = await loadDashboardRequestAccess(locale);
  if (
    request.source === null ||
    request.state.kind !== "ready" ||
    request.source.changeBooking === undefined
  ) {
    return actionError("not-authorized");
  }

  if (action === "resend") {
    // Resending is the same authorized replay of the message that already
    // exists, never a second logical message.
    let resendOutcome: BookingOutcome = "resent";
    try {
      if (request.source.resendBookingNotification === undefined) {
        throw new Error("invalid");
      }
      await request.source.resendBookingNotification({
        bookingId,
        tenantId: request.state.context.tenantId,
      });
    } catch {
      resendOutcome = "resend-unavailable";
    }
    if (resendOutcome !== "resent") return actionError(resendOutcome);
    refreshWorkspace(locale);
    redirect(resultUrl(locale, resendOutcome));
  }

  const newStartAt =
    action === "reschedule"
      ? resolveProposedInstant(
          parsed.data.newStartAt,
          zoneOrUtc(parsed.data.locationTimeZone),
          foldValue(parsed.data.fold),
        )
      : null;
  if (action === "reschedule" && newStartAt === null) {
    return actionError("invalid-request");
  }

  // The redirect stays outside the try: it signals by throwing, and a change
  // that already committed must never be reported as a failure.
  let outcome: BookingOutcome;
  try {
    await request.source.changeBooking({
      action,
      bookingId,
      expectedRevision,
      internalReason: textOrNull(parsed.data.internalReason),
      newStartAt,
      publicReason: textOrNull(parsed.data.publicReason),
      tenantId: request.state.context.tenantId,
    });
    outcome = action === "cancel" ? "rejected" : "moved";
  } catch (error) {
    outcome = decisionOutcomeFor(error);
  }
  if (outcome !== "rejected" && outcome !== "moved") return actionError(outcome);
  refreshWorkspace(locale);
  redirect(resultUrl(locale, outcome));
}
