import type { ActionResult } from "@wlbp/ui-foundation/actions";

/**
 * What a successful operator mutation tells the form: where to go next, or a
 * file to hand to the browser. Failures use the shared ActionResult shape:
 * `formError` is an operator error code (see operator-errors.ts) and
 * `fieldErrors._form` carries the validation/prerequisite reason codes the
 * database returned as data (rendered through reasonCopy).
 */
export type OperatorOutcome =
  { href?: string; download?: { filename: string; body: string } } | undefined;

export type OperatorActionResult = ActionResult<OperatorOutcome>;

/** The code the step-up prompt answers; the same submission is then re-sent. */
export const stepUpCode = "recent_authentication_required";

/** Reason codes attached to a failed result, if any. */
export function failureReasons(result: OperatorActionResult): readonly string[] {
  return result.ok ? [] : (result.fieldErrors?._form ?? []);
}
