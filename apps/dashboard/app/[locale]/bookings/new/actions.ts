"use server";
import type { AvailabilitySlotV1 } from "@wlbp/api-contracts";
import {
  actionError,
  actionOk,
  parseActionInput,
  type ActionResult,
} from "@wlbp/ui-foundation/actions";
import { loadDashboardRequestAccess } from "../../../_lib/dashboard-server";
import { createDashboardAuthClient } from "../../../_lib/auth-server";
import { calendarRange } from "../../calendar/calendar-range";
import { createOnBehalfDataSource } from "./on-behalf-data-source";
import {
  anyStaff,
  onBehalfConfirmSchema,
  onBehalfHoldSchema,
  onBehalfSearchSchema,
  splitOfferKey,
  type OnBehalfConfirmInput,
  type OnBehalfHoldInput,
  type OnBehalfSearchInput,
} from "./on-behalf-schema";
import { revalidatePath } from "next/cache";

async function context(locale: "en" | "ar") {
  const request = await loadDashboardRequestAccess(locale);
  const client = await createDashboardAuthClient();
  if (request.state.kind !== "ready" || !request.source || !client)
    throw new Error("denied");
  return {
    request,
    source: createOnBehalfDataSource(
      client.schema("api_v1") as unknown as Parameters<
        typeof createOnBehalfDataSource
      >[0],
      request.state.context.dashboardHostname,
      request.state.context.tenantId,
    ),
  };
}

/** Only these refusals are named to the operator; anything else is "unavailable". */
function errorResult(error: unknown): ActionResult<never> {
  const allowed = [
    "slot_unavailable",
    "capacity_exhausted",
    "policy_denied",
    "revision_conflict",
    "payment_pending",
    "idempotency_conflict",
    "denied",
  ];
  return actionError(
    error instanceof Error && allowed.includes(error.message)
      ? error.message
      : "unavailable",
  );
}

export async function availableOnBehalf(
  input: OnBehalfSearchInput,
): Promise<ActionResult<{ readonly slots: readonly AvailabilitySlotV1[] }>> {
  const parsed = parseActionInput(onBehalfSearchSchema, input);
  if (!parsed.ok) return parsed.result;
  const { date, locale, staffId, timeZone } = parsed.data;
  const { locationId, serviceId } = splitOfferKey(parsed.data.offer);
  try {
    const { request: ctx } = await context(locale);
    if (!ctx.source?.getAvailability || ctx.state.kind !== "ready")
      return actionError("unavailable");
    const range = calendarRange(date, timeZone);
    const availability = await ctx.source.getAvailability(
      ctx.state.context.dashboardHostname,
      {
        startAfter: range.from,
        endBefore: range.to,
        locale,
        locationId,
        serviceId,
        staffPreferenceId: staffId === anyStaff ? null : staffId,
        partySize: 1,
        timeZone,
      },
    );
    return actionOk({ slots: availability.slots });
  } catch (error) {
    return errorResult(error);
  }
}

export async function holdOnBehalf(input: OnBehalfHoldInput) {
  const parsed = parseActionInput(onBehalfHoldSchema, input);
  if (!parsed.ok) return parsed.result;
  const { locale, requestId, sessionToken, staffId, start } = parsed.data;
  const { locationId, serviceId } = splitOfferKey(parsed.data.offer);
  try {
    const held = await (
      await context(locale)
    ).source.hold({
      startAt: start,
      locale,
      locationId,
      serviceId,
      staffPreferenceId: staffId === anyStaff ? null : staffId,
      partySize: 1,
      expectedCacheTag: null,
      sessionToken,
      idempotencyKey: `hold:${requestId}`,
    });
    return actionOk(held);
  } catch (error) {
    return errorResult(error);
  }
}

export async function confirmOnBehalf(
  input: OnBehalfConfirmInput,
): Promise<ActionResult<{ readonly bookingId: string }>> {
  const parsed = parseActionInput(onBehalfConfirmSchema, input);
  if (!parsed.ok) return parsed.result;
  const value = parsed.data;
  try {
    const result = await (
      await context(value.locale)
    ).source.confirm({
      holdId: value.holdId,
      sessionToken: value.sessionToken,
      idempotencyKey: `booking:${value.requestId}`,
      contact: {
        fullName: value.fullName,
        email: value.email,
        phone: value.phone === "" ? null : value.phone,
      },
      consentVersion: value.consentVersion,
      locale: value.locale,
      // Declared keys only, and an unanswered optional field is no answer.
      intake: Object.fromEntries(
        value.intakeFields
          .map((field) => [field.key, value.answers[field.key] ?? ""] as const)
          .filter(([, answer]) => answer !== ""),
      ),
      customerTimeZone: value.customerTimeZone,
    });
    for (const path of ["today", "calendar", "bookings", "customers", "requests"])
      revalidatePath(`/${value.locale}/${path}`);
    return actionOk({ bookingId: result.bookingId });
  } catch (error) {
    return errorResult(error);
  }
}
