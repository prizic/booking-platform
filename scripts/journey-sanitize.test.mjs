import test from "node:test";
import assert from "node:assert/strict";
import { sanitize, safeUrl, safeFailure } from "./journey-sanitize.mjs";
test("URLs drop credentials queries fragments and identifying path segments", () => {
  const result = safeUrl(
    "https://local.invalid/en/customers/journey-customer%40example.invalid?token=hidden#session-hidden",
  );
  assert.equal(result, "https://local.invalid/en/customers/[record]");
  assert.doesNotMatch(
    safeUrl("postgresql://user:password@127.0.0.1:55322/postgres"),
    /user|password/u,
  );
});
test("failure capture drops DOM/code frames and quoted payloads", () => {
  const result = safeFailure(
    {
      message:
        'Error: locator("journey-customer@example.invalid") failed\nReceived: private DOM body',
      stack:
        "Error\n    at synthetic (tests/e2e/client-journey.spec.ts:20:3)\nprivate code frame",
    },
    "R5 delivery",
    "http://localhost:41730/en/manage?token=hidden#otp",
  );
  assert.deepEqual(Object.keys(result), ["title", "error", "firstStackFrame", "url"]);
  assert.doesNotMatch(
    JSON.stringify(result),
    /journey-customer|private DOM|token=|#otp|code frame/u,
  );
});
test("redacts addresses JWTs opaque credentials phone numbers and OTPs", () => {
  const output = sanitize(
    'email=synthetic@example.invalid\nphone=+15555550136\ncode=123456\neyJhbGciOiJsynthetic.payload.signature\n"private intake answer"',
  );
  assert.doesNotMatch(
    output,
    /synthetic@example|15555550136|123456|eyJhbGci|private intake/u,
  );
});
test("reporter payload sanitizes token queries in every failure field", () => {
  const privateValue = "synthetic-private-short";
  const result = safeFailure(
    {
      message: `Error: request https://user:password@localhost:41730/en/manage?grant=${privateValue}#session failed`,
      stack: `Error\n    at request (/en/manage?grant=${privateValue}#fragment)\n    at hidden (private frame)`,
    },
    `R5 request /en/manage?grant=${privateValue}#fragment`,
    `http://user:password@localhost:41730/en/manage?token=${privateValue}#otp`,
  );
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(
    serialized,
    /synthetic-private|user:password|grant=|token=|#fragment|#otp|private frame/u,
  );
  assert.equal(result.url, "http://localhost:41730/en/manage");
  assert.deepEqual(JSON.parse(serialized), result);
});
