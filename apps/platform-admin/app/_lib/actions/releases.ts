"use server";

import { asUuid, integer, lines, localeOf, text, uuid } from "../form-data";
import { runOperatorAction, type ActionResult } from "../operator-action";
import { missing } from "./guard";

/** Notes may contain commas, so they split on line breaks only. */
function notes(form: FormData, name: string): string[] {
  return text(form, name)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function registerReleaseAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const locale = localeOf(form);
  const { result, data } = await runOperatorAction({
    action: "release.register",
    fn: "register_release_v1",
    args: {
      p_version: text(form, "version"),
      p_channel: text(form, "channel"),
      p_git_commit: text(form, "gitCommit").toLowerCase(),
      p_config_schema_version: integer(form, "configSchemaVersion") ?? 0,
      p_backend_min: integer(form, "backendMin") ?? 0,
      p_backend_max: integer(form, "backendMax") ?? 0,
      p_migration_ids: lines(form, "migrationIds"),
      p_feature_notes: notes(form, "featureNotes"),
      p_upgrade_notes: notes(form, "upgradeNotes"),
      p_reversible: form.get("reversible") === "on",
      p_idempotency_key: text(form, "idempotencyKey"),
    },
    targetKind: "release",
  });
  const id = data?.[0]?.release_id;
  return result.kind === "success" && id
    ? { ...result, href: `/${locale}/releases/${id}` }
    : result;
}

export async function setReleaseStatusAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const releaseId = uuid(form, "releaseId");
  const invalid = missing(releaseId);
  if (invalid) return invalid;
  return (
    await runOperatorAction({
      action: "release.set_status",
      fn: "set_release_status_v1",
      args: {
        p_release_id: releaseId!,
        p_status: text(form, "status"),
        p_reason: text(form, "reason"),
      },
      targetKind: "release",
      targetId: releaseId,
    })
  ).result;
}

export async function createRolloutAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const locale = localeOf(form);
  const releaseId = uuid(form, "releaseId");
  const invalid = missing(releaseId);
  if (invalid) return invalid;
  const rings = form
    .getAll("rings")
    .filter((value): value is string => typeof value === "string");
  const instanceIds = form
    .getAll("instanceIds")
    .map((value) => asUuid(typeof value === "string" ? value : undefined));
  if (instanceIds.some((id) => !id)) return { kind: "error", code: "not_found" };
  const { result, data } = await runOperatorAction({
    action: "rollout.create",
    fn: "create_rollout_v1",
    args: {
      p_release_id: releaseId!,
      p_rings: rings,
      p_instance_ids: instanceIds.filter((id): id is string => !!id),
      p_reason: text(form, "reason"),
      p_idempotency_key: text(form, "idempotencyKey"),
    },
    targetKind: "rollout",
  });
  const id = data?.[0]?.rollout_id;
  return result.kind === "success" && id
    ? { ...result, href: `/${locale}/rollouts/${id}` }
    : result;
}

export async function startRolloutAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const rolloutId = uuid(form, "rolloutId");
  const invalid = missing(rolloutId);
  if (invalid) return invalid;
  const { result, data } = await runOperatorAction({
    action: "rollout.start",
    fn: "start_rollout_v1",
    args: { p_rollout_id: rolloutId! },
    targetKind: "rollout",
    targetId: rolloutId,
  });
  const blocked = data?.[0]?.blocked ?? [];
  return result.kind === "success" && blocked.length
    ? { kind: "error", code: "transition_not_allowed", reasons: blocked }
    : result;
}

async function rolloutWithReason(
  form: FormData,
  action: string,
  fn: "pause_rollout_v1" | "cancel_rollout_v1" | "rollback_rollout_v1",
): Promise<ActionResult> {
  const rolloutId = uuid(form, "rolloutId");
  const invalid = missing(rolloutId);
  if (invalid) return invalid;
  return (
    await runOperatorAction({
      action,
      fn,
      args: { p_rollout_id: rolloutId!, p_reason: text(form, "reason") },
      targetKind: "rollout",
      targetId: rolloutId,
    })
  ).result;
}

export async function pauseRolloutAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return rolloutWithReason(form, "rollout.pause", "pause_rollout_v1");
}

export async function cancelRolloutAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return rolloutWithReason(form, "rollout.cancel", "cancel_rollout_v1");
}

export async function rollbackRolloutAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return rolloutWithReason(form, "rollout.rollback", "rollback_rollout_v1");
}

export async function retryRolloutAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const rolloutId = uuid(form, "rolloutId");
  const invalid = missing(rolloutId);
  if (invalid) return invalid;
  return (
    await runOperatorAction({
      action: "rollout.retry",
      fn: "retry_rollout_targets_v1",
      args: { p_rollout_id: rolloutId! },
      targetKind: "rollout",
      targetId: rolloutId,
    })
  ).result;
}
