"use server";

import type { Locale } from "@wlbp/i18n";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { PaymentExceptionResolution } from "../../_lib/dashboard-access";
import { DashboardRpcError } from "../../_lib/dashboard-data-source";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { decisionOutcomeFor, type DecisionOutcome } from "../../_lib/request-decisions";

type PaymentOutcome =
  DecisionOutcome | "already-resolved" | "not-eligible" | "refunded" | "resolved";

const resolutions: readonly PaymentExceptionResolution[] = [
  "contested",
  "no_action_needed",
  "reconciled",
  "refunded",
  "written_off",
];

function resultUrl(locale: Locale, outcome: PaymentOutcome): string {
  return `/${locale}/payments?result=${outcome}`;
}

/**
 * The two refusals this surface adds. "Somebody already closed this" and "your
 * read was stale" are different facts, and an operator told the wrong one goes
 * looking in the wrong place.
 */
function paymentOutcomeFor(error: unknown): PaymentOutcome {
  const stable = error instanceof DashboardRpcError ? (error.stableMessage ?? "") : "";
  if (stable === "exception_resolved") return "already-resolved";
  if (stable === "refund_not_eligible") return "not-eligible";
  return decisionOutcomeFor(error);
}

function trimmed(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export async function resolveExceptionAction(formData: FormData): Promise<never> {
  const locale: Locale = formData.get("locale") === "ar" ? "ar" : "en";
  const exceptionId = formData.get("exceptionId");
  const resolution = formData.get("resolution");
  if (
    typeof exceptionId !== "string" ||
    !resolutions.includes(resolution as PaymentExceptionResolution)
  ) {
    redirect(resultUrl(locale, "invalid-request"));
  }

  const request = await loadDashboardRequestAccess(locale);
  if (
    request.source === null ||
    request.state.kind !== "ready" ||
    request.source.resolvePaymentException === undefined
  ) {
    redirect(resultUrl(locale, "not-authorized"));
  }

  let outcome: PaymentOutcome;
  try {
    await request.source.resolvePaymentException({
      exceptionId,
      note: trimmed(formData, "note"),
      resolution: resolution as PaymentExceptionResolution,
      tenantId: request.state.context.tenantId,
    });
    outcome = "resolved";
  } catch (error) {
    outcome = paymentOutcomeFor(error);
  }
  if (outcome === "resolved") revalidatePath(`/${locale}/payments`);
  redirect(resultUrl(locale, outcome));
}

/**
 * Retrying a refund the provider refused. The amount is not re-proposed here:
 * the database reads what the cancellation already earned.
 */
export async function requestRefundAction(formData: FormData): Promise<never> {
  const locale: Locale = formData.get("locale") === "ar" ? "ar" : "en";
  const bookingId = formData.get("bookingId");
  if (typeof bookingId !== "string") {
    redirect(resultUrl(locale, "invalid-request"));
  }

  const request = await loadDashboardRequestAccess(locale);
  if (
    request.source === null ||
    request.state.kind !== "ready" ||
    request.source.requestRefund === undefined
  ) {
    redirect(resultUrl(locale, "not-authorized"));
  }

  let outcome: PaymentOutcome;
  try {
    await request.source.requestRefund({
      bookingId,
      // Derived from the booking, so a double-clicked retry is one refund and
      // a genuine later refund is a different one.
      idempotencyKey: `refund:${bookingId}:queue-retry`,
      reason: "requested_by_customer",
      tenantId: request.state.context.tenantId,
    });
    outcome = "refunded";
  } catch (error) {
    outcome = paymentOutcomeFor(error);
  }
  if (outcome === "refunded") revalidatePath(`/${locale}/payments`);
  redirect(resultUrl(locale, outcome));
}
