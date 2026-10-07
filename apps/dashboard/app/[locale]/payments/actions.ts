"use server";

import type { Locale } from "@wlbp/i18n";
import {
  actionError,
  parseActionInput,
  type ActionResult,
} from "@wlbp/ui-foundation/actions";
import { refreshWorkspace } from "../../_lib/refresh-workspace";
import { redirect } from "next/navigation";

import type { PaymentExceptionResolution } from "../../_lib/dashboard-access";
import { DashboardRpcError } from "../../_lib/dashboard-data-source";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { textOrNull } from "../../_lib/form-schema";
import { decisionOutcomeFor, type DecisionOutcome } from "../../_lib/request-decisions";
import {
  refundRetrySchema,
  resolveExceptionSchema,
  type RefundRetryInput,
  type ResolveExceptionInput,
} from "./payment-schema";

type PaymentOutcome =
  DecisionOutcome | "already-resolved" | "not-eligible" | "refunded" | "resolved";

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

/*
 * A committed decision redirects to the queue with its outcome, as before. A
 * refusal returns its outcome code, shown next to the form that caused it.
 */

export async function resolveExceptionAction(
  input: ResolveExceptionInput,
): Promise<ActionResult> {
  const parsed = parseActionInput(resolveExceptionSchema, input);
  if (!parsed.ok) return parsed.result;
  const { exceptionId, locale } = parsed.data;
  const resolution: PaymentExceptionResolution = parsed.data.resolution;

  const request = await loadDashboardRequestAccess(locale);
  if (
    request.source === null ||
    request.state.kind !== "ready" ||
    request.source.resolvePaymentException === undefined
  ) {
    return actionError("not-authorized");
  }

  let outcome: PaymentOutcome;
  try {
    await request.source.resolvePaymentException({
      exceptionId,
      note: textOrNull(parsed.data.note),
      resolution,
      tenantId: request.state.context.tenantId,
    });
    outcome = "resolved";
  } catch (error) {
    outcome = paymentOutcomeFor(error);
  }
  if (outcome !== "resolved") return actionError(outcome);
  refreshWorkspace(locale);
  redirect(resultUrl(locale, outcome));
}

/**
 * Retrying a refund the provider refused. The amount is not re-proposed here:
 * the database reads what the cancellation already earned.
 */
export async function requestRefundAction(
  input: RefundRetryInput,
): Promise<ActionResult> {
  const parsed = parseActionInput(refundRetrySchema, input);
  if (!parsed.ok) return parsed.result;
  const { bookingId, locale } = parsed.data;

  const request = await loadDashboardRequestAccess(locale);
  if (
    request.source === null ||
    request.state.kind !== "ready" ||
    request.source.requestRefund === undefined
  ) {
    return actionError("not-authorized");
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
  if (outcome !== "refunded") return actionError(outcome);
  refreshWorkspace(locale);
  redirect(resultUrl(locale, outcome));
}
