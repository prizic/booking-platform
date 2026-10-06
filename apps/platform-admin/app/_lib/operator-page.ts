import "server-only";

import type { Locale } from "@wlbp/i18n";
import { redirect } from "next/navigation";
import { cache } from "react";
import { callOperator } from "./operator-api";
import { loadOperatorSession } from "./platform-admin-server";

export type OperatorRole = "viewer" | "operator" | "admin" | "break_glass";
export type OperatorContext = {
  operatorId: string;
  email: string;
  role: OperatorRole;
  expiresAt: string | null;
  stepUpSeconds: number;
};
export type OperatorAccess =
  | { kind: "ready"; operator: OperatorContext }
  | { kind: "denied" }
  | { kind: "unavailable" }
  | { kind: "configuration-missing" };

const rank: Record<OperatorRole, number> = {
  viewer: 0,
  operator: 1,
  admin: 2,
  break_glass: 3,
};

export function atLeast(
  role: OperatorRole,
  minimum: "viewer" | "operator" | "admin",
): boolean {
  return rank[role] >= rank[minimum];
}

/**
 * One decision per request: the layout and every page share it through
 * React's cache. Signed-out and MFA states redirect; everything else is data.
 */
export const loadOperatorAccess = cache(
  async (locale: Locale): Promise<OperatorAccess> => {
    const { state } = await loadOperatorSession();
    if (state.kind === "configuration-missing")
      return { kind: "configuration-missing" };
    if (state.kind === "signed-out") redirect(`/${locale}/login`);
    if (state.kind === "mfa-enrollment-required") redirect(`/${locale}/mfa-enroll`);
    if (state.kind === "step-up-required") redirect(`/${locale}/login?step=mfa`);

    const result = await callOperator("get_operator_context_v1");
    if (!result.ok)
      return { kind: result.code === "policy_denied" ? "denied" : "unavailable" };
    const row = result.data[0];
    if (!row) return { kind: "denied" };
    return {
      kind: "ready",
      operator: {
        operatorId: row.operator_id,
        email: row.email,
        role: row.role as OperatorRole,
        expiresAt: row.expires_at,
        stepUpSeconds: row.step_up_seconds,
      },
    };
  },
);

/** For pages: the layout already rendered any non-ready state. */
export async function getOperator(locale: Locale): Promise<OperatorContext | null> {
  const access = await loadOperatorAccess(locale);
  return access.kind === "ready" ? access.operator : null;
}
