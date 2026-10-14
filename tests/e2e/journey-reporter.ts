import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";
import type {
  FullConfig,
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";
// @ts-expect-error -- shared ESM sanitizer used by the shell runner too.
import { safeFailure, sanitize } from "../../scripts/journey-sanitize.mjs";

export default class JourneyReporter implements Reporter {
  private started = performance.now();
  private startedAt = new Date().toISOString();
  private cases = new Map<string, { status: string; durationMs: number }>();
  private failures: object[] = [];
  onBegin(_config: FullConfig) {
    this.started = performance.now();
    this.startedAt = new Date().toISOString();
  }
  onTestEnd(test: TestCase, result: TestResult) {
    this.cases.set(test.id, { status: result.status, durationMs: result.duration });
    const url = result.annotations.findLast(
      (annotation) => annotation.type === "journey-url",
    )?.description;
    for (const error of result.errors)
      this.failures.push({
        ...safeFailure(error, test.titlePath().join(" > "), url),
        retry: result.retry,
      });
  }
  onError(error: Parameters<NonNullable<Reporter["onError"]>>[0]) {
    this.failures.push(safeFailure(error, "Runner infrastructure", undefined));
  }
  async onEnd(result: FullResult) {
    const output = process.env.WLBP_JOURNEY_REPORT;
    if (!output) throw new Error("WLBP_JOURNEY_REPORT is required");
    const counts = { passed: 0, failed: 0, skipped: 0, interrupted: 0 };
    for (const item of this.cases.values()) {
      if (item.status === "passed") counts.passed++;
      else if (item.status === "skipped") counts.skipped++;
      else if (item.status === "interrupted") counts.interrupted++;
      else counts.failed++;
    }
    mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
    writeFileSync(
      output,
      JSON.stringify(
        {
          schemaVersion: 1,
          startedAt: this.startedAt,
          wallClockMs: performance.now() - this.started,
          status: result.status,
          counts,
          failures: this.failures,
          classificationLabels: [
            "product_bug",
            "test_bug_selector",
            "flaky_timing",
            "environment",
          ],
          classificationInstruction:
            "One Laya batch per run; inspect product_bug first and confidence <0.7 directly. Advisory only.",
        },
        null,
        2,
      ) + "\n",
      { mode: 0o600 },
    );
    process.stdout.write(
      `${sanitize(result.status)}: ${counts.passed} passed, ${counts.failed} failed, ${counts.skipped} skipped. Sanitized report saved.\n`,
    );
  }
  // Discard raw stdio; app/fixture output can contain request credentials.
  onStdOut() {}
  onStdErr() {}
  printsToStdio() {
    return true;
  }
}
