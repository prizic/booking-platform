"use server";

import { callOperator } from "../operator-api";
import { asUuid, localeOf, optional, text, uuid } from "../form-data";
import { runOperatorAction, type ActionResult } from "../operator-action";
import { missing } from "./guard";

export async function requestProvisioningAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const locale = localeOf(form);
  const [tenantRaw, instanceRaw] = text(form, "target").split("|");
  const tenantId = asUuid(tenantRaw);
  const instanceId = asUuid(instanceRaw);
  const releaseId = uuid(form, "releaseId");
  const invalid = missing(tenantId, instanceId, releaseId);
  if (invalid) return invalid;

  // The release supplies the version and contract range; the form never does.
  const releaseResult = await callOperator("get_release_v1", {
    p_release_id: releaseId!,
  });
  if (!releaseResult.ok) return { kind: "error", code: releaseResult.code };
  const release = releaseResult.data as unknown as {
    status: string;
    version: string;
    config_schema_version: number;
    backend_contract_min: number;
    backend_contract_max: number;
  };
  if (release.status !== "available") return { kind: "error", code: "release_invalid" };

  const domains = [
    ["client", optional(form, "clientHostname")],
    ["dashboard", optional(form, "dashboardHostname")],
  ].flatMap(([application, hostname]) =>
    hostname ? [{ application, hostname: hostname.toLowerCase() }] : [],
  );

  const { result, data } = await runOperatorAction({
    action: "provisioning.request",
    fn: "request_provisioning_v1",
    args: {
      p_tenant_id: tenantId!,
      p_instance_id: instanceId!,
      p_slug: text(form, "slug").toLowerCase(),
      p_plan_key: text(form, "planKey"),
      p_desired_release: release.version,
      p_config_schema_version: release.config_schema_version,
      p_backend_contract_min: release.backend_contract_min,
      p_backend_contract_max: release.backend_contract_max,
      p_request: {
        default_locale: text(form, "defaultLocale"),
        timezone: text(form, "timezone"),
        currency: text(form, "currency").toUpperCase(),
        domains,
      },
      p_idempotency_key: text(form, "idempotencyKey"),
    },
    tenantId,
    targetKind: "provisioning_run",
  });
  if (result.kind !== "success") return result;
  const row = data?.[0];
  if (row?.rejected?.length)
    return { kind: "error", code: "settings_invalid", reasons: row.rejected };
  return { ...result, href: `/${locale}/provisioning/${row?.run_id}` };
}

export async function retryRunAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const runId = uuid(form, "runId");
  const invalid = missing(runId);
  if (invalid) return invalid;
  return (
    await runOperatorAction({
      action: "provisioning.retry",
      fn: "retry_provisioning_run_v1",
      args: { p_run_id: runId! },
      tenantId: uuid(form, "tenantId"),
      targetKind: "provisioning_run",
      targetId: runId,
    })
  ).result;
}

export async function activateRunAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const runId = uuid(form, "runId");
  const invalid = missing(runId);
  if (invalid) return invalid;
  const { result, data } = await runOperatorAction({
    action: "provisioning.activate",
    fn: "activate_provisioned_instance_v1",
    args: { p_run_id: runId! },
    tenantId: uuid(form, "tenantId"),
    targetKind: "provisioning_run",
    targetId: runId,
  });
  const row = data?.[0];
  if (result.kind === "success" && row && !row.activated) {
    return { kind: "error", code: "transition_not_allowed", reasons: row.blocked };
  }
  return result;
}

export async function deactivateRunAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const runId = uuid(form, "runId");
  const invalid = missing(runId);
  if (invalid) return invalid;
  return (
    await runOperatorAction({
      action: "provisioning.deactivate",
      fn: "deactivate_provisioned_instance_v1",
      args: { p_run_id: runId!, p_reason: text(form, "reason") },
      tenantId: uuid(form, "tenantId"),
      targetKind: "provisioning_run",
      targetId: runId,
    })
  ).result;
}

export async function cancelJobAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const jobId = uuid(form, "jobId");
  const invalid = missing(jobId);
  if (invalid) return invalid;
  return (
    await runOperatorAction({
      action: "job.cancel",
      fn: "cancel_job_v1",
      args: { p_job_id: jobId!, p_reason: text(form, "reason") },
      tenantId: uuid(form, "tenantId"),
      targetKind: "job",
      targetId: jobId,
    })
  ).result;
}

export async function retryJobAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const jobId = uuid(form, "jobId");
  const invalid = missing(jobId);
  if (invalid) return invalid;
  return (
    await runOperatorAction({
      action: "job.retry",
      fn: "retry_job_v1",
      args: { p_job_id: jobId!, p_reason: text(form, "reason") },
      tenantId: uuid(form, "tenantId"),
      targetKind: "job",
      targetId: jobId,
    })
  ).result;
}

export async function approveJobAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const jobId = uuid(form, "jobId");
  const invalid = missing(jobId);
  if (invalid) return invalid;
  return (
    await runOperatorAction({
      action: "job.approve",
      fn: "approve_operator_job_v1",
      args: { p_job_id: jobId! },
      tenantId: uuid(form, "tenantId"),
      targetKind: "job",
      targetId: jobId,
    })
  ).result;
}
