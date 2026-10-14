#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
const [beforePath, afterPath, outputPath] = process.argv.slice(2);
if (!beforePath || !afterPath || !outputPath)
  throw new Error(
    "Usage: compare-navigation.mjs <before.json> <after.json> <output.json>",
  );
const before = JSON.parse(await readFile(beforePath, "utf8")),
  after = JSON.parse(await readFile(afterPath, "utf8"));
if (
  before.label !== "before" ||
  after.label !== "after" ||
  before.application !== after.application
)
  throw new Error("Mismatched baseline labels/applications");
const comparableKeys = [
  "node",
  "os",
  "architecture",
  "osRelease",
  "buildMode",
  "databaseProfile",
  "fixtureDigest",
  "browser",
  "locale",
  "viewport",
];
const mismatches = comparableKeys.filter(
  (key) =>
    JSON.stringify(before.environment[key]) !== JSON.stringify(after.environment[key]),
);
if (JSON.stringify(before.cacheStates) !== JSON.stringify(after.cacheStates))
  mismatches.push("cacheStates");
if (mismatches.length) throw new Error(`Not comparable: ${mismatches.join(", ")}`);
const medianBudget = Number(process.env.WLBP_NAV_MEDIAN_BUDGET_MS ?? "1500");
const p95Budget = Number(process.env.WLBP_NAV_P95_BUDGET_MS ?? "3000");
const results = after.summary.map((row) => {
  const baseline = before.summary.find(
    (old) => old.route === row.route && old.mode === row.mode,
  );
  if (!baseline || row.count < 5 || baseline.count !== row.count)
    throw new Error("Each matched route/mode needs identical repetition counts >=5");
  const budgetsPass = row.medianMs <= medianBudget && row.p95Ms <= p95Budget;
  const noRegression =
    row.medianMs <= baseline.medianMs * 1.1 && row.p95Ms <= baseline.p95Ms * 1.1;
  const clientNavigation = row.mode !== "warm" || row.documentReloads === 0;
  return {
    route: row.route,
    mode: row.mode,
    before: { medianMs: baseline.medianMs, p95Ms: baseline.p95Ms },
    after: { medianMs: row.medianMs, p95Ms: row.p95Ms },
    medianChangePercent: (row.medianMs / baseline.medianMs - 1) * 100,
    p95ChangePercent: (row.p95Ms / baseline.p95Ms - 1) * 100,
    budgetsPass,
    noRegression,
    clientNavigation,
    decision:
      budgetsPass && noRegression && clientNavigation ? "accept" : "investigate",
  };
});
await writeFile(
  outputPath,
  JSON.stringify(
    {
      schemaVersion: 1,
      application: after.application,
      comparable: true,
      budgets: { medianMs: medianBudget, p95Ms: p95Budget, maxRegressionPercent: 10 },
      results,
      evidence: "measured inputs only; no inferred baseline",
    },
    null,
    2,
  ) + "\n",
  { mode: 0o600 },
);
console.log(
  "Comparison saved. Review every investigate decision before accepting navigation.",
);
if (results.some((row) => row.decision !== "accept")) process.exitCode = 1;
