/** Every stable code the operator RPCs raise, plus the two the app adds. */
export const operatorErrorCodes = [
  "policy_denied",
  "recent_authentication_required",
  "not_found",
  "stale_revision",
  "reason_required",
  "name_invalid",
  "tenant_name_invalid",
  "brand_key_invalid",
  "confirmation_mismatch",
  "suspend_before_closure",
  "transition_not_allowed",
  "job_running",
  "attempts_exhausted",
  "plan_exists",
  "plan_invalid",
  "plan_unknown",
  "entitlement_invalid",
  "ends_at_required",
  "expiry_invalid",
  "release_exists",
  "release_invalid",
  "no_targets",
  "rollback_not_supported",
  "account_not_found",
  "operator_exists",
  "last_admin_protected",
  "self_grant_denied",
  "second_operator_required",
  "self_approval_denied",
  "hostname_invalid",
  "domain_taken",
  "flag_invalid",
  "reference_invalid",
  "idempotency_conflict",
  "idempotency_key_invalid",
  "secret_rejected",
  "settings_invalid",
  "configuration_missing",
  "unavailable",
] as const;

export type OperatorErrorCode = (typeof operatorErrorCodes)[number];

const known = new Set<string>(operatorErrorCodes);

export function operatorErrorCode(error: {
  message?: string | null;
  code?: string | null;
}): OperatorErrorCode {
  const message = error.message?.trim() ?? "";
  if (known.has(message)) return message as OperatorErrorCode;
  // Anything else is a driver or network message; it may quote hosts or SQL,
  // so it is never shown. Permission failures still read as permission failures.
  if (error.code === "42501" || error.code === "PGRST301" || error.code === "PGRST302")
    return "policy_denied";
  return "unavailable";
}
