"use server";

import { lines, text } from "../form-data";
import { runOperatorAction, type ActionResult } from "../operator-action";

export async function savePlanAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const key = text(form, "key").toLowerCase();
  const create = text(form, "mode") === "create";
  return (
    await runOperatorAction({
      action: create ? "plan.create" : "plan.update",
      fn: "save_plan_v1",
      args: {
        p_key: key,
        p_name: text(form, "name"),
        p_entitlements: lines(form, "features").map((feature) => feature.toLowerCase()),
        p_active: form.get("active") === "on",
        p_create: create,
        p_reason: text(form, "reason"),
      },
      targetKind: "plan",
      targetId: /^[a-z][a-z0-9_-]{1,40}$/u.test(key) ? key : undefined,
    })
  ).result;
}
