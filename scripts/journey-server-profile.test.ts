import test from "node:test";
import assert from "node:assert/strict";

import {
  defaultServers,
  completionServers,
  journeyServers,
  liveBookingServers,
  a11yServers,
  platformAdminServers,
  platformAdminFaultServers,
  duplicatePorts,
  assertUniquePorts,
} from "./journey-server-profile.ts";

const profiles = [
  ["defaultServers", defaultServers],
  ["completionServers", completionServers],
  ["journeyServers", journeyServers],
  ["liveBookingServers", liveBookingServers],
  ["a11yServers", a11yServers],
  ["platformAdminServers", platformAdminServers],
  ["platformAdminFaultServers", platformAdminFaultServers],
] as const;

for (const [name, servers] of profiles) {
  test(`${name} declares unique ports`, () => {
    assert.deepEqual(duplicatePorts(servers), []);
    assert.doesNotThrow(() => assertUniquePorts(servers));
  });
}

test("journey servers include the public platform-admin smoke port once", () => {
  assert.equal(journeyServers.filter((server) => server.port === 41732).length, 1);
  assert.equal(a11yServers.filter((server) => server.port === 41732).length, 1);
});

test("a11y profile composes journey and isolated admin without duplicating 41732", () => {
  assert.equal(a11yServers.filter((server) => server.port === 41742).length, 1);
  assert.deepEqual(duplicatePorts(a11yServers), []);
});

test("platform-admin fault profile adds only the fault port", () => {
  assert.ok(platformAdminFaultServers.some((server) => server.port === 41743));
  assert.equal(platformAdminFaultServers.length, platformAdminServers.length + 1);
});

test("duplicatePorts detects a duplicate", () => {
  assert.deepEqual(
    duplicatePorts([
      { label: "a", command: "x", port: 1, reuseExistingServer: false },
      { label: "b", command: "y", port: 1, reuseExistingServer: false },
    ]),
    [1],
  );
});

test("assertUniquePorts throws on duplicates", () => {
  assert.throws(
    () =>
      assertUniquePorts([
        { label: "a", command: "x", port: 1, reuseExistingServer: false },
        { label: "b", command: "y", port: 1, reuseExistingServer: false },
      ]),
    /Duplicate Playwright server ports/u,
  );
});
