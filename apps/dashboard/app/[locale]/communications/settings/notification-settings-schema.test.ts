import { describe, expect, it } from "vitest";

import {
  emailPreviewSchema,
  notificationSettingsSchema,
  parseCustomLeadTime,
  testNotificationSchema,
} from "./notification-settings-schema";

const requestId = "0a3f2b64-0000-4000-8000-000000000001";
const valid = {
  locale: "ar",
  expectedRevision: 0,
  requestId,
  items: [
    { templateKey: "booking.reminder", emailEnabled: true, whatsappEnabled: false },
  ],
  reminderOffsets: [1440, 120],
};
const codes = (input: unknown) => {
  const parsed = notificationSettingsSchema.safeParse(input);
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
};

describe("notification settings schema", () => {
  it("accepts the stored defaults", () => {
    expect(notificationSettingsSchema.parse(valid).locale).toBe("ar");
  });

  it("refuses reminder lead times the database would refuse", () => {
    expect(codes({ ...valid, reminderOffsets: [] })).toEqual([
      "reminder_offsets_required",
    ]);
    expect(codes({ ...valid, reminderOffsets: [15, 60, 120, 1440, 2880] })).toEqual([
      "reminder_offsets_too_many",
    ]);
    expect(codes({ ...valid, reminderOffsets: [120, 120] })).toEqual([
      "reminder_offset_duplicate",
    ]);
    expect(codes({ ...valid, reminderOffsets: [14] })).toEqual([
      "reminder_offset_range",
    ]);
    expect(codes({ ...valid, reminderOffsets: [10081] })).toEqual([
      "reminder_offset_range",
    ]);
    expect(codes({ ...valid, reminderOffsets: [90.5] })).toEqual([
      "reminder_offset_range",
    ]);
    expect(codes({ ...valid, reminderOffsets: [15, 10080] })).toEqual([]);
  });

  it("refuses unknown message types, a bad request id and a negative revision", () => {
    expect(
      codes({
        ...valid,
        items: [
          {
            templateKey: "marketing.blast",
            emailEnabled: true,
            whatsappEnabled: false,
          },
        ],
      }),
    ).toEqual(["invalid"]);
    expect(codes({ ...valid, requestId: "not-a-uuid" })).toEqual(["invalid"]);
    expect(codes({ ...valid, expectedRevision: -1 })).toEqual(["invalid"]);
  });

  it("parses a typed custom lead time strictly", () => {
    expect(parseCustomLeadTime(" 90 ")).toEqual({ ok: true, minutes: 90 });
    for (const value of ["", "14", "10081", "1e3", "-30", "30.5", "1,440"])
      expect(parseCustomLeadTime(value).ok, value).toBe(false);
  });

  it("previews and tests only known types in a supported language", () => {
    const preview = {
      locale: "en",
      templateKey: "booking.confirmed",
      emailLocale: "ar",
    };
    expect(emailPreviewSchema.safeParse(preview).success).toBe(true);
    expect(
      emailPreviewSchema.safeParse({ ...preview, emailLocale: "fr" }).success,
    ).toBe(false);
    expect(testNotificationSchema.safeParse({ ...preview, requestId }).success).toBe(
      true,
    );
    expect(testNotificationSchema.safeParse(preview).success).toBe(false);
  });
});
