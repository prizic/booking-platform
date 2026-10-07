import { describe, expect, it } from "vitest";
import { auditFilters } from "./audit-filters";
describe("audit filters", () => {
  it("normalizes malformed URL filters without revealing source fields", () =>
    expect(
      auditFilters({
        from: "2026-02-30",
        actor: "email@example.invalid",
        stream: "payload",
        cursor: '{"token":"secret"}',
      }),
    ).toEqual({ from: null, to: null, actor: null, stream: null, cursor: null }));
  it("uses exclusive end dates and preserves a valid stable cursor", () => {
    const cursor = {
      time: "2026-10-05T12:00:00Z",
      stream: "booking",
      id: "a0000000-0000-4000-8000-000000000001",
    };
    expect(
      auditFilters({
        from: "2026-10-05",
        to: "2026-10-05",
        cursor: JSON.stringify(cursor),
      }),
    ).toMatchObject({
      from: "2026-10-05T00:00:00Z",
      to: "2026-10-06T00:00:00Z",
      cursor,
    });
  });
});
