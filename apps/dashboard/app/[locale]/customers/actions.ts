"use server";

import type { Locale } from "@wlbp/i18n";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { PrivacyRequestKind } from "../../_lib/dashboard-access";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { decisionOutcomeFor, type DecisionOutcome } from "../../_lib/request-decisions";

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

function trimmed(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function localeOf(formData: FormData): Locale {
  return formData.get("locale") === "ar" ? "ar" : "en";
}

/**
 * Correcting identity. The booking snapshots are untouched by design: a past
 * booking keeps the contact details it was actually made under, which is what
 * makes it evidence rather than a mutable opinion about who someone is.
 */
export async function correctCustomerAction(formData: FormData): Promise<never> {
  const locale = localeOf(formData);
  const customerId = formData.get("customerId");
  const fullName = trimmed(formData, "fullName");
  const email = trimmed(formData, "email");
  const expectedRevision = Number(formData.get("expectedRevision"));
  if (
    typeof customerId !== "string" ||
    fullName === null ||
    email === null ||
    !Number.isSafeInteger(expectedRevision)
  ) {
    redirect(`/${locale}/customers?result=invalid-request`);
  }

  const request = await loadDashboardRequestAccess(locale);
  if (
    request.source === null ||
    request.state.kind !== "ready" ||
    request.source.correctCustomer === undefined
  ) {
    redirect(detailUrl(locale, customerId, "not-authorized"));
  }

  let outcome: CustomerOutcome;
  try {
    await request.source.correctCustomer({
      customerId,
      email,
      expectedRevision,
      fullName,
      phone: trimmed(formData, "phone"),
      tenantId: request.state.context.tenantId,
    });
    outcome = "corrected";
  } catch (error) {
    outcome = decisionOutcomeFor(error);
  }
  if (outcome === "corrected") revalidatePath(`/${locale}/customers/${customerId}`);
  redirect(detailUrl(locale, customerId, outcome));
}

/** Restriction and legal hold: both reversible, both recorded, both audited. */
export async function setCustomerFlagAction(formData: FormData): Promise<never> {
  const locale = localeOf(formData);
  const customerId = formData.get("customerId");
  const action = formData.get("action");
  if (
    typeof customerId !== "string" ||
    (action !== "restrict" &&
      action !== "unrestrict" &&
      action !== "hold" &&
      action !== "release")
  ) {
    redirect(`/${locale}/customers?result=invalid-request`);
  }

  const request = await loadDashboardRequestAccess(locale);
  if (request.source === null || request.state.kind !== "ready") {
    redirect(detailUrl(locale, customerId, "not-authorized"));
  }
  const tenantId = request.state.context.tenantId;
  const reason = trimmed(formData, "reason");

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
  revalidatePath(`/${locale}/customers/${customerId}`);
  redirect(detailUrl(locale, customerId, outcome));
}

/**
 * Export and deletion. Opening and running are two database calls but one
 * operator intent, so the action does both: a job left open and unrun would
 * look to the operator like nothing happened.
 */
export async function runPrivacyRequestAction(formData: FormData): Promise<never> {
  const locale = localeOf(formData);
  const customerId = formData.get("customerId");
  const kind = formData.get("kind");
  if (typeof customerId !== "string" || (kind !== "export" && kind !== "deletion")) {
    redirect(`/${locale}/customers?result=invalid-request`);
  }

  const request = await loadDashboardRequestAccess(locale);
  if (
    request.source === null ||
    request.state.kind !== "ready" ||
    request.source.openPrivacyRequest === undefined ||
    request.source.runPrivacyRequest === undefined
  ) {
    redirect(detailUrl(locale, customerId, "not-authorized"));
  }
  const tenantId = request.state.context.tenantId;

  let outcome: CustomerOutcome;
  try {
    const requestId = await request.source.openPrivacyRequest({
      customerId,
      kind: kind as PrivacyRequestKind,
      tenantId,
    });
    await request.source.runPrivacyRequest({ requestId, tenantId });
    // A deletion the database refused is still a completed call. The job's own
    // status is what says whether anything was erased, so it is re-read rather
    // than inferred from the absence of an exception.
    const jobs =
      (await request.source.listPrivacyRequests?.({
        customerId,
        tenantId,
      })) ?? [];
    const job = jobs.find((candidate) => candidate.requestId === requestId);
    outcome =
      job?.status === "blocked"
        ? "deletion-blocked"
        : kind === "export"
          ? "exported"
          : "deleted";
  } catch (error) {
    outcome = decisionOutcomeFor(error);
  }
  revalidatePath(`/${locale}/customers/${customerId}`);
  redirect(detailUrl(locale, customerId, outcome));
}
