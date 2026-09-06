"use server";

import type { Locale } from "@wlbp/i18n";
import type { DashboardContextV1 } from "@wlbp/api-contracts";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import {
  getTeamResourcesResultUrl,
  parseTeamResourcesRetry,
} from "../../_lib/team-resources-retry";
import {
  executeResourceDeactivation,
  executeResourceLocationEligibility,
  executeResourceRequirement,
  executeSaveResource,
  executeSaveResourceType,
  executeSaveStaffProfile,
  executeStaffEligibility,
  executeStaffDeactivation,
  type TeamResourcesCommandResult,
} from "../../_lib/team-resources-commands";

function localeFrom(formData: FormData): Locale {
  return formData.get("locale") === "ar" ? "ar" : "en";
}

function requestIdFrom(formData: FormData): string {
  const requestId = formData.get("requestId");
  return typeof requestId === "string" ? requestId : "";
}

function retryFrom(formData: FormData) {
  return parseTeamResourcesRetry(formData.get("formId"), formData.get("requestId"));
}

export async function deactivateStaffAction(formData: FormData): Promise<never> {
  const locale = localeFrom(formData);
  const request = await loadDashboardRequestAccess(locale);
  if (request.source === null || request.state.kind !== "ready") {
    redirect(getTeamResourcesResultUrl(locale, "not-authorized"));
  }

  const result = await executeStaffDeactivation(
    {
      reason: formData.get("reason"),
      replacementStaffId: formData.get("replacementStaffId"),
      resolution: formData.get("resolution"),
      staffId: formData.get("staffId"),
    },
    request.state.context,
    request.source,
    requestIdFrom(formData),
  );
  if (result.ok) revalidatePath(`/${locale}/team-resources`);
  redirect(
    getTeamResourcesResultUrl(
      locale,
      result.ok ? result.outcome : result.code.replaceAll("_", "-"),
      retryFrom(formData),
    ),
  );
}

export async function deactivateResourceAction(formData: FormData): Promise<never> {
  const locale = localeFrom(formData);
  const request = await loadDashboardRequestAccess(locale);
  if (request.source === null || request.state.kind !== "ready") {
    redirect(getTeamResourcesResultUrl(locale, "not-authorized"));
  }

  const result = await executeResourceDeactivation(
    {
      reason: formData.get("reason"),
      replacementResourceId: formData.get("replacementResourceId"),
      resolution: formData.get("resolution"),
      resourceId: formData.get("resourceId"),
    },
    request.state.context,
    request.source,
    requestIdFrom(formData),
  );
  if (result.ok) revalidatePath(`/${locale}/team-resources`);
  redirect(
    getTeamResourcesResultUrl(
      locale,
      result.ok ? result.outcome : result.code.replaceAll("_", "-"),
      retryFrom(formData),
    ),
  );
}

async function withVerifiedContext(
  formData: FormData,
  command: (
    request: {
      source: NonNullable<
        Awaited<ReturnType<typeof loadDashboardRequestAccess>>["source"]
      >;
      state: { context: DashboardContextV1; kind: "ready" };
    },
    requestId: string,
  ) => Promise<TeamResourcesCommandResult>,
): Promise<never> {
  const locale = localeFrom(formData);
  const request = await loadDashboardRequestAccess(locale);
  if (request.source === null || request.state.kind !== "ready") {
    redirect(getTeamResourcesResultUrl(locale, "not-authorized"));
  }

  const result = await command(
    { source: request.source, state: request.state },
    requestIdFrom(formData),
  );
  if (result.ok) revalidatePath(`/${locale}/team-resources`);
  redirect(
    getTeamResourcesResultUrl(
      locale,
      result.ok ? "saved" : result.code.replaceAll("_", "-"),
      retryFrom(formData),
    ),
  );
}

export async function saveStaffProfileAction(formData: FormData): Promise<never> {
  return withVerifiedContext(formData, (request, requestId) =>
    executeSaveStaffProfile(
      {
        bio: formData.get("bio"),
        expectedRevision: formData.get("expectedRevision"),
        internalNotes: formData.get("internalNotes"),
        membershipId: formData.get("membershipId"),
        offeredHoursPerWeek: formData.get("offeredHoursPerWeek"),
        publicName: formData.get("publicName"),
        reason: formData.get("reason"),
        staffId: formData.get("staffId"),
      },
      request.state.context,
      request.source,
      requestId,
    ),
  );
}

export async function saveResourceTypeAction(formData: FormData): Promise<never> {
  return withVerifiedContext(formData, (request, requestId) =>
    executeSaveResourceType(
      {
        exclusive: formData.get("exclusive"),
        expectedRevision: formData.get("expectedRevision"),
        key: formData.get("key"),
        name: formData.get("name"),
        reason: formData.get("reason"),
        resourceTypeId: formData.get("resourceTypeId"),
      },
      request.state.context,
      request.source,
      requestId,
    ),
  );
}

export async function saveResourceAction(formData: FormData): Promise<never> {
  return withVerifiedContext(formData, (request, requestId) =>
    executeSaveResource(
      {
        internalNotes: formData.get("internalNotes"),
        expectedRevision: formData.get("expectedRevision"),
        key: formData.get("key"),
        publicName: formData.get("publicName"),
        reason: formData.get("reason"),
        resourceId: formData.get("resourceId"),
        resourceTypeId: formData.get("resourceTypeId"),
        status: formData.get("status"),
      },
      request.state.context,
      request.source,
      requestId,
    ),
  );
}

export async function setStaffEligibilityAction(formData: FormData): Promise<never> {
  return withVerifiedContext(formData, (request, requestId) =>
    executeStaffEligibility(
      {
        eligible: formData.get("eligible"),
        locationId: formData.get("locationId"),
        reason: formData.get("reason"),
        serviceId: formData.get("serviceId"),
        staffId: formData.get("staffId"),
      },
      request.state.context,
      request.source,
      requestId,
    ),
  );
}

export async function setResourceLocationEligibilityAction(
  formData: FormData,
): Promise<never> {
  return withVerifiedContext(formData, (request, requestId) =>
    executeResourceLocationEligibility(
      {
        eligible: formData.get("eligible"),
        locationId: formData.get("locationId"),
        reason: formData.get("reason"),
        resourceId: formData.get("resourceId"),
      },
      request.state.context,
      request.source,
      requestId,
    ),
  );
}

export async function setResourceRequirementAction(formData: FormData): Promise<never> {
  return withVerifiedContext(formData, (request, requestId) =>
    executeResourceRequirement(
      {
        reason: formData.get("reason"),
        required: formData.get("required"),
        resourceTypeId: formData.get("resourceTypeId"),
        serviceId: formData.get("serviceId"),
      },
      request.state.context,
      request.source,
      requestId,
    ),
  );
}
