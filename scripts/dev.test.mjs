import assert from "node:assert/strict";
import { createServer } from "node:net";
import { test } from "node:test";

import { isPortAvailable, selectDevPorts } from "./dev.mjs";

test("keeps default ports when they are available", async () => {
  assert.deepEqual(
    await selectDevPorts([3000, 3001, 3002], async () => true),
    [3000, 3001, 3002],
  );
});

test("skips occupied ports and preserves other apps' preferred ports", async () => {
  const occupied = new Set([3000, 3003]);
  assert.deepEqual(
    await selectDevPorts([3000, 3001, 3002], async (port) => !occupied.has(port)),
    [3004, 3001, 3002],
  );
});

test("assigns distinct ports when all defaults are occupied", async () => {
  assert.deepEqual(
    await selectDevPorts([3000, 3001, 3002], async (port) => port > 3002),
    [3003, 3004, 3005],
  );
});

test("detects an occupied TCP port and releases its availability probe", async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;
  assert.equal(await isPortAvailable(port), false);
  await new Promise((resolve) => server.close(resolve));
  assert.equal(await isPortAvailable(port), true);
  assert.equal(await isPortAvailable(port), true);
});

test("propagates unexpected probe failures", async () => {
  await assert.rejects(
    selectDevPorts([3000], async () => {
      throw new Error("probe failed");
    }),
    /probe failed/u,
  );
});

test("fails when no usable port remains", async () => {
  await assert.rejects(
    selectDevPorts([65535], async () => false),
    /available/u,
  );
});
