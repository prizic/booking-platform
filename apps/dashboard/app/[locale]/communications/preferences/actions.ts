"use server";
import { revalidatePath } from "next/cache";
import type { StaffPreferenceKeyV1 } from "@wlbp/api-contracts";
import {
  actionError,
  actionOk,
  parseActionInput,
  type ActionResult,
} from "@wlbp/ui-foundation/actions";
import { loadDashboardRequestAccess } from "../../../_lib/dashboard-server";
import { stableRpcMessage } from "../../../_lib/notification-access";
import type { NotificationMessageKey } from "../../../_lib/notification-copy";
import { myPreferencesSchema, type MyPreferencesInput } from "./preferences-schema";

type Code = NotificationMessageKey | "unavailable";

/**
 * Saves the signed-in member's own alert choices and agenda time. The
 * membership comes from the session in the database, never from input, so a
 * member can only ever change their own preferences.
 */
export async function saveMyNotificationPreferencesAction(
  input: MyPreferencesInput,
): Promise<ActionResult<{ readonly revision: number }>> {
  const parsed = parseActionInput(myPreferencesSchema, input);
  if (!parsed.ok) return parsed.result;
  const { locale, requestId, alerts, digestEnabled, digestLocalTime } = parsed.data;
  const request = await loadDashboardRequestAccess(locale);
  if (request.state.kind !== "ready" || !request.source?.saveMyNotificationPreferences)
    return actionError("prefsNotMember" satisfies Code);
  const preferences: Partial<Record<StaffPreferenceKeyV1, boolean>> = {
    "staff.daily_digest": digestEnabled,
  };
  for (const alert of alerts)
    preferences[alert.templateKey as StaffPreferenceKeyV1] = alert.enabled;
  try {
    const saved = await request.source.saveMyNotificationPreferences({
      tenantId: request.state.context.tenantId,
      preferences,
      digestLocalTime,
      requestId,
    });
    revalidatePath(`/${locale}/communications/preferences`);
    return actionOk({ revision: saved.revision });
  } catch (error) {
    const stable = stableRpcMessage(error);
    return actionError(
      (stable === "policy_denied"
        ? "prefsNotMember"
        : stable === "notification_preferences_invalid"
          ? "prefsInvalid"
          : "unavailable") satisfies Code,
    );
  }
}
