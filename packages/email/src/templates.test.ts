import { describe, expect, it } from "vitest";

import { renderNotificationEmail } from "./templates.js";
import { verifyResendWebhook } from "./webhook.js";

const variables = {
  locationName: "Downtown",
  manageUrl: "https://book.example.invalid/en/manage?token=abc",
  price: "SAR 180.00",
  publicReference: "K3M9P2T7XY",
  serviceName: "Initial consultation",
  startAt: "Monday 21 September, 1:00 PM",
  timeZone: "Asia/Riyadh",
};

describe("notification templates", () => {
  it("renders the same facts in HTML and plain text", () => {
    const rendered = renderNotificationEmail("booking.confirmed", {
      brandName: "Example Booking",
      locale: "en",
      variables,
    });

    expect(rendered.subject).toContain("K3M9P2T7XY");
    for (const fact of ["Downtown", "SAR 180.00", "Asia/Riyadh", "K3M9P2T7XY"]) {
      expect(rendered.html).toContain(fact);
      expect(rendered.text).toContain(fact);
    }
    expect(rendered.text).toContain("Example Booking");
  });

  it("carries direction and language for Arabic", () => {
    const rendered = renderNotificationEmail("booking.confirmed", {
      brandName: "مثال",
      locale: "ar",
      variables,
    });

    expect(rendered.html).toContain('dir="rtl"');
    expect(rendered.html).toContain('lang="ar"');
    expect(rendered.subject).toContain("K3M9P2T7XY");
  });

  it("drops a line whose variable is missing rather than mailing an empty label", () => {
    const rendered = renderNotificationEmail("booking.cancelled", {
      brandName: "Example Booking",
      locale: "en",
      variables: { publicReference: "K3M9P2T7XY", serviceName: "Initial consultation" },
    });

    expect(rendered.text).toContain("K3M9P2T7XY");
    expect(rendered.text).not.toContain("Refund:");
    expect(rendered.text).not.toContain("{");
  });

  it("escapes customer-supplied text into HTML", () => {
    const rendered = renderNotificationEmail("booking.rejected", {
      brandName: "Example Booking",
      locale: "en",
      variables: {
        publicReason: "<script>alert(1)</script>",
        publicReference: "K3M9P2T7XY",
        serviceName: "Initial consultation",
      },
    });

    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).toContain("&lt;script&gt;");
  });

  it("refuses to render a subject whose variable is missing", () => {
    expect(() =>
      renderNotificationEmail("booking.confirmed", {
        brandName: "Example Booking",
        locale: "en",
        variables: {},
      }),
    ).toThrow();
  });
});

async function sign(secret: string, id: string, timestamp: string, body: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    Uint8Array.from(atob(secret), (character) => character.charCodeAt(0)),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${body}`),
  );
  let binary = "";
  for (const byte of new Uint8Array(signature)) binary += String.fromCharCode(byte);
  return `v1,${btoa(binary)}`;
}

describe("resend webhook verification", () => {
  const secret = btoa("a-shared-secret-value");
  const body = '{"type":"email.delivered","data":{"email_id":"abc"}}';
  const now = new Date("2026-09-21T12:00:00.000Z");
  const timestamp = String(Math.floor(now.getTime() / 1000));

  it("accepts a signature over the unmodified raw body", async () => {
    const signature = await sign(secret, "msg_1", timestamp, body);
    await expect(
      verifyResendWebhook({
        headers: {
          "svix-id": "msg_1",
          "svix-signature": signature,
          "svix-timestamp": timestamp,
        },
        now,
        rawBody: body,
        secret,
      }),
    ).resolves.toEqual({ ok: true });
  });

  it("refuses a body that was re-serialized after signing", async () => {
    const signature = await sign(secret, "msg_1", timestamp, body);
    await expect(
      verifyResendWebhook({
        headers: {
          "svix-id": "msg_1",
          "svix-signature": signature,
          "svix-timestamp": timestamp,
        },
        now,
        rawBody: JSON.stringify(JSON.parse(body), null, 2),
        secret,
      }),
    ).resolves.toEqual({ ok: false, reason: "invalid" });
  });

  it("refuses a forged signature, a stale delivery, and missing headers alike", async () => {
    const signature = await sign(secret, "msg_1", timestamp, body);
    const base = {
      headers: {
        "svix-id": "msg_1",
        "svix-signature": signature,
        "svix-timestamp": timestamp,
      },
      now,
      rawBody: body,
      secret,
    };

    await expect(
      verifyResendWebhook({
        ...base,
        headers: { ...base.headers, "svix-signature": "v1,AAAA" },
      }),
    ).resolves.toEqual({ ok: false, reason: "invalid" });
    await expect(
      verifyResendWebhook({ ...base, now: new Date("2026-09-21T13:00:00.000Z") }),
    ).resolves.toEqual({ ok: false, reason: "invalid" });
    await expect(
      verifyResendWebhook({ ...base, headers: { "svix-id": "msg_1" } }),
    ).resolves.toEqual({ ok: false, reason: "invalid" });
    await expect(
      verifyResendWebhook({ ...base, secret: btoa("another-secret-value") }),
    ).resolves.toEqual({ ok: false, reason: "invalid" });
  });
});

describe("auth mail templates", () => {
  // Auth mail reaches somebody who may not be a customer yet, so the platform
  // owns every word — and both languages of it.
  it.each(["auth.sign_in_link", "auth.password_reset", "auth.email_change"] as const)(
    "%s carries the action link and the brand in both languages",
    (key) => {
      const english = renderNotificationEmail(key, {
        brandName: "Example Booking",
        locale: "en",
        variables: { actionUrl: "https://auth.example.invalid/verify?token=abc" },
      });
      const arabic = renderNotificationEmail(key, {
        brandName: "مثال",
        locale: "ar",
        variables: { actionUrl: "https://auth.example.invalid/verify?token=abc" },
      });

      for (const rendered of [english, arabic]) {
        expect(rendered.text).toContain(
          "https://auth.example.invalid/verify?token=abc",
        );
        expect(rendered.html).toContain(
          "https://auth.example.invalid/verify?token=abc",
        );
        expect(rendered.text).not.toContain("{");
      }
      expect(english.subject).toContain("Example Booking");
      expect(arabic.subject).toContain("مثال");
      expect(english.subject).not.toEqual(arabic.subject);
      expect(arabic.html).toContain('dir="rtl"');
    },
  );
});
