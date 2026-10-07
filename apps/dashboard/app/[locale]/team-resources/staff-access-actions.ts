"use server";
import { revalidatePath } from "next/cache";
import {
  actionError,
  actionOk,
  parseActionInput,
  type ActionResult,
} from "@wlbp/ui-foundation/actions";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { DashboardRpcError } from "../../_lib/dashboard-data-source";
import type { StaffAccessMessage } from "./staff-access";
import { staffAccessSchema, type StaffAccessInput } from "./staff-access-schema";

const known: readonly StaffAccessMessage[] = [
  "revision_conflict",
  "last_administrator_required",
  "step_up_required",
  "idempotency_conflict",
  "invitation_not_pending",
  "member_already_active",
  "not_authorized",
];

export async function changeStaffAccessAction(
  input: StaffAccessInput,
): Promise<ActionResult> {
  const parsed = parseActionInput(staffAccessSchema, input);
  if (!parsed.ok) return parsed.result;
  const locale = input.locale === "ar" ? "ar" : "en";
  const request = await loadDashboardRequestAccess(locale);
  if (request.state.kind !== "ready" || !request.source?.changeStaffAccess)
    return actionError("not_authorized");
  try {
    await request.source.changeStaffAccess({
      ...parsed.data,
      tenantId: request.state.context.tenantId,
    });
    revalidatePath(`/${locale}/team-resources`);
    return actionOk(undefined, "saved");
  } catch (error) {
    const message = error instanceof DashboardRpcError ? error.stableMessage : null;
    return actionError(
      known.includes(message as StaffAccessMessage)
        ? (message as string)
        : "unavailable",
    );
  }
}
