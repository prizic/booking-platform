"use server";

import type { Locale } from "@wlbp/i18n";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { DashboardRpcError } from "../../_lib/dashboard-data-source";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { decisionOutcomeFor, type DecisionOutcome } from "../../_lib/request-decisions";

type SettingsOutcome =
  DecisionOutcome | "invalid" | "saved" | "saved-partial" | "unsafe-content";

function settingsOutcomeFor(error: unknown): SettingsOutcome {
  const stable = error instanceof DashboardRpcError ? (error.stableMessage ?? "") : "";
  if (stable === "settings_invalid") return "invalid";
  if (stable === "brand_unsafe_content") return "unsafe-content";
  return decisionOutcomeFor(error);
}

export async function saveSettingsAction(formData: FormData): Promise<never> {
  const locale: Locale = formData.get("locale") === "ar" ? "ar" : "en";
  const base = `/${locale}/settings`;
  const expectedRevision = Number(formData.get("expectedRevision"));
  const raw = {
    featureConfiguration: formData.get("featureConfiguration"),
    navigation: formData.get("navigation"),
    settings: formData.get("settings"),
  };
  if (
    !Number.isSafeInteger(expectedRevision) ||
    typeof raw.settings !== "string" ||
    typeof raw.navigation !== "string" ||
    typeof raw.featureConfiguration !== "string"
  ) {
    redirect(`${base}?result=invalid-request`);
  }

  let settings: unknown;
  let navigation: unknown;
  let featureConfiguration: unknown;
  try {
    settings = JSON.parse(raw.settings);
    navigation = JSON.parse(raw.navigation);
    featureConfiguration = JSON.parse(raw.featureConfiguration);
  } catch {
    redirect(`${base}?result=invalid-request`);
  }

  const request = await loadDashboardRequestAccess(locale);
  if (
    request.source === null ||
    request.state.kind !== "ready" ||
    request.source.saveTenantSettings === undefined
  ) {
    redirect(`${base}?result=not-authorized`);
  }

  let outcome: SettingsOutcome;
  try {
    const ignored = await request.source.saveTenantSettings({
      expectedRevision,
      featureConfiguration,
      navigation,
      settings,
      tenantId: request.state.context.tenantId,
    });
    // The save succeeded either way; saying "saved" when part of it was
    // silently dropped would be the one thing this surface must not do.
    outcome = ignored.length > 0 ? "saved-partial" : "saved";
  } catch (error) {
    outcome = settingsOutcomeFor(error);
  }
  if (outcome === "saved" || outcome === "saved-partial") {
    revalidatePath(base);
  }
  redirect(`${base}?result=${outcome}`);
}
