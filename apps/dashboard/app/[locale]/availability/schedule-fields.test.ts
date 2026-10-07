import { describe, it, expect } from "vitest";
import { civilInstant, minuteInput, schedulePayload } from "./schedule-fields";
describe("civil schedule fields", () => {
  it("rejects DST gaps and requires a repeated-time occurrence", () => {
    expect(() =>
      civilInstant("2026-03-08T02:30", "America/New_York", "", "startsAt"),
    ).toThrow("gap");
    expect(() =>
      civilInstant("2026-11-01T01:30", "America/New_York", "", "startsAt"),
    ).toThrow("fold");
    expect(civilInstant("2026-11-01T01:30", "America/New_York", "1", "startsAt")).toBe(
      "2026-11-01T06:30:00.000Z",
    );
  });
  it("treats the editor's unambiguous-time sentinel like the former empty choice", () => {
    expect(() =>
      civilInstant("2026-11-01T01:30", "America/New_York", "auto", "startsAt"),
    ).toThrow("fold");
    expect(
      civilInstant("2026-11-01T12:30", "America/New_York", "auto", "startsAt"),
    ).toBe(civilInstant("2026-11-01T12:30", "America/New_York", "", "startsAt"));
  });
  it("keeps exclusive midnight explicit", () => {
    expect(minuteInput("24:00", true)).toBe(1440);
    expect(() => minuteInput("24:00")).toThrow();
  });
  it("uses the rendered revision rather than substituting a newer revision", () => {
    const form = new FormData();
    for (const [key, value] of Object.entries({
      operation: "weekly",
      scopeId: "10000000-0000-4000-8000-000000000001",
      requestId: "10000000-0000-4000-8000-000000000002",
      expectedRevision: "2",
      timeZone: "Asia/Riyadh",
      dayOfWeek: "1",
      startTime: "09:00",
      endTime: "17:00",
    }))
      form.set(key, value);
    expect(schedulePayload(form).expectedRevision).toBe(2);
  });
});
