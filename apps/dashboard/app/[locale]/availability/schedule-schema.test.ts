import { describe, it, expect } from "vitest";
import {
  UNAMBIGUOUS_FOLD,
  civilInstant,
  minuteInput,
  scheduleRemovalSchema,
  scheduleRuleSchema,
  type ScheduleRuleInput,
} from "./schedule-schema";

const scopeId = "10000000-0000-4000-8000-000000000001";
const requestId = "10000000-0000-4000-8000-000000000002";

function rule(overrides: Partial<ScheduleRuleInput>): ScheduleRuleInput {
  return {
    locale: "en",
    operation: "weekly",
    requestId,
    id: "",
    scopeId,
    locationId: "",
    staffId: "",
    resourceId: "",
    serviceId: "",
    expectedRevision: "2",
    scopeKind: "location",
    timeZone: "Asia/Riyadh",
    dayOfWeek: "1",
    localDate: "",
    exceptionKind: "closed",
    fold: UNAMBIGUOUS_FOLD,
    startTime: "09:00",
    endTime: "17:00",
    endOfDay: false,
    startsAt: "",
    startFold: UNAMBIGUOUS_FOLD,
    endsAt: "",
    endFold: UNAMBIGUOUS_FOLD,
    reason: "",
    policyKey: "minimum_notice_minutes",
    value: "",
    ...overrides,
  };
}

function issues(values: ScheduleRuleInput) {
  const parsed = scheduleRuleSchema.safeParse(values);
  return parsed.success
    ? []
    : parsed.error.issues.map((issue) => `${issue.path.join(".")}:${issue.message}`);
}

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
    expect(scheduleRuleSchema.parse(rule({})).expectedRevision).toBe(2);
  });
});

describe("schedule rule schema", () => {
  const timed = (overrides: Partial<ScheduleRuleInput>) =>
    rule({
      operation: "blackout",
      scopeId: "",
      expectedRevision: "",
      timeZone: "America/New_York",
      ...overrides,
    });
  it("reports a DST gap and an unresolved repeated time on the field to fix", () => {
    expect(
      issues(timed({ startsAt: "2026-03-08T02:30", endsAt: "2026-03-08T04:00" })),
    ).toEqual(["startsAt:gap"]);
    expect(
      issues(timed({ startsAt: "2026-11-01T01:30", endsAt: "2026-11-01T03:00" })),
    ).toEqual(["startsAt:foldError"]);
    expect(
      scheduleRuleSchema.parse(
        timed({
          startsAt: "2026-11-01T01:30",
          startFold: "1",
          endsAt: "2026-11-01T03:00",
        }),
      ).payload.starts_at,
    ).toBe("2026-11-01T06:30:00.000Z");
  });
  it("refuses an end before the start and an unknown timezone", () => {
    expect(
      issues(timed({ startsAt: "2026-12-21T10:00", endsAt: "2026-12-21T09:00" })),
    ).toEqual(["endsAt:end_before_start"]);
    expect(issues(rule({ endTime: "08:00" }))).toEqual(["endTime:end_before_start"]);
    expect(issues(rule({ timeZone: "Mars/Olympus" }))).toEqual([
      "timeZone:invalid_time_zone",
    ]);
  });
  it("needs a scope revision for recurring rules and a revision for edits", () => {
    expect(issues(rule({ scopeId: "" }))).toEqual(["scopeId:required"]);
    expect(issues(rule({ expectedRevision: "" }))).toEqual(["scopeId:invalid"]);
    expect(
      issues(
        rule({ operation: "policy", id: scopeId, expectedRevision: "", scopeId: "" }),
      ),
    ).toEqual(["expectedRevision:invalid"]);
  });
  it("keeps end-of-day as minute 1440 and checks override hours in the zone", () => {
    expect(scheduleRuleSchema.parse(rule({ endOfDay: true })).payload.end_minute).toBe(
      1440,
    );
    expect(
      issues(
        rule({
          operation: "exception",
          exceptionKind: "override",
          localDate: "2026-03-08",
          timeZone: "America/New_York",
          startTime: "02:30",
          endTime: "05:00",
        }),
      ),
    ).toEqual(["startTime:gap"]);
  });
  it("bounds policy values and allows an inherited daily limit", () => {
    const policy = (policyKey: string, value: string) =>
      rule({
        operation: "policy",
        scopeId: "",
        expectedRevision: "",
        policyKey,
        value,
      });
    expect(issues(policy("slot_interval_minutes", "7"))).toEqual(["value:invalid"]);
    expect(issues(policy("horizon_days", "366"))).toEqual(["value:invalid"]);
    expect(issues(policy("minimum_notice_minutes", ""))).toEqual(["value:invalid"]);
    expect(
      scheduleRuleSchema.parse(policy("daily_limit_per_staff", "")).payload.value,
    ).toBeNull();
  });
  it("requires a holiday name within bounds", () => {
    const holiday = (reason: string) =>
      rule({ operation: "holiday", scopeId: "", expectedRevision: "", reason });
    expect(issues(holiday(" "))).toEqual(["reason:required"]);
    expect(issues(holiday("x".repeat(161)))).toEqual(["reason:too_long"]);
  });
});

describe("schedule rule removal", () => {
  it("requires the dialog confirmation and safe revisions", () => {
    const removal = {
      locale: "en",
      requestId,
      operation: "weekly",
      id: scopeId,
      expectedRevision: "3",
      expectedScopeRevision: "",
    } as const;
    expect(scheduleRemovalSchema.safeParse(removal).success).toBe(false);
    expect(scheduleRemovalSchema.parse({ ...removal, confirm: "yes" })).toMatchObject({
      expectedRevision: 3,
      expectedScopeRevision: null,
    });
    expect(
      scheduleRemovalSchema.safeParse({
        ...removal,
        confirm: "yes",
        expectedRevision: "0",
      }).success,
    ).toBe(false);
  });
});
