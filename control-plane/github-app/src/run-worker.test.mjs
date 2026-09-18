import assert from "node:assert/strict";
import test from "node:test";

import { drain } from "./run-worker.mjs";

test("drain stops at the first idle rather than spinning the schedule", async () => {
  const kinds = ["completed", "completed", "idle", "completed"];
  let index = 0;
  const outcomes = await drain({ runOnce: async () => ({ kind: kinds[index++] }) });
  assert.deepEqual(
    outcomes.map((outcome) => outcome.kind),
    ["completed", "completed", "idle"],
  );
});

test("drain never exceeds its limit when steps keep arriving", async () => {
  let calls = 0;
  const outcomes = await drain(
    {
      runOnce: async () => {
        calls += 1;
        return { kind: "completed" };
      },
    },
    { limit: 3 },
  );
  assert.equal(calls, 3);
  assert.equal(outcomes.length, 3);
});
