"use server";
import { revalidatePath } from "next/cache";
import {
  actionError,
  actionOk,
  parseActionInput,
  type ActionResult,
} from "@wlbp/ui-foundation/actions";
import { DashboardRpcError } from "../../_lib/dashboard-data-source";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import {
  scheduleRemovalSchema,
  scheduleRuleSchema,
  type ScheduleRemovalInput,
  type ScheduleRuleInput,
} from "./schedule-schema";

/** Stable schedule refusals map to one editor message each; nothing else is disclosed. */
function scheduleError(error: unknown): ActionResult<never> {
  const code = error instanceof DashboardRpcError ? error.stableMessage : "";
  return actionError(
    code === "schedule_revision_conflict" || code === "revision_conflict"
      ? "stale"
      : code === "schedule_not_authorized" ||
          code === "schedule_authorization_required" ||
          code === "policy_authorization_required"
        ? "denied"
        : code === "schedule_scope_not_empty"
          ? "scopeNotEmpty"
          : code === "schedule_break_outside_hours"
            ? "breakOutside"
            : code?.startsWith("schedule_")
              ? "invalid"
              : "unavailable",
  );
}

export async function saveScheduleAction(
  input: ScheduleRuleInput,
): Promise<ActionResult> {
  const parsed = parseActionInput(scheduleRuleSchema, input);
  if (!parsed.ok) return parsed.result;
  const locale = input.locale === "ar" ? "ar" : "en";
  const request = await loadDashboardRequestAccess(locale);
  if (request.state.kind !== "ready" || !request.source?.saveScheduleConfig)
    return actionError("denied");
  try {
    await request.source.saveScheduleConfig({
      ...parsed.data,
      tenantId: request.state.context.tenantId,
    });
    for (const path of ["availability", "calendar", "today"])
      revalidatePath(`/${locale}/${path}`);
    return actionOk(undefined, "saved");
  } catch (error) {
    return scheduleError(error);
  }
}

export async function removeScheduleAction(
  input: ScheduleRemovalInput,
): Promise<ActionResult> {
  const parsed = parseActionInput(scheduleRemovalSchema, input);
  if (!parsed.ok) return parsed.result;
  const { locale, requestId, operation, id, expectedRevision, expectedScopeRevision } =
    parsed.data;
  const request = await loadDashboardRequestAccess(locale);
  if (request.state.kind !== "ready" || !request.source?.removeScheduleRecord)
    return actionError("denied");
  try {
    await request.source.removeScheduleRecord({
      tenantId: request.state.context.tenantId,
      kind: operation,
      targetId: id,
      requestId,
      expectedRevision,
      expectedScopeRevision,
    });
    revalidatePath(`/${locale}/availability`);
    revalidatePath(`/${locale}/calendar`);
    return actionOk(undefined, "removed");
  } catch (error) {
    return scheduleError(error);
  }
}
