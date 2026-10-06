"use server";
import { revalidatePath } from "next/cache";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { DashboardRpcError } from "../../_lib/dashboard-data-source";
import { parseStaffAccessCommand, type StaffAccessMessage } from "./staff-access";
export interface StaffAccessResult {
  readonly nextRequestId?: string;
  readonly message?: StaffAccessMessage;
  readonly saved?: boolean;
}
export async function changeStaffAccessAction(
  _state: StaffAccessResult,
  form: FormData,
): Promise<StaffAccessResult> {
  const locale = form.get("locale") === "ar" ? "ar" : "en";
  const command = parseStaffAccessCommand(form);
  if (!command) return { message: "invalid" };
  const request = await loadDashboardRequestAccess(locale);
  if (request.state.kind !== "ready" || !request.source?.changeStaffAccess)
    return { message: "not_authorized" };
  try {
    await request.source.changeStaffAccess({
      ...command,
      tenantId: request.state.context.tenantId,
    });
    revalidatePath(`/${locale}/team-resources`);
    return { message: "saved", saved: true, nextRequestId: crypto.randomUUID() };
  } catch (error) {
    const known: readonly StaffAccessMessage[] = [
      "revision_conflict",
      "last_administrator_required",
      "step_up_required",
      "idempotency_conflict",
      "invitation_not_pending",
      "member_already_active",
      "not_authorized",
    ];
    const message = error instanceof DashboardRpcError ? error.stableMessage : null;
    return {
      message: known.includes(message as StaffAccessMessage)
        ? (message as StaffAccessMessage)
        : "unavailable",
    };
  }
}
