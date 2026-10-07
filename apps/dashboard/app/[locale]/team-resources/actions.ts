"use server";

import type { Locale } from "@wlbp/i18n";
import type { DashboardContextV1 } from "@wlbp/api-contracts";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import {
  actionError,
  actionOk,
  parseActionInput,
  type ActionResult,
} from "@wlbp/ui-foundation/actions";

import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { getTeamResourcesResultUrl } from "../../_lib/team-resources-retry";
import {
  executeResourceDeactivation,
  executeResourceLocationEligibility,
  executeResourceRequirement,
  executeSaveResource,
  executeSaveResourceType,
  executeSaveStaffProfile,
  executeStaffEligibility,
  executeStaffDeactivation,
  type DeactivationCommandResult,
  type TeamResourcesCommandResult,
} from "../../_lib/team-resources-commands";
import {
  resourceDeactivationSchema,
  resourceLocationEligibilitySchema,
  resourceRequirementSchema,
  resourceSchema,
  resourceTypeSchema,
  staffDeactivationSchema,
  staffEligibilitySchema,
  staffProfileSchema,
  type ResourceDeactivationInput,
  type ResourceInput,
  type ResourceLocationEligibilityInput,
  type ResourceRequirementInput,
  type ResourceTypeInput,
  type StaffDeactivationInput,
  type StaffEligibilityInput,
  type StaffProfileInput,
} from "./team-resources-schema";

/** Where a successful change is reported: the page's result banner. */
export type TeamResourcesActionResult = ActionResult<{ readonly destination: string }>;

type Source = NonNullable<
  Awaited<ReturnType<typeof loadDashboardRequestAccess>>["source"]
>;

/**
 * Validates the input with the form's schema, runs the command against the
 * verified session (tenant and capabilities never come from the input), and
 * reports the outcome. Failures keep the operator on the form with their
 * values; the codes are the page's former result names.
 */
async function run<S extends z.ZodType<{ locale: Locale }>>(
  schema: S,
  input: unknown,
  command: (
    data: z.output<S>,
    context: DashboardContextV1,
    source: Source,
  ) => Promise<TeamResourcesCommandResult | DeactivationCommandResult>,
): Promise<TeamResourcesActionResult> {
  const parsed = parseActionInput(schema, input);
  if (!parsed.ok) return parsed.result;
  const locale = parsed.data.locale;
  const request = await loadDashboardRequestAccess(locale);
  if (request.source === null || request.state.kind !== "ready")
    return actionError("not-authorized");
  const result = await command(parsed.data, request.state.context, request.source);
  if (!result.ok) return actionError(result.code.replaceAll("_", "-"));
  revalidatePath(`/${locale}/team-resources`);
  return actionOk({
    destination: getTeamResourcesResultUrl(
      locale,
      "outcome" in result ? result.outcome : "saved",
    ),
  });
}

export async function deactivateStaffAction(
  input: StaffDeactivationInput,
): Promise<TeamResourcesActionResult> {
  return run(staffDeactivationSchema, input, (data, context, source) =>
    executeStaffDeactivation(
      {
        reason: data.reason,
        replacementStaffId: data.replacementStaffId,
        resolution: data.resolution,
        staffId: data.staffId,
      },
      context,
      source,
      data.requestId,
    ),
  );
}

export async function deactivateResourceAction(
  input: ResourceDeactivationInput,
): Promise<TeamResourcesActionResult> {
  return run(resourceDeactivationSchema, input, (data, context, source) =>
    executeResourceDeactivation(
      {
        reason: data.reason,
        replacementResourceId: data.replacementResourceId,
        resolution: data.resolution,
        resourceId: data.resourceId,
      },
      context,
      source,
      data.requestId,
    ),
  );
}

export async function saveStaffProfileAction(
  input: StaffProfileInput,
): Promise<TeamResourcesActionResult> {
  return run(staffProfileSchema, input, (data, context, source) =>
    executeSaveStaffProfile(
      {
        bio: data.bio,
        expectedRevision:
          data.expectedRevision === null ? "" : String(data.expectedRevision),
        internalNotes: data.internalNotes,
        membershipId: data.membershipId,
        offeredHoursPerWeek: data.offeredHoursPerWeek,
        publicName: data.publicName,
        reason: data.reason,
        staffId: data.staffId,
      },
      context,
      source,
      data.requestId,
    ),
  );
}

export async function saveResourceTypeAction(
  input: ResourceTypeInput,
): Promise<TeamResourcesActionResult> {
  return run(resourceTypeSchema, input, (data, context, source) =>
    executeSaveResourceType(
      {
        exclusive: data.exclusive,
        expectedRevision:
          data.expectedRevision === null ? "" : String(data.expectedRevision),
        key: data.key,
        name: data.name,
        reason: data.reason,
        resourceTypeId: data.resourceTypeId,
      },
      context,
      source,
      data.requestId,
    ),
  );
}

export async function saveResourceAction(
  input: ResourceInput,
): Promise<TeamResourcesActionResult> {
  return run(resourceSchema, input, (data, context, source) =>
    executeSaveResource(
      {
        internalNotes: data.internalNotes,
        expectedRevision:
          data.expectedRevision === null ? "" : String(data.expectedRevision),
        key: data.key,
        publicName: data.publicName,
        reason: data.reason,
        resourceId: data.resourceId,
        resourceTypeId: data.resourceTypeId,
        status: data.status,
      },
      context,
      source,
      data.requestId,
    ),
  );
}

export async function setStaffEligibilityAction(
  input: StaffEligibilityInput,
): Promise<TeamResourcesActionResult> {
  return run(staffEligibilitySchema, input, (data, context, source) =>
    executeStaffEligibility(
      {
        eligible: data.eligible,
        locationId: data.locationId,
        reason: data.reason,
        serviceId: data.serviceId,
        staffId: data.staffId,
      },
      context,
      source,
      data.requestId,
    ),
  );
}

export async function setResourceLocationEligibilityAction(
  input: ResourceLocationEligibilityInput,
): Promise<TeamResourcesActionResult> {
  return run(resourceLocationEligibilitySchema, input, (data, context, source) =>
    executeResourceLocationEligibility(
      {
        eligible: data.eligible,
        locationId: data.locationId,
        reason: data.reason,
        resourceId: data.resourceId,
      },
      context,
      source,
      data.requestId,
    ),
  );
}

export async function setResourceRequirementAction(
  input: ResourceRequirementInput,
): Promise<TeamResourcesActionResult> {
  return run(resourceRequirementSchema, input, (data, context, source) =>
    executeResourceRequirement(
      {
        reason: data.reason,
        required: data.required,
        resourceTypeId: data.resourceTypeId,
        serviceId: data.serviceId,
      },
      context,
      source,
      data.requestId,
    ),
  );
}
