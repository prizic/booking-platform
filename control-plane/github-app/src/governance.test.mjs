import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGovernancePolicy,
  governanceFingerprint,
  reconcileGovernance,
} from "./governance.mjs";

const desired = {
  defaultBranch: "main",
  private: true,
  requiredChecks: ["Source monorepo CI"],
  requireCodeOwnerReview: true,
  secretScanning: true,
  dependencyProtection: true,
  reusableWorkflowSha: "0123456789abcdef0123456789abcdef01234567",
};

test("a canonical desired governance fingerprint does not depend on object key order", () => {
  assert.equal(
    governanceFingerprint(desired),
    governanceFingerprint({
      dependencyProtection: true,
      defaultBranch: "main",
      private: true,
      reusableWorkflowSha: desired.reusableWorkflowSha,
      requiredChecks: ["Source monorepo CI"],
      requireCodeOwnerReview: true,
      secretScanning: true,
    }),
  );
});

test("reports a changed required-check ruleset as drift without weakening it", () => {
  const result = reconcileGovernance({
    desired,
    actual: { ...desired, requiredChecks: ["lint"] },
  });
  assert.deepEqual(result, {
    kind: "drift",
    code: "github_ruleset_drift",
    desiredFingerprint: governanceFingerprint(desired),
    actualFingerprint: governanceFingerprint({ ...desired, requiredChecks: ["lint"] }),
  });
});

test("builds a pinned, code-owner-reviewed branch policy from explicit checks", () => {
  assert.deepEqual(
    buildGovernancePolicy({
      defaultBranch: "main",
      requiredChecks: ["Instance CI", "boundary-check"],
    }),
    {
      desired: {
        defaultBranch: "main",
        dependencyProtection: true,
        private: true,
        requireCodeOwnerReview: true,
        requiredChecks: ["boundary-check", "Instance CI"],
        secretScanning: true,
      },
      ruleset: {
        conditions: {
          ref_name: { exclude: [], include: ["~DEFAULT_BRANCH"] },
        },
        enforcement: "active",
        name: "wlbp-instance-governance",
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
              required_status_checks: [
                { context: "boundary-check" },
                { context: "Instance CI" },
              ],
              strict_required_status_checks_policy: true,
            },
            type: "required_status_checks",
          },
        ],
        target: "branch",
      },
    },
  );
});

test("rejects a governance policy with no actual required check", () => {
  assert.equal(
    buildGovernancePolicy({ defaultBranch: "main", requiredChecks: [] }),
    null,
  );
});
