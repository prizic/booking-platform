"use server";

import { parseActionInput } from "@wlbp/ui-foundation/actions";
import { runOperatorAction, type OperatorActionResult } from "../operator-action";
import { planKeyPattern, savePlanSchema, type SavePlanInput } from "../schemas/plans";

export async function savePlanAction(
  input: SavePlanInput,
): Promise<OperatorActionResult> {
  const parsed = parseActionInput(savePlanSchema, input);
  if (!parsed.ok) return parsed.result;
  const { mode, key, name, features, active, reason } = parsed.data;
  const create = mode === "create";
  return (
    await runOperatorAction({
      action: create ? "plan.create" : "plan.update",
      fn: "save_plan_v1",
      args: {
        p_key: key,
        p_name: name,
        p_entitlements: features,
        p_active: active,
        p_create: create,
        p_reason: reason,
      },
      targetKind: "plan",
      targetId: planKeyPattern.test(key) ? key : undefined,
    })
  ).result;
}
