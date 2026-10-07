"use server";

import { parseActionInput } from "@wlbp/ui-foundation/actions";
import {
  operatorError,
  operatorOk,
  runOperatorAction,
  type OperatorActionResult,
} from "../operator-action";
import {
  createRolloutSchema,
  registerReleaseSchema,
  rollbackRolloutSchema,
  rolloutSchema,
  rolloutWithReasonSchema,
  setReleaseStatusSchema,
  type CreateRolloutInput,
  type RegisterReleaseInput,
  type RollbackRolloutInput,
  type RolloutInput,
  type RolloutWithReasonInput,
  type SetReleaseStatusInput,
} from "../schemas/releases";

export async function registerReleaseAction(
  input: RegisterReleaseInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(registerReleaseSchema, input);
  if (!parsed.ok) return parsed.result;
  const release = parsed.data;
  const { result, data } = await runOperatorAction({
    action: "release.register",
    fn: "register_release_v1",
    args: {
      p_version: release.version,
      p_channel: release.channel,
      p_git_commit: release.gitCommit,
      p_config_schema_version: release.configSchemaVersion,
      p_backend_min: release.backendMin,
      p_backend_max: release.backendMax,
      p_migration_ids: release.migrationIds,
      p_feature_notes: release.featureNotes,
      p_upgrade_notes: release.upgradeNotes,
      p_reversible: release.reversible,
      p_idempotency_key: release.idempotencyKey,
    },
    targetKind: "release",
  });
  const id = data?.[0]?.release_id;
  return result.ok && id
    ? operatorOk({ href: `/${release.locale}/releases/${id}` })
    : result;
}

export async function setReleaseStatusAction(
  input: SetReleaseStatusInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(setReleaseStatusSchema, input);
  if (!parsed.ok) return parsed.result;
  const { releaseId, status, reason } = parsed.data;
  return (
    await runOperatorAction({
      action: "release.set_status",
      fn: "set_release_status_v1",
      args: { p_release_id: releaseId, p_status: status, p_reason: reason },
      targetKind: "release",
      targetId: releaseId,
    })
  ).result;
}

export async function createRolloutAction(
  input: CreateRolloutInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(createRolloutSchema, input);
  if (!parsed.ok) return parsed.result;
  const { releaseId, rings, instanceIds, reason, idempotencyKey, locale } = parsed.data;
  const { result, data } = await runOperatorAction({
    action: "rollout.create",
    fn: "create_rollout_v1",
    args: {
      p_release_id: releaseId,
      p_rings: rings,
      p_instance_ids: instanceIds,
      p_reason: reason,
      p_idempotency_key: idempotencyKey,
    },
    targetKind: "rollout",
  });
  const id = data?.[0]?.rollout_id;
  return result.ok && id ? operatorOk({ href: `/${locale}/rollouts/${id}` }) : result;
}

export async function startRolloutAction(
  input: RolloutInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(rolloutSchema, input);
  if (!parsed.ok) return parsed.result;
  const { rolloutId } = parsed.data;
  const { result, data } = await runOperatorAction({
    action: "rollout.start",
    fn: "start_rollout_v1",
    args: { p_rollout_id: rolloutId },
    targetKind: "rollout",
    targetId: rolloutId,
  });
  const blocked = data?.[0]?.blocked ?? [];
  return result.ok && blocked.length
    ? operatorError("transition_not_allowed", blocked)
    : result;
}

async function rolloutWithReason(
  rolloutId: string,
  reason: string,
  action: string,
  fn: "pause_rollout_v1" | "cancel_rollout_v1" | "rollback_rollout_v1",
): Promise<OperatorActionResult> {
  return (
    await runOperatorAction({
      action,
      fn,
      args: { p_rollout_id: rolloutId, p_reason: reason },
      targetKind: "rollout",
      targetId: rolloutId,
    })
  ).result;
}

export async function pauseRolloutAction(
  input: RolloutWithReasonInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(rolloutWithReasonSchema, input);
  if (!parsed.ok) return parsed.result;
  const { rolloutId, reason } = parsed.data;
  return rolloutWithReason(rolloutId, reason, "rollout.pause", "pause_rollout_v1");
}

export async function cancelRolloutAction(
  input: RolloutWithReasonInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(rolloutWithReasonSchema, input);
  if (!parsed.ok) return parsed.result;
  const { rolloutId, reason } = parsed.data;
  return rolloutWithReason(rolloutId, reason, "rollout.cancel", "cancel_rollout_v1");
}

export async function rollbackRolloutAction(
  input: RollbackRolloutInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(rollbackRolloutSchema, input);
  if (!parsed.ok) return parsed.result;
  const { rolloutId, reason } = parsed.data;
  return rolloutWithReason(
    rolloutId,
    reason,
    "rollout.rollback",
    "rollback_rollout_v1",
  );
}

export async function retryRolloutAction(
  input: RolloutInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(rolloutSchema, input);
  if (!parsed.ok) return parsed.result;
  const { rolloutId } = parsed.data;
  return (
    await runOperatorAction({
      action: "rollout.retry",
      fn: "retry_rollout_targets_v1",
      args: { p_rollout_id: rolloutId },
      targetKind: "rollout",
      targetId: rolloutId,
    })
  ).result;
}
