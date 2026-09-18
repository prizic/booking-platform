import assert from "node:assert/strict";
import test from "node:test";

import { governanceFingerprint, reconcileGovernance } from "./governance.mjs";

const desired = { defaultBranch: "main", private: true, requiredChecks: ["Source monorepo CI"], requireCodeOwnerReview: true, secretScanning: true, dependencyProtection: true, reusableWorkflowSha: "0123456789abcdef0123456789abcdef01234567" };

test("a canonical desired governance fingerprint does not depend on object key order", () => {
  assert.equal(governanceFingerprint(desired), governanceFingerprint({ dependencyProtection: true, defaultBranch: "main", private: true, reusableWorkflowSha: desired.reusableWorkflowSha, requiredChecks: ["Source monorepo CI"], requireCodeOwnerReview: true, secretScanning: true }));
});

test("reports a changed required-check ruleset as drift without weakening it", () => {
  const result = reconcileGovernance({ desired, actual: { ...desired, requiredChecks: ["lint"] } });
  assert.deepEqual(result, { kind: "drift", code: "github_ruleset_drift", desiredFingerprint: governanceFingerprint(desired), actualFingerprint: governanceFingerprint({ ...desired, requiredChecks: ["lint"] }) });
});
