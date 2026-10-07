"use server";

import { parseActionInput } from "@wlbp/ui-foundation/actions";
import { callOperator } from "../operator-api";
import {
  operatorError,
  operatorOk,
  runOperatorAction,
  type OperatorActionResult,
} from "../operator-action";
import {
  deactivateRunSchema,
  jobSchema,
  jobWithReasonSchema,
  provisioningRunSchema,
  requestProvisioningSchema,
  type DeactivateRunInput,
  type JobInput,
  type JobWithReasonInput,
  type ProvisioningRunInput,
  type RequestProvisioningInput,
} from "../schemas/operations";

/** The tenant that owns a record, read on the server; never taken from the form. */
function tenantField(data: unknown): string | undefined {
  const value = (data as { tenant_id?: unknown } | null)?.tenant_id;
  return typeof value === "string" ? value : undefined;
}

async function runTenant(runId: string): Promise<string | undefined> {
  const run = await callOperator("get_provisioning_run_detail_v1", { p_run_id: runId });
  return run.ok ? tenantField(run.data) : undefined;
}

async function jobTenant(jobId: string): Promise<string | undefined> {
  const job = await callOperator("get_job_v1", { p_job_id: jobId });
  return job.ok ? tenantField(job.data) : undefined;
}

export async function requestProvisioningAction(
  input: RequestProvisioningInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(requestProvisioningSchema, input);
  if (!parsed.ok) return parsed.result;
  const {
    target: { tenantId, instanceId },
    releaseId,
    locale,
  } = parsed.data;

  // The release supplies the version and contract range; the form never does.
  const releaseResult = await callOperator("get_release_v1", {
    p_release_id: releaseId,
  });
  if (!releaseResult.ok) return operatorError(releaseResult.code);
  const release = releaseResult.data as unknown as {
    status: string;
    version: string;
    config_schema_version: number;
    backend_contract_min: number;
    backend_contract_max: number;
  };
  if (release.status !== "available") return operatorError("release_invalid");

  const domains = (
    [
      ["client", parsed.data.clientHostname],
      ["dashboard", parsed.data.dashboardHostname],
    ] as const
  ).flatMap(([application, hostname]) => (hostname ? [{ application, hostname }] : []));

  const { result, data } = await runOperatorAction({
    action: "provisioning.request",
    fn: "request_provisioning_v1",
    args: {
      p_tenant_id: tenantId,
      p_instance_id: instanceId,
      p_slug: parsed.data.slug,
      p_plan_key: parsed.data.planKey,
      p_desired_release: release.version,
      p_config_schema_version: release.config_schema_version,
      p_backend_contract_min: release.backend_contract_min,
      p_backend_contract_max: release.backend_contract_max,
      p_request: {
        default_locale: parsed.data.defaultLocale,
        timezone: parsed.data.timezone,
        currency: parsed.data.currency,
        domains,
      },
      p_idempotency_key: parsed.data.idempotencyKey,
    },
    tenantId,
    targetKind: "provisioning_run",
  });
  if (!result.ok) return result;
  const row = data?.[0];
  if (row?.rejected?.length) return operatorError("settings_invalid", row.rejected);
  return operatorOk({ href: `/${locale}/provisioning/${row?.run_id}` });
}

export async function retryRunAction(
  input: ProvisioningRunInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(provisioningRunSchema, input);
  if (!parsed.ok) return parsed.result;
  const { runId } = parsed.data;
  return (
    await runOperatorAction({
      action: "provisioning.retry",
      fn: "retry_provisioning_run_v1",
      args: { p_run_id: runId },
      tenantOf: () => runTenant(runId),
      targetKind: "provisioning_run",
      targetId: runId,
    })
  ).result;
}

export async function activateRunAction(
  input: ProvisioningRunInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(provisioningRunSchema, input);
  if (!parsed.ok) return parsed.result;
  const { runId } = parsed.data;
  const { result, data } = await runOperatorAction({
    action: "provisioning.activate",
    fn: "activate_provisioned_instance_v1",
    args: { p_run_id: runId },
    tenantOf: () => runTenant(runId),
    targetKind: "provisioning_run",
    targetId: runId,
  });
  const row = data?.[0];
  if (result.ok && row && !row.activated) {
    return operatorError("transition_not_allowed", row.blocked);
  }
  return result;
}

export async function deactivateRunAction(
  input: DeactivateRunInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(deactivateRunSchema, input);
  if (!parsed.ok) return parsed.result;
  const { runId, reason } = parsed.data;
  return (
    await runOperatorAction({
      action: "provisioning.deactivate",
      fn: "deactivate_provisioned_instance_v1",
      args: { p_run_id: runId, p_reason: reason },
      tenantOf: () => runTenant(runId),
      targetKind: "provisioning_run",
      targetId: runId,
    })
  ).result;
}

export async function cancelJobAction(
  input: JobWithReasonInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(jobWithReasonSchema, input);
  if (!parsed.ok) return parsed.result;
  const { jobId, reason } = parsed.data;
  return (
    await runOperatorAction({
      action: "job.cancel",
      fn: "cancel_job_v1",
      args: { p_job_id: jobId, p_reason: reason },
      tenantOf: () => jobTenant(jobId),
      targetKind: "job",
      targetId: jobId,
    })
  ).result;
}

export async function retryJobAction(
  input: JobWithReasonInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(jobWithReasonSchema, input);
  if (!parsed.ok) return parsed.result;
  const { jobId, reason } = parsed.data;
  return (
    await runOperatorAction({
      action: "job.retry",
      fn: "retry_job_v1",
      args: { p_job_id: jobId, p_reason: reason },
      tenantOf: () => jobTenant(jobId),
      targetKind: "job",
      targetId: jobId,
    })
  ).result;
}

/** Two-person control lives in the database: the requester's approval is refused there. */
export async function approveJobAction(input: JobInput): Promise<OperatorActionResult> {
  const parsed = parseActionInput(jobSchema, input);
  if (!parsed.ok) return parsed.result;
  const { jobId } = parsed.data;
  return (
    await runOperatorAction({
      action: "job.approve",
      fn: "approve_operator_job_v1",
      args: { p_job_id: jobId },
      tenantOf: () => jobTenant(jobId),
      targetKind: "job",
      targetId: jobId,
    })
  ).result;
}
