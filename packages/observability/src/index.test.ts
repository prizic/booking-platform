import { describe, expect, it } from "vitest";

import { createCorrelationContext, redact } from "./index.js";

describe("log safety", () => {
  it("redacts credentials and customer-contact fields recursively", () => {
    expect(
      redact({
        authorization: "credential",
        nested: { email: "person@example.invalid", status: "confirmed" },
      }),
    ).toEqual({
      authorization: "[REDACTED]",
      nested: { email: "[REDACTED]", status: "confirmed" },
    });
  });

  it("creates correlation identifiers without accepting arbitrary PII", () => {
    expect(
      createCorrelationContext(
        { tenantId: "tenant-1", bookingId: "booking-1" },
        () => "request-1",
      ),
    ).toEqual({ requestId: "request-1", tenantId: "tenant-1", bookingId: "booking-1" });
  });
});
