import { notificationTemplateKeysV1 } from "@wlbp/api-contracts";
import { describe, expect, it } from "vitest";

import {
  formatLeadTime,
  notificationCopy,
  notificationFormMessages,
  notificationTemplateText,
  notificationText,
} from "./notification-copy";

const slots = (message: string) =>
  [...message.matchAll(/\{(\w+)\}/gu)].map((match) => match[1]).sort();

describe("notification copy", () => {
  it("has every message in English and Arabic with the same placeholders", () => {
    expect(Object.keys(notificationCopy.ar).sort()).toEqual(
      Object.keys(notificationCopy.en).sort(),
    );
    for (const [key, english] of Object.entries(notificationCopy.en)) {
      const arabic = notificationCopy.ar[key as keyof typeof notificationCopy.ar];
      expect(english.trim(), key).not.toBe("");
      expect(arabic.trim(), key).not.toBe("");
      expect(slots(arabic), key).toEqual(slots(english));
      // Arabic digits come from Intl formatting, never typed into copy.
      expect(/[٠-٩]/u.test(arabic), key).toBe(false);
    }
  });

  it("names and explains every message type in both languages", () => {
    for (const key of notificationTemplateKeysV1) {
      for (const locale of ["en", "ar"] as const) {
        const [label, description] = notificationTemplateText[key][locale];
        expect(label.trim(), `${key} ${locale}`).not.toBe("");
        expect(description.trim(), `${key} ${locale}`).not.toBe("");
      }
      expect(/[؀-ۿ]/u.test(notificationTemplateText[key].ar[0])).toBe(true);
    }
  });

  it("says exactly that WhatsApp market rules require independent legal review", () => {
    expect(notificationText("en", "waLegal")).toContain(
      "requires independent legal review",
    );
    expect(notificationText("ar", "waLegal")).toContain("مراجعة قانونية مستقلة");
  });

  it("fills bounds in the locale's digits and keeps unknown placeholders", () => {
    expect(notificationFormMessages("en").reminder_offset_range).toBe(
      "Enter a whole number of minutes from 15 to 10,080.",
    );
    expect(notificationFormMessages("ar").reminder_offset_range).toContain("١٥");
    expect(notificationText("en", "waTokenHint")).toContain("{reference}");
    expect(
      notificationFormMessages("en", { reference: "env:X" }).wa_secret_ref_foreign,
    ).toContain("env:X");
  });

  it("words lead times in the largest whole unit", () => {
    expect(formatLeadTime(15, "en")).toBe("15 minutes");
    expect(formatLeadTime(120, "en")).toBe("2 hours");
    expect(formatLeadTime(1440, "en")).toBe("24 hours");
    expect(formatLeadTime(10080, "en")).toBe("1 week");
    expect(formatLeadTime(90, "en")).toBe("90 minutes");
    expect(formatLeadTime(60, "ar")).toMatch(/ساعة/u);
  });
});
