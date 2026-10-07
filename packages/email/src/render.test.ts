import { describe, expect, it } from "vitest";

import { contrastRatio, resolveButtonColors, type EmailBrand } from "./brand.js";
import { buildDailyDigest, firstNameOnly, formatBookingCount } from "./digest.js";
import { formatLead, normalizeNotificationPayload } from "./payload.js";
import { notificationPreviewSample } from "./samples.js";
import {
  notificationTemplateCatalog,
  notificationTemplateKeys,
  renderNotificationEmail,
  type NotificationTemplateKey,
} from "./templates.js";

const brand: EmailBrand = {
  dashboardOrigin: "https://dashboard.example.invalid",
  logoUrl: "https://cdn.example.invalid/logo.png",
  onPrimaryColor: "#ffffff",
  primaryColor: "#0f766e",
  supportEmail: "help@example.invalid",
};

function render(
  key: NotificationTemplateKey,
  locale: "ar" | "en",
  overrides: Partial<Parameters<typeof renderNotificationEmail>[1]> = {},
) {
  const sample = notificationPreviewSample(key, locale);
  return renderNotificationEmail(key, {
    brand,
    brandName: locale === "ar" ? "عيادة المثال" : "Example Clinic",
    ...(sample.digest === undefined ? {} : { digest: sample.digest }),
    locale,
    variables: sample.variables,
    ...overrides,
  });
}

function attributeValues(html: string, attribute: string): string[] {
  return [...html.matchAll(new RegExp(`${attribute}="([^"]*)"`, "gu"))].map(
    (match) => match[1] ?? "",
  );
}

describe("every template in both languages", () => {
  const cases = notificationTemplateKeys.flatMap((key) =>
    (["en", "ar"] as const).map((locale) => [key, locale] as const),
  );

  it.each(cases)("%s (%s) renders a complete, directional message", (key, locale) => {
    const rendered = render(key, locale);
    const direction = locale === "ar" ? "rtl" : "ltr";

    expect(rendered.subject.length).toBeGreaterThan(0);
    expect(rendered.html.startsWith("<!doctype html>")).toBe(true);
    expect(rendered.html).toContain(`<html lang="${locale}" dir="${direction}"`);
    expect(rendered.html).toContain(`<body dir="${direction}"`);
    expect(rendered.html).toContain("max-width:600px");
    if (locale === "ar") {
      expect(rendered.html).toContain("'Noto Sans Arabic','Noto Naskh Arabic',Tahoma");
    }
    // Nothing unfilled, in either part.
    expect(rendered.html).not.toMatch(/\{\w+\}/u);
    expect(rendered.text).not.toMatch(/\{\w+\}/u);
    // A real plain-text twin: brand, and every card fact the HTML carries.
    expect(rendered.text).toContain(
      locale === "ar" ? "عيادة المثال" : "Example Clinic",
    );
    expect(rendered.text.split("\n").length).toBeGreaterThan(5);
    expect(rendered.text).not.toContain("<");
  });

  it.each(cases)(
    "%s (%s) loads nothing external except the brand logo",
    (key, locale) => {
      const { html } = render(key, locale);
      expect(html).not.toMatch(/<(script|link|style|iframe|object|embed|form)\b/iu);
      expect(html).not.toMatch(/@import|url\(|javascript:/iu);
      expect(attributeValues(html, "src")).toEqual([brand.logoUrl]);
      for (const href of attributeValues(html, "href")) {
        expect(href).toMatch(/^(https?:\/\/|mailto:)/u);
      }
    },
  );

  it("keeps English and Arabic copy in parity: same card rows and actions", () => {
    for (const key of notificationTemplateKeys) {
      const english = render(key, "en");
      const arabic = render(key, "ar");
      const count = (html: string, marker: string) => html.split(marker).length;
      expect(count(arabic.html, "<a href"), key).toBe(count(english.html, "<a href"));
      expect(
        count(arabic.html, 'font-size:13px;line-height:18px;color:#52525b">'),
        key,
      ).toBe(count(english.html, 'font-size:13px;line-height:18px;color:#52525b">'));
      expect(arabic.subject, key).not.toBe(english.subject);
    }
  });
});

describe("booking card and buttons", () => {
  it("shows the time zone once, beside the time", () => {
    const { html, text } = render("booking.confirmed", "en");
    expect(html.split("Asia/Riyadh")).toHaveLength(2);
    expect(text.split("Asia/Riyadh")).toHaveLength(2);
  });

  it("offers manage and directions, and directions only with an address", () => {
    const withAddress = render("booking.confirmed", "en");
    expect(withAddress.html).toContain("Manage booking");
    expect(withAddress.html).toContain("Get directions");
    expect(withAddress.html).toContain(
      "https://www.google.com/maps/search/?api=1&amp;query=",
    );

    const sample = notificationPreviewSample("booking.confirmed", "en");
    const { locationAddress: _dropped, ...rest } = sample.variables;
    const withoutAddress = render("booking.confirmed", "en", { variables: rest });
    expect(withoutAddress.html).not.toContain("Get directions");
    expect(withoutAddress.text).not.toContain("Get directions");
  });

  it("offers add-to-calendar only when a calendar link exists", () => {
    expect(render("booking.confirmed", "en").html).not.toContain("Add to calendar");
    const sample = notificationPreviewSample("booking.confirmed", "en");
    const withCalendar = render("booking.confirmed", "en", {
      variables: { ...sample.variables, calendarUrl: "https://example.invalid/b.ics" },
    });
    expect(withCalendar.html).toContain("Add to calendar");
    expect(withCalendar.text).toContain(
      "Add to calendar: https://example.invalid/b.ics",
    );
  });

  it("drops an unsafe link instead of rendering it", () => {
    const sample = notificationPreviewSample("booking.confirmed", "en");
    const { html, text } = render("booking.confirmed", "en", {
      variables: { ...sample.variables, manageUrl: "javascript:alert(1)" },
    });
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("Manage booking");
    expect(text).not.toContain("javascript:");
  });

  it("drops a logo that is not an absolute https URL and keeps the name", () => {
    const { html } = render("booking.confirmed", "en", {
      brand: { ...brand, logoUrl: "http://cdn.example.invalid/logo.png" },
    });
    expect(html).not.toContain("<img");
    expect(html).toContain("Example Clinic");
  });

  it("refuses an auth message whose link is unusable", () => {
    expect(() =>
      renderNotificationEmail("auth.sign_in_link", {
        brandName: "Example",
        locale: "en",
        variables: { actionUrl: "javascript:alert(1)" },
      }),
    ).toThrow();
  });
});

describe("escaping", () => {
  const hostile = `"><img src=x onerror=alert(1)><script>alert(2)</script>&`;

  it.each(
    notificationTemplateKeys.flatMap((key) => [
      [key, "en"] as const,
      [key, "ar"] as const,
    ]),
  )("%s (%s) escapes every interpolated value", (key, locale) => {
    const sample = notificationPreviewSample(key, locale);
    const variables = Object.fromEntries(
      Object.entries(sample.variables).map(([name, value]) => [
        name,
        name.endsWith("Url") ? value : `${value}${hostile}`,
      ]),
    );
    const digest =
      sample.digest === undefined
        ? undefined
        : buildDailyDigest({
            bookings: [
              {
                customerFirstName: hostile,
                locationName: hostile,
                serviceName: hostile,
                staffName: hostile,
                startsAt: "2026-03-15T06:00:00.000Z",
                timeZone: "Asia/Riyadh",
              },
            ],
            locale,
            localDate: "2026-03-15",
            timeZone: "Asia/Riyadh",
          });
    const { html } = renderNotificationEmail(key, {
      brand,
      brandName: `Clinic${hostile}`,
      ...(digest === undefined ? {} : { digest }),
      locale,
      variables,
    });
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toMatch(/"\s*onerror=/u);
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("button contrast", () => {
  it("keeps the brand's own readable pairing", () => {
    expect(
      resolveButtonColors({ onPrimaryColor: "#FFFFFF", primaryColor: "#0F766E" }),
    ).toEqual({ background: "#0f766e", text: "#ffffff" });
  });

  it("falls back to dark text on a light brand colour with unreadable white", () => {
    const colors = resolveButtonColors({
      onPrimaryColor: "#ffffff",
      primaryColor: "#facc15",
    });
    expect(colors.background).toBe("#facc15");
    expect(colors.text).toBe("#18181b");
    expect(contrastRatio(colors.background, colors.text)).toBeGreaterThanOrEqual(4.5);
  });

  it("falls back to white on a dark brand colour without a usable pairing", () => {
    expect(
      resolveButtonColors({ onPrimaryColor: "nope", primaryColor: "#1e3a8a" }),
    ).toEqual({
      background: "#1e3a8a",
      text: "#ffffff",
    });
  });

  it("uses a neutral ink, never a platform colour, when the brand colour is invalid", () => {
    const colors = resolveButtonColors({ primaryColor: "red;background:url(x)" });
    expect(colors.background).toBe("#27272a");
    const { html } = render("booking.confirmed", "en", {
      brand: { ...brand, primaryColor: "red;background:url(x)" },
    });
    expect(html).not.toContain("url(x)");
  });

  it("expands short hex colours", () => {
    expect(resolveButtonColors({ primaryColor: "#fff" }).text).toBe("#18181b");
  });
});

describe("footer, preferences and test marker", () => {
  it("gives transactional mail no unsubscribe link", () => {
    for (const key of notificationTemplateKeys) {
      if (notificationTemplateCatalog[key].optional) continue;
      const { html } = render(key, "en");
      expect(html, key).not.toContain("Manage your email preferences");
      expect(html, key).not.toContain("Stop reminder emails");
    }
  });

  it("links staff to their own preferences in the tenant's Dashboard", () => {
    const { html, text } = render("staff.request_pending", "ar");
    expect(html).toContain(
      'href="https://dashboard.example.invalid/ar/communications/preferences"',
    );
    expect(text).toContain("إدارة تفضيلات البريد الإلكتروني");
    expect(html).toContain('href="https://dashboard.example.invalid/ar/requests"');
  });

  it("says why the recipient got the message, with the business name", () => {
    expect(render("booking.confirmed", "en").text).toContain(
      "because you made a booking with Example Clinic",
    );
    expect(render("staff.booking_cancelled", "ar").text).toContain("فريق عيادة المثال");
  });

  it("offers a customer reminder opt-out only when one exists", () => {
    expect(render("booking.reminder", "en").html).not.toContain("Stop reminder emails");
    const sample = notificationPreviewSample("booking.reminder", "en");
    const { html } = render("booking.reminder", "en", {
      variables: {
        ...sample.variables,
        unsubscribeUrl: "https://example.invalid/stop",
      },
    });
    expect(html).toContain("Stop reminder emails");
  });

  it("marks a test send in the subject, a banner, and the text", () => {
    const english = render("booking.confirmed", "en", { isTest: true });
    expect(english.subject.startsWith("[Test] ")).toBe(true);
    expect(english.html).toContain('role="note"');
    expect(english.text.startsWith("*** Test message")).toBe(true);
    const arabic = render("booking.confirmed", "ar", { isTest: true });
    expect(arabic.subject.startsWith("[تجربة] ")).toBe(true);
    expect(render("booking.confirmed", "en").html).not.toContain('role="note"');
  });
});

describe("staff daily digest", () => {
  const base = {
    locale: "en" as const,
    localDate: "2026-03-15",
    timeZone: "Asia/Riyadh",
  };

  it("keeps only the local day, sorted by start, grouped by location", () => {
    const digest = buildDailyDigest({
      ...base,
      bookings: [
        // 23:30 Riyadh on the 15th: still today there, already the 16th in UTC+4.
        {
          locationName: "North",
          serviceName: "Late",
          startsAt: "2026-03-15T20:30:00.000Z",
          timeZone: "Asia/Riyadh",
        },
        {
          locationName: "South",
          serviceName: "Early",
          startsAt: "2026-03-15T05:00:00.000Z",
          timeZone: "Asia/Riyadh",
        },
        {
          locationName: "North",
          serviceName: "Middle",
          startsAt: "2026-03-15T09:00:00.000Z",
          timeZone: "Asia/Riyadh",
        },
        // 01:00 on the 16th in Riyadh: tomorrow, not today.
        {
          locationName: "North",
          serviceName: "Tomorrow",
          startsAt: "2026-03-15T22:00:00.000Z",
          timeZone: "Asia/Riyadh",
        },
        { serviceName: "Broken", startsAt: "not a date", timeZone: "Asia/Riyadh" },
      ],
    });

    expect(digest.count).toBe(3);
    expect(digest.groups.map((group) => group.locationName)).toEqual([
      "South",
      "North",
    ]);
    expect(digest.groups[1]?.entries.map((entry) => entry.serviceName)).toEqual([
      "Middle",
      "Late",
    ]);
    expect(digest.groups[0]?.entries[0]?.time).toBe("8:00 AM");
    expect(digest.showStaff).toBe(false);
  });

  it("caps the list and says how many more there are", () => {
    const bookings = Array.from({ length: 5 }, (_, index) => ({
      serviceName: `Service ${index}`,
      startsAt: `2026-03-15T0${index + 5}:00:00.000Z`,
      timeZone: "Asia/Riyadh",
    }));
    const digest = buildDailyDigest({ ...base, bookings, limit: 3 });
    expect(digest.count).toBe(5);
    expect(digest.hiddenCount).toBe(2);
    const { text } = renderNotificationEmail("staff.daily_digest", {
      brand,
      brandName: "Example Clinic",
      digest,
      locale: "en",
      variables: {},
    });
    expect(text).toContain("Plus 2 more in the Dashboard.");
    expect(text).toContain(
      "Open today's schedule: https://dashboard.example.invalid/en/today",
    );
  });

  it("only ever shows a customer's first name", () => {
    expect(firstNameOnly("  Sara Al-Example  ")).toBe("Sara");
    expect(firstNameOnly("   ")).toBeUndefined();
  });

  it("counts bookings with the right Arabic plural forms", () => {
    expect(formatBookingCount(0, "ar")).toBe("لا توجد حجوزات");
    expect(formatBookingCount(1, "ar")).toBe("حجز واحد");
    expect(formatBookingCount(2, "ar")).toBe("حجزان");
    expect(formatBookingCount(1, "en")).toBe("1 booking");
    expect(formatBookingCount(3, "en")).toBe("3 bookings");
  });

  it("renders an empty day as an explicit sentence, not an empty table", () => {
    const digest = buildDailyDigest({ ...base, bookings: [] });
    const { html, subject } = renderNotificationEmail("staff.daily_digest", {
      brandName: "Example Clinic",
      digest,
      locale: "en",
      variables: {},
    });
    expect(subject).toBe("Today at Example Clinic: No bookings");
    expect(html).toContain("Nothing is booked for today.");
    expect(html).not.toContain("<th");
  });

  it("refuses to render without digest data", () => {
    expect(() =>
      renderNotificationEmail("staff.daily_digest", {
        brandName: "Example Clinic",
        locale: "en",
        variables: {},
      }),
    ).toThrow();
  });

  it("is built from a raw outbox payload", () => {
    const input = normalizeNotificationPayload(
      {
        bookings: [
          {
            customer_first_name: "Sara Example",
            service_name: "Consultation",
            staff_name: "Huda",
            starts_at: "2026-03-15T06:00:00.000Z",
          },
        ],
        local_date: "2026-03-15",
        time_zone: "Asia/Riyadh",
      },
      "ar",
    );
    expect(input.digest?.count).toBe(1);
    expect(input.digest?.groups[0]?.entries[0]?.customerFirstName).toBe("Sara");
    expect(input.digest?.showStaff).toBe(true);
  });
});

describe("payload normalization", () => {
  it("prefers values the database already formatted", () => {
    const input = normalizeNotificationPayload(
      {
        startAt: "Formatted by SQL",
        starts_at: "2026-03-15T06:00:00.000Z",
        time_zone: "Asia/Riyadh",
      },
      "en",
    );
    expect(input.variables.startAt).toBe("Formatted by SQL");
  });

  it("never formats a time without a time zone", () => {
    const input = normalizeNotificationPayload(
      { starts_at: "2026-03-15T06:00:00.000Z" },
      "en",
    );
    expect(input.variables.startAt).toBeUndefined();
  });

  it("describes reminder lead times naturally in both languages", () => {
    expect(formatLead(1440, "en")).toBe("tomorrow");
    expect(formatLead(120, "en")).toBe("in 2 hours");
    expect(formatLead(1440, "ar")).toBe("غدًا");
    expect(formatLead(0, "en")).toBeNull();
  });
});
