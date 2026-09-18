import { createHash } from "node:crypto";

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize).sort();
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonicalize(child)]));
  return value;
}

export function governanceFingerprint(state) {
  return createHash("sha256").update(JSON.stringify(canonicalize(state))).digest("hex");
}

export function reconcileGovernance({ desired, actual }) {
  const desiredFingerprint = governanceFingerprint(desired);
  const actualFingerprint = governanceFingerprint(actual);
  return desiredFingerprint === actualFingerprint
    ? { kind: "healthy", desiredFingerprint, actualFingerprint }
    : { kind: "drift", code: "github_ruleset_drift", desiredFingerprint, actualFingerprint };
}
