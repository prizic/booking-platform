"use server";

import type { Locale } from "@wlbp/i18n";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import {
  decisionOutcomeFor,
  decisionResultUrl,
  resolveProposedInstant,
  type DecisionOutcome,
} from "../../_lib/request-decisions";

export async function decideRequestAction(formData: FormData): Promise<never> {
  const locale: Locale = formData.get("locale") === "ar" ? "ar" : "en";
  const request = await loadDashboardRequestAccess(locale);
  if (
    request.source === null ||
    request.state.kind !== "ready" ||
    request.source.decideBookingRequest === undefined
  ) {
    redirect(decisionResultUrl(locale, "not-authorized"));
  }

  const action = formData.get("action");
  const bookingId = formData.get("bookingId");
  const expectedRevision = Number(formData.get("expectedRevision"));
  if (
    (action !== "accept" && action !== "propose" && action !== "reject") ||
    typeof bookingId !== "string" ||
    !Number.isSafeInteger(expectedRevision)
  ) {
    redirect(decisionResultUrl(locale, "invalid-request"));
  }

  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
  };
  const timeZone = formData.get("locationTimeZone");
  const proposedStartAt =
    action === "propose"
      ? resolveProposedInstant(
          text("proposedStartAt"),
          typeof timeZone === "string" && timeZone !== "" ? timeZone : "UTC",
        )
      : null;
  if (action === "propose" && proposedStartAt === null) {
    redirect(decisionResultUrl(locale, "invalid-request"));
  }

  // The redirect stays outside the try: it signals by throwing, and a decision
  // that already committed must never be reported as a failure.
  let outcome: DecisionOutcome;
  let token: string | undefined;
  try {
    const decision = await request.source.decideBookingRequest({
      action,
      bookingId,
      expectedRevision,
      internalReason: text("internalReason"),
      proposedStartAt,
      publicReason: text("publicReason"),
      tenantId: request.state.context.tenantId,
    });
    outcome =
      action === "accept" ? "accepted" : action === "reject" ? "rejected" : "proposed";
    token = decision.proposalActionToken ?? undefined;
  } catch (error) {
    outcome = decisionOutcomeFor(error);
  }
  if (outcome === "accepted" || outcome === "rejected" || outcome === "proposed") {
    revalidatePath(`/${locale}/requests`);
  }
  redirect(decisionResultUrl(locale, outcome, token));
}
