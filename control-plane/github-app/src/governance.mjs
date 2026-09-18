import { createHash } from "node:crypto";

const rulesetName = "wlbp-instance-governance";

function safeBranch(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 100 &&
    !value.includes("..") &&
    /^[A-Za-z0-9._/-]+$/u.test(value)
  );
}

function requiredChecks(value) {
  if (!Array.isArray(value) || value.length === 0) return null;
  const checks = [...new Set(value)];
  if (
    checks.some(
      (check) =>
        typeof check !== "string" ||
        check.length === 0 ||
        check.length > 200 ||
        check.includes("\r") ||
        check.includes("\n") ||
        check.includes("\0"),
    )
  ) {
    return null;
  }
  return checks.sort((left, right) => left.localeCompare(right));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize).sort();
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  return value;
}

export function governanceFingerprint(state) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(state)))
    .digest("hex");
}

export function buildGovernancePolicy({ defaultBranch, requiredChecks: checks }) {
  const normalizedChecks = requiredChecks(checks);
  if (!safeBranch(defaultBranch) || !normalizedChecks) return null;
  return {
    desired: {
      defaultBranch,
      dependencyProtection: true,
      private: true,
      requireCodeOwnerReview: true,
      requiredChecks: normalizedChecks,
      secretScanning: true,
    },
    ruleset: {
      conditions: { ref_name: { exclude: [], include: ["~DEFAULT_BRANCH"] } },
      enforcement: "active",
      name: rulesetName,
      rules: [
        { type: "deletion" },
        { type: "non_fast_forward" },
        {
          parameters: {
            dismiss_stale_reviews_on_push: true,
            require_code_owner_review: true,
            require_last_push_approval: true,
            required_approving_review_count: 1,
            required_review_thread_resolution: true,
          },
          type: "pull_request",
        },
        {
          parameters: {
            do_not_enforce_on_create: false,
            required_status_checks: normalizedChecks.map((context) => ({ context })),
            strict_required_status_checks_policy: true,
          },
          type: "required_status_checks",
        },
      ],
      target: "branch",
    },
  };
}

export function reconcileGovernance({ desired, actual }) {
  const desiredFingerprint = governanceFingerprint(desired);
  const actualFingerprint = governanceFingerprint(actual);
  return desiredFingerprint === actualFingerprint
    ? { kind: "healthy", desiredFingerprint, actualFingerprint }
    : {
        kind: "drift",
        code: "github_ruleset_drift",
        desiredFingerprint,
        actualFingerprint,
      };
}
