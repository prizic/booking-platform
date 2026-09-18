function mappedStep(row) {
  if (!row || typeof row.step_id !== "string" || typeof row.step_key !== "string") {
    throw new Error("provisioning_database_response_invalid");
  }
  const step = {
    externalId: row.external_id ?? null,
    id: row.step_id,
    idempotencyKey: row.idempotency_key,
    provider: row.provider,
    slug: row.slug,
    stepKey: row.step_key,
  };
  if (row.instance_id !== undefined) step.instanceId = row.instance_id;
  if (row.request !== undefined) step.request = row.request;
  if (row.run_id !== undefined) step.runId = row.run_id;
  if (row.tenant_id !== undefined) step.tenantId = row.tenant_id;
  return step;
}

function mappedProjects(row) {
  if (
    !row ||
    typeof row.client_project_id !== "string" ||
    typeof row.dashboard_project_id !== "string"
  ) {
    return null;
  }
  return {
    clientProjectId: row.client_project_id,
    clientProjectName:
      typeof row.client_project_name === "string" ? row.client_project_name : null,
    dashboardProjectId: row.dashboard_project_id,
    dashboardProjectName:
      typeof row.dashboard_project_name === "string"
        ? row.dashboard_project_name
        : null,
  };
}

export function createSupabaseProvisioningStore({ now = () => new Date(), supabase }) {
  if (!supabase || typeof supabase.rpc !== "function") {
    throw new Error("provisioning_database_client_required");
  }

  async function rpc(name, args) {
    const { data, error } = await supabase.rpc(name, args);
    if (error) throw new Error("provisioning_database_rpc_failed");
    return data;
  }

  async function claim() {
    const rows = await rpc("claim_provisioning_step_v1", {
      p_lock_seconds: 300,
      p_run_id: null,
    });
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return mappedStep(rows[0]);
  }

  async function complete(command) {
    const retryAfter =
      command.outcome === "waiting" &&
      Number.isInteger(command.retryAfterSeconds) &&
      command.retryAfterSeconds > 0
        ? new Date(now().getTime() + command.retryAfterSeconds * 1000).toISOString()
        : null;
    return rpc("complete_provisioning_step_v1", {
      p_error_code: command.errorCode ?? null,
      p_external_id: command.externalId ?? null,
      p_observed_state: command.observedState ?? {},
      p_outcome: command.outcome,
      p_retry_after: retryAfter,
      p_step_id: command.stepId,
      p_waiting_reason: command.waitingReason ?? null,
    });
  }

  async function vercelProjectsFor(step) {
    if (!step || typeof step.runId !== "string") return null;
    const rows = await rpc("vercel_projects_for_run_v1", { p_run_id: step.runId });
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return mappedProjects(rows[0]);
  }

  return { claim, complete, vercelProjectsFor };
}
