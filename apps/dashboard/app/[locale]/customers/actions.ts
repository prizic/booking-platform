"use server";

import type { Locale } from "@wlbp/i18n";
import {
  actionError,
  parseActionInput,
  type ActionResult,
} from "@wlbp/ui-foundation/actions";
import { refreshWorkspace } from "../../_lib/refresh-workspace";
import { redirect } from "next/navigation";

import type { PrivacyRequestKind } from "../../_lib/dashboard-access";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { textOrNull } from "../../_lib/form-schema";
import { decisionOutcomeFor, type DecisionOutcome } from "../../_lib/request-decisions";
import {
  customerCorrectionSchema,
  customerFlagSchema,
  privacyRequestSchema,
  splitTags,
  type CustomerCorrectionInput,
  type CustomerFlagInput,
  type PrivacyRequestInput,
} from "./customer-schema";

type CustomerOutcome =
  | DecisionOutcome
  | "corrected"
  | "deleted"
  | "deletion-blocked"
  | "exported"
  | "held"
  | "released"
  | "restricted"
  | "unrestricted";

function detailUrl(
  locale: Locale,
  customerId: string,
  outcome: CustomerOutcome,
): string {
  return `/${locale}/customers/${customerId}?result=${outcome}`;
}

/*
 * A call that completed redirects to its outcome on the customer, as the page
 * has always reported it. A refusal returns the outcome code instead, so the
 * form keeps what the operator typed and says why next to it.
 */

/**
 * Correcting identity. The booking snapshots are untouched by design: a past
 * booking keeps the contact details it was actually made under, which is what
 * makes it evidence rather than a mutable opinion about who someone is.
 */
export async function correctCustomerAction(
  input: CustomerCorrectionInput,
): Promise<ActionResult> {
  const parsed = parseActionInput(customerCorrectionSchema, input);
  if (!parsed.ok) return parsed.result;
  const { customerId, email, expectedRevision, fullName, locale } = parsed.data;

  const request = await loadDashboardRequestAccess(locale);
  if (
    request.source === null ||
    request.state.kind !== "ready" ||
    request.source.correctCustomer === undefined
  ) {
    return actionError("not-authorized");
  }

  let outcome: CustomerOutcome;
  try {
    await request.source.correctCustomer({
      customerId,
      email,
      expectedRevision,
      fullName,
      phone: textOrNull(parsed.data.phone),
      tags: splitTags(parsed.data.tags),
      tenantId: request.state.context.tenantId,
    });
    outcome = "corrected";
  } catch (error) {
    outcome = decisionOutcomeFor(error);
  }
  if (outcome !== "corrected") return actionError(outcome);
  refreshWorkspace(locale);
  redirect(detailUrl(locale, customerId, outcome));
}

/** Restriction and legal hold: both reversible, both recorded, both audited. */
export async function setCustomerFlagAction(
  input: CustomerFlagInput,
): Promise<ActionResult> {
  const parsed = parseActionInput(customerFlagSchema, input);
  if (!parsed.ok) return parsed.result;
  const { action, customerId, locale } = parsed.data;

  const request = await loadDashboardRequestAccess(locale);
  if (request.source === null || request.state.kind !== "ready") {
    return actionError("not-authorized");
  }
  const tenantId = request.state.context.tenantId;
  const reason = textOrNull(parsed.data.reason);

  let outcome: CustomerOutcome;
  try {
    if (action === "restrict" || action === "unrestrict") {
      if (request.source.setCustomerRestriction === undefined) throw new Error("no");
      await request.source.setCustomerRestriction({
        customerId,
        reason,
        restricted: action === "restrict",
        tenantId,
      });
      outcome = action === "restrict" ? "restricted" : "unrestricted";
    } else {
      if (request.source.setLegalHold === undefined) throw new Error("no");
      // A hold always states why. An unexplained hold is one nobody can
      // later justify releasing.
      await request.source.setLegalHold({
        customerId,
        hold: action === "hold",
        reason: reason ?? "",
        tenantId,
      });
      outcome = action === "hold" ? "held" : "released";
    }
  } catch (error) {
    outcome = decisionOutcomeFor(error);
  }
  refreshWorkspace(locale);
  if (
    outcome !== "restricted" &&
    outcome !== "unrestricted" &&
    outcome !== "held" &&
    outcome !== "released"
  )
    return actionError(outcome);
  redirect(detailUrl(locale, customerId, outcome));
}

/**
 * Export and deletion. Opening and running are two database calls but one
 * operator intent, so the action does both: a job left open and unrun would
 * look to the operator like nothing happened.
 */
export async function runPrivacyRequestAction(
  input: PrivacyRequestInput,
): Promise<ActionResult> {
  const parsed = parseActionInput(privacyRequestSchema, input);
  if (!parsed.ok) return parsed.result;
  const { customerId, kind, locale } = parsed.data;

  const request = await loadDashboardRequestAccess(locale);
  if (
    request.source === null ||
    request.state.kind !== "ready" ||
    request.source.openPrivacyRequest === undefined ||
    request.source.runPrivacyRequest === undefined
  ) {
    return actionError("not-authorized");
  }
  const tenantId = request.state.context.tenantId;

  let outcome: CustomerOutcome;
  try {
    const requestId = await request.source.openPrivacyRequest({
      customerId,
      kind: kind satisfies PrivacyRequestKind,
      tenantId,
    });
    await request.source.runPrivacyRequest({ requestId, tenantId });
    // A deletion the database refused is still a completed call. The job's own
    // status is what says whether anything was erased, so it is re-read rather
    // than inferred from the absence of an exception.
    const job = await request.source.getPrivacyRequest?.({ requestId, tenantId });
    outcome =
      job?.status === "blocked"
        ? "deletion-blocked"
        : kind === "export"
          ? "exported"
          : "deleted";
  } catch (error) {
    outcome = decisionOutcomeFor(error);
  }
  refreshWorkspace(locale);
  // A blocked deletion is a recorded job, reported on the page like any other.
  if (outcome !== "exported" && outcome !== "deleted" && outcome !== "deletion-blocked")
    return actionError(outcome);
  redirect(detailUrl(locale, customerId, outcome));
}
