"use server";
import { revalidatePath } from "next/cache";
import {
  actionError,
  actionOk,
  parseActionInput,
  type ActionResult,
} from "@wlbp/ui-foundation/actions";
import type { DashboardMessageKey } from "../../_lib/copy";
import { DashboardRpcError } from "../../_lib/dashboard-data-source";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { decisionOutcomeFor, type DecisionOutcome } from "../../_lib/request-decisions";
import { SettingsFieldError, mergeSettings } from "./settings-document";
import { settingsResultKeys } from "./results";
import { settingsSchema, type SettingsInput } from "./settings-schema";

type SettingsOutcome =
  DecisionOutcome | "invalid" | "saved" | "saved-partial" | "unsafe-content";

function settingsOutcomeFor(error: unknown): SettingsOutcome {
  const stable = error instanceof DashboardRpcError ? (error.stableMessage ?? "") : "";
  if (stable === "settings_invalid") return "invalid";
  if (stable === "brand_unsafe_content") return "unsafe-content";
  return decisionOutcomeFor(error);
}

/**
 * Saves the structured settings editor. Failures carry a dashboard message
 * key as the form error; success carries the saved (or partially saved)
 * message key, because saying "saved" when the plan dropped part of the
 * request would be the one thing this surface must not do.
 */
export async function saveStructuredSettingsAction(
  input: SettingsInput,
): Promise<ActionResult<{ readonly message: DashboardMessageKey }>> {
  const parsed = parseActionInput(settingsSchema, input);
  if (!parsed.ok) return parsed.result;
  const { locale, expectedRevision } = parsed.data;
  const request = await loadDashboardRequestAccess(locale);
  if (
    request.state.kind !== "ready" ||
    !request.source?.getTenantConfiguration ||
    !request.source.saveTenantSettings
  )
    return actionError("requestsResultNotAuthorized");
  try {
    const current = await request.source.getTenantConfiguration({
      tenantId: request.state.context.tenantId,
    });
    if (!current) return actionError("settingsUnavailable");
    let documents;
    try {
      documents = mergeSettings(current, parsed.data);
    } catch (error) {
      return actionError(
        "settingsResultInvalid",
        error instanceof SettingsFieldError
          ? { [error.field]: ["invalid"] }
          : undefined,
      );
    }
    const ignored = await request.source.saveTenantSettings({
      ...documents,
      expectedRevision,
      tenantId: request.state.context.tenantId,
    });
    revalidatePath(`/${locale}/settings`);
    return actionOk({
      message: ignored.length ? "settingsResultSavedPartial" : "settingsResultSaved",
    });
  } catch (error) {
    const outcome = settingsOutcomeFor(error);
    return actionError(
      outcome in settingsResultKeys
        ? settingsResultKeys[outcome as keyof typeof settingsResultKeys]
        : "requestsResultUnavailable",
    );
  }
}
