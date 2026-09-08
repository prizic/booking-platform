"use server";

import type { Locale } from "@wlbp/i18n";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import {
  decisionOutcomeFor,
  resolveProposedInstant,
  type DecisionOutcome,
} from "../../_lib/request-decisions";

type BookingOutcome = DecisionOutcome | "moved" | "resend-unavailable" | "resent";

function resultUrl(locale: Locale, outcome: BookingOutcome): string {
  return `/${locale}/bookings?result=${outcome}`;
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

  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
  };
  const newStartAt =
    action === "reschedule"
      ? resolveProposedInstant(
          text("newStartAt"),
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
      internalReason: text("internalReason"),
      newStartAt,
      publicReason: text("publicReason"),
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
