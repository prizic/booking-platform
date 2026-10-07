"use server";

import {
  actionError,
  parseActionInput,
  type ActionResult,
} from "@wlbp/ui-foundation/actions";
import { refreshWorkspace } from "../../_lib/refresh-workspace";
import { redirect } from "next/navigation";

import { foldValue, textOrNull, zoneOrUtc } from "../../_lib/form-schema";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import {
  decisionOutcomeFor,
  decisionResultUrl,
  resolveProposedInstant,
  type DecisionOutcome,
} from "../../_lib/request-decisions";
import {
  requestDecisionSchema,
  type RequestDecisionInput,
} from "./request-decision-schema";

/**
 * A committed decision redirects to the queue with its outcome, as before. A
 * refusal returns its outcome code instead, so the operator keeps what they
 * typed (a stale revision is the common case) and reads why in the form.
 */
export async function decideRequestAction(
  input: RequestDecisionInput,
): Promise<ActionResult> {
  const parsed = parseActionInput(requestDecisionSchema, input);
  if (!parsed.ok) return parsed.result;
  const { action, bookingId, expectedRevision, locale } = parsed.data;

  const request = await loadDashboardRequestAccess(locale);
  if (
    request.source === null ||
    request.state.kind !== "ready" ||
    request.source.decideBookingRequest === undefined
  ) {
    return actionError("not-authorized");
  }

  const proposedStartAt =
    action === "propose"
      ? resolveProposedInstant(
          parsed.data.proposedStartAt,
          zoneOrUtc(parsed.data.locationTimeZone),
          foldValue(parsed.data.fold),
        )
      : null;
  if (action === "propose" && proposedStartAt === null) {
    return actionError("invalid-request");
  }

  // The redirect stays outside the try: it signals by throwing, and a decision
  // that already committed must never be reported as a failure.
  let outcome: DecisionOutcome;
  try {
    await request.source.decideBookingRequest({
      action,
      bookingId,
      expectedRevision,
      internalReason: textOrNull(parsed.data.internalReason),
      proposedStartAt,
      publicReason: textOrNull(parsed.data.publicReason),
      tenantId: request.state.context.tenantId,
    });
    outcome =
      action === "accept" ? "accepted" : action === "reject" ? "rejected" : "proposed";
  } catch (error) {
    outcome = decisionOutcomeFor(error);
  }
  if (outcome !== "accepted" && outcome !== "rejected" && outcome !== "proposed") {
    return actionError(outcome);
  }
  refreshWorkspace(locale);
  redirect(decisionResultUrl(locale, outcome));
}
