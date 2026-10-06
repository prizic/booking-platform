import "server-only";

import type { ActionResult } from "../operator-action";

/** A missing or malformed identifier is a stale page, not a database question. */
export function missing(...values: (string | undefined)[]): ActionResult | null {
  return values.some((value) => value === undefined)
    ? { kind: "error", code: "not_found" }
    : null;
}
