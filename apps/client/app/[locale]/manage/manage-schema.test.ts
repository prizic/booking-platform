import { describe, expect, it } from "vitest";

import { proposalResponseSchema } from "../proposal/proposal-schema";
import {
  manageActionSchema,
  manageTokenSchema,
  manageViewSchema,
  rescheduleFormSchema,
  rescheduleStartAt,
  verifyStepUpSchema,
} from "./manage-schema";

const token = "d".repeat(64);

describe("manage link schemas", () => {
  it("accepts only a 64-hex link token", () => {
    expect(manageTokenSchema.safeParse({ token }).success).toBe(true);
    expect(manageTokenSchema.safeParse({ token: "D".repeat(64) }).success).toBe(false);
    expect(manageTokenSchema.safeParse({ token: "d".repeat(63) }).success).toBe(false);
  });

  it("reads an unknown intent as a plain view", () => {
    expect(manageViewSchema.parse({ intent: "delete-everything", token }).intent).toBe(
      "view",
    );
    expect(manageViewSchema.parse({ intent: "cancel", token }).intent).toBe("cancel");
  });

  it("verifies only a six-digit code", () => {
    expect(
      verifyStepUpSchema.parse({ action: "verify-step-up", code: " 123456 ", token })
        .code,
    ).toBe("123456");
    for (const code of ["12345", "1234567", "abcdef"]) {
      expect(
        verifyStepUpSchema.safeParse({ action: "verify-step-up", code, token }).error
          ?.issues[0]?.message,
      ).toBe("manage_code_format");
    }
  });

  it("needs a time to move and refuses one on a cancellation", () => {
    expect(
      manageActionSchema.safeParse({
        action: "reschedule",
        expectedRevision: 1,
        newStartAt: null,
        token,
      }).success,
    ).toBe(false);
    expect(
      manageActionSchema.safeParse({
        action: "cancel",
        expectedRevision: 1,
        newStartAt: "2035-09-24T13:00:00.000Z",
        token,
      }).success,
    ).toBe(false);
    expect(
      manageActionSchema.parse({ action: "cancel", expectedRevision: "2", token }),
    ).toEqual({ action: "cancel", expectedRevision: 2, newStartAt: null, token });
  });

  it.each([0, -1, 1.5, "x", null])(
    "refuses expected revision %s",
    (expectedRevision) => {
      expect(
        manageActionSchema.safeParse({
          action: "cancel",
          expectedRevision,
          newStartAt: null,
          token,
        }).success,
      ).toBe(false);
    },
  );
});

describe("reschedule form", () => {
  it("resolves the wall time in the customer's own timezone", () => {
    expect(
      rescheduleStartAt(
        rescheduleFormSchema.parse({
          customerTimeZone: "Asia/Riyadh",
          date: "2026-01-16",
          time: "02:30",
        }),
      ),
    ).toBe("2026-01-15T23:30:00.000Z");
  });

  it("refuses a time a spring-forward change skips", () => {
    const parsed = rescheduleFormSchema.safeParse({
      customerTimeZone: "America/New_York",
      date: "2026-03-08",
      time: "02:30",
    });
    expect(parsed.error?.issues).toEqual([
      expect.objectContaining({ message: "manage_time_unavailable", path: ["time"] }),
    ]);
  });

  it("refuses a time a fall-back change repeats instead of guessing", () => {
    const parsed = rescheduleFormSchema.safeParse({
      customerTimeZone: "America/New_York",
      date: "2026-11-01",
      time: "01:30",
    });
    expect(parsed.error?.issues[0]?.message).toBe("manage_time_unavailable");
  });

  it("asks for both halves before resolving anything", () => {
    const parsed = rescheduleFormSchema.safeParse({
      customerTimeZone: "Asia/Riyadh",
      date: "",
      time: "10:00",
    });
    expect(parsed.error?.issues.map((issue) => issue.path.join("."))).toEqual(["date"]);
  });
});

describe("proposal response schema", () => {
  it("forwards only a well formed token and one of two answers", () => {
    const actionToken = "b".repeat(64);
    expect(
      proposalResponseSchema.safeParse({ action: "accept", actionToken }).success,
    ).toBe(true);
    expect(
      proposalResponseSchema.safeParse({ action: "decline", actionToken }).success,
    ).toBe(true);
    expect(
      proposalResponseSchema.safeParse({ action: "counter", actionToken }).success,
    ).toBe(false);
    expect(
      proposalResponseSchema.safeParse({ action: "accept", actionToken: "b" }).success,
    ).toBe(false);
  });
});
