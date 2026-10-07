import assert from "node:assert/strict";
import { test } from "node:test";
import { totp } from "./totp.mjs";

const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

test("matches the RFC 6238 SHA-1 vectors (last six digits)", () => {
  assert.equal(totp(secret, 59), "287082");
  assert.equal(totp(secret, 1111111109), "081804");
  assert.equal(totp(secret, 2000000000), "279037");
});

test("tolerates lowercase, spaces and padding", () => {
  assert.equal(totp("gezd gnbv gy3t qojq gezd gnbv gy3t qojq==", 59), "287082");
});

test("matches the remaining RFC 6238 SHA-1 vectors", () => {
  assert.equal(totp(secret, 1111111111), "050471");
  assert.equal(totp(secret, 1234567890), "005924");
  assert.equal(totp(secret, 20000000000), "353130");
});

test("refuses empty or malformed secrets and invalid timestamps", () => {
  assert.throws(() => totp(""), /invalid base32/u);
  assert.throws(() => totp("INVALID!"), /invalid base32/u);
  for (const time of [-1, NaN, Infinity])
    assert.throws(() => totp(secret, time), /invalid timestamp/u);
});
