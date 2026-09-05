"use server";

import type { Locale } from "@wlbp/i18n";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  executeResourceDeactivation,
  executeStaffDeactivation,
} from "../../_lib/team-resources-commands";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";

function localeFrom(formData: FormData): Locale {
  return formData.get("locale") === "ar" ? "ar" : "en";
}

function resultUrl(locale: Locale, result: string) {
  return `/${locale}/team-resources?result=${result}`;
}

export async function deactivateStaffAction(formData: FormData): Promise<never> {
  const locale = localeFrom(formData);
  const request = await loadDashboardRequestAccess(locale);
  if (request.source === null || request.state.kind !== "ready") {
    redirect(resultUrl(locale, "failed"));
  }

  const result = await executeStaffDeactivation(
    {
      reason: formData.get("reason"),
      replacementStaffId: formData.get("replacementStaffId"),
      resolution: formData.get("resolution"),
      staffId: formData.get("targetId"),
    },
    request.state.context,
    request.source,
    crypto.randomUUID(),
  );
  if (result.ok) revalidatePath(`/${locale}/team-resources`);
  redirect(resultUrl(locale, result.ok ? result.outcome : "failed"));
}

export async function deactivateResourceAction(formData: FormData): Promise<never> {
  const locale = localeFrom(formData);
  const request = await loadDashboardRequestAccess(locale);
  if (request.source === null || request.state.kind !== "ready") {
    redirect(resultUrl(locale, "failed"));
  }

  const result = await executeResourceDeactivation(
    {
      reason: formData.get("reason"),
      resolution: formData.get("resolution"),
      resourceId: formData.get("targetId"),
    },
    request.state.context,
    request.source,
    crypto.randomUUID(),
  );
  if (result.ok) revalidatePath(`/${locale}/team-resources`);
  redirect(resultUrl(locale, result.ok ? result.outcome : "failed"));
}
