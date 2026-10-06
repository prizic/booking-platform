"use server";
import type {
  CreateHoldV1Request,
  ConfirmBookingV1Request,
  AvailabilityV1Request,
} from "@wlbp/api-contracts";
import { loadDashboardRequestAccess } from "../../../_lib/dashboard-server";
import { createDashboardAuthClient } from "../../../_lib/auth-server";
import { createOnBehalfDataSource } from "./on-behalf-data-source";
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
function errorResult(error: unknown) {
  const allowed = [
    "slot_unavailable",
    "capacity_exhausted",
    "policy_denied",
    "revision_conflict",
    "payment_pending",
    "idempotency_conflict",
    "denied",
  ];
  return {
    error:
      error instanceof Error && allowed.includes(error.message)
        ? error.message
        : "unavailable",
  } as const;
}
export async function availableOnBehalf(request: AvailabilityV1Request) {
  try {
    const { request: ctx } = await context(request.locale);
    if (!ctx.source?.getAvailability || ctx.state.kind !== "ready")
      return { error: "unavailable" } as const;
    return {
      availability: await ctx.source.getAvailability(
        ctx.state.context.dashboardHostname,
        request,
      ),
    };
  } catch (error) {
    return errorResult(error);
  }
}
export async function holdOnBehalf(request: CreateHoldV1Request) {
  try {
    return { held: await (await context(request.locale)).source.hold(request) };
  } catch (error) {
    return errorResult(error);
  }
}
export async function confirmOnBehalf(request: ConfirmBookingV1Request) {
  try {
    const result = await (await context(request.locale)).source.confirm(request);
    for (const path of ["today", "calendar", "bookings", "customers", "requests"])
      revalidatePath(`/${request.locale}/${path}`);
    return { booking: result };
  } catch (error) {
    return errorResult(error);
  }
}
