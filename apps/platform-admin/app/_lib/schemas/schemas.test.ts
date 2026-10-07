import { parseActionInput } from "@wlbp/ui-foundation/actions";
import { describe, expect, it } from "vitest";
import { exportAuditSchema } from "./audit";
import { signInSchema, totpCodeSchema } from "./auth";
import {
  asUuid,
  formLocale,
  idempotencyKey,
  integerText,
  optionalInstant,
  optionalText,
  reason,
  recordId,
  requiredText,
  splitLines,
  splitNotes,
} from "./fields";
import { operations, type OperationKey } from "./index";
import { requestProvisioningSchema } from "./operations";
import { addOperatorSchema } from "./operators";
import { savePlanSchema } from "./plans";
import { createRolloutSchema, registerReleaseSchema } from "./releases";
import { saveFlagSchema, saveReferencesSchema } from "./settings";
import { setEntitlementOverrideSchema } from "./subscriptions";
import { approveSupportSchema } from "./support";
import { createTenantSchema } from "./tenants";

const id = "D1000000-0000-4000-8000-00000000000A";
const key = "6f2c1f0e-3b7a-4c55-9d1e-2b8f7c6a5e40";

/** The error codes a schema reports, by field path. */
function codes(schema: Parameters<typeof parseActionInput>[0], input: unknown) {
  const parsed = parseActionInput(schema, input);
  return parsed.ok ? {} : parsed.result.ok ? {} : parsed.result.fieldErrors;
}

describe("field building blocks (formerly form-data.ts)", () => {
  it("normalises UUIDs and treats a malformed id as a stale page", () => {
    expect(asUuid(` ${id} `)).toBe(id.toLowerCase());
    expect(asUuid("not-a-uuid")).toBeUndefined();
    expect(asUuid(undefined)).toBeUndefined();
    expect(recordId.parse(id)).toBe(id.toLowerCase());
    expect(recordId.safeParse("123").error?.issues[0]?.message).toBe("not_found");
    expect(recordId.safeParse(undefined).error?.issues[0]?.message).toBe("not_found");
  });

  it("trims text, requires it where required and enforces the control's maximum", () => {
    expect(requiredText().parse("  North Clinic ")).toBe("North Clinic");
    expect(requiredText().safeParse("   ").error?.issues[0]?.message).toBe("required");
    expect(requiredText(3).safeParse("abcd").error?.issues[0]?.message).toBe(
      "too_long",
    );
    expect(optionalText().parse("  ")).toBeUndefined();
    expect(optionalText().parse(undefined)).toBeUndefined();
    expect(optionalText().parse(" x ")).toBe("x");
  });

  it("requires an audit reason of the dialog's minimum length", () => {
    expect(reason(5).safeParse("abcd").error?.issues[0]?.message).toBe(
      "reason_required",
    );
    expect(reason(5).safeParse("    ").error?.issues[0]?.message).toBe(
      "reason_required",
    );
    expect(reason(5).parse(" abcde ")).toBe("abcde");
    expect(reason(5).safeParse("x".repeat(501)).error?.issues[0]?.message).toBe(
      "too_long",
    );
  });

  it("parses whole numbers and enforces ranges", () => {
    expect(integerText().parse(" 42 ")).toBe(42);
    expect(integerText().parse("-3")).toBe(-3);
    expect(integerText().safeParse("").error?.issues[0]?.message).toBe("required");
    expect(integerText().safeParse("4.5").error?.issues[0]?.message).toBe(
      "invalid_integer",
    );
    expect(integerText({ min: 5 }).safeParse("4").error?.issues[0]?.message).toBe(
      "too_small",
    );
    expect(integerText({ max: 480 }).safeParse("481").error?.issues[0]?.message).toBe(
      "too_large",
    );
  });

  it("reads a UTC date-time control as an instant; empty clears it", () => {
    expect(optionalInstant.parse("2026-10-07T09:30")).toBe("2026-10-07T09:30:00.000Z");
    expect(optionalInstant.parse("")).toBeNull();
    expect(optionalInstant.parse(undefined)).toBeNull();
    expect(optionalInstant.safeParse("2026-10-07").error?.issues[0]?.message).toBe(
      "invalid_date",
    );
    expect(
      optionalInstant.safeParse("2026-13-45T99:99").error?.issues[0]?.message,
    ).toBe("invalid_date");
  });

  it("splits lists on lines or commas, and notes on lines only", () => {
    expect(splitLines(" a, b\n\n c ,")).toEqual(["a", "b", "c"]);
    expect(splitLines(undefined)).toEqual([]);
    expect(splitNotes("Fixes a, b and c\n\n Second ")).toEqual([
      "Fixes a, b and c",
      "Second",
    ]);
  });

  it("falls back to English for an unknown locale", () => {
    expect(formLocale.parse("ar")).toBe("ar");
    expect(formLocale.parse("fr")).toBe("en");
    expect(formLocale.parse(undefined)).toBe("en");
  });

  it("accepts only idempotency keys the database accepts", () => {
    expect(idempotencyKey.parse(key)).toBe(key);
    expect(idempotencyKey.safeParse("short").error?.issues[0]?.message).toBe(
      "idempotency_key_invalid",
    );
    expect(idempotencyKey.safeParse("has spaces in it!!").success).toBe(false);
  });
});

describe("operation registry", () => {
  const entries = Object.entries(operations) as [
    OperationKey,
    (typeof operations)[OperationKey],
  ][];

  it("covers every Platform Admin mutation", () => {
    expect(entries).toHaveLength(37);
  });

  it("each reason minimum matches the schema the server re-validates", () => {
    for (const [name, spec] of entries) {
      const shape = spec.schema.shape as Record<string, unknown>;
      if (!("reason" in spec)) {
        expect(shape, name).not.toHaveProperty("reason");
        continue;
      }
      const field = spec.schema.shape.reason as {
        safeParse: (value: unknown) => { success: boolean };
      };
      expect(field.safeParse("x".repeat(spec.reason - 1)).success, name).toBe(false);
      expect(field.safeParse("x".repeat(spec.reason)).success, name).toBe(true);
    }
  });

  it("idempotent operations, and only those, carry an idempotency key", () => {
    for (const [name, spec] of entries) {
      const shape = spec.schema.shape as Record<string, unknown>;
      expect("idempotencyKey" in shape, name).toBe("idempotent" in spec);
    }
  });

  it("no schema accepts a tenant purely for audit attribution", () => {
    for (const name of [
      "requestDomainVerification",
      "retryRun",
      "activateRun",
      "deactivateRun",
      "cancelJob",
      "retryJob",
      "approveJob",
      "approveSupport",
      "revokeSupport",
    ] as const) {
      expect(operations[name].schema.shape, name).not.toHaveProperty("tenantId");
    }
  });
});

describe("operation schemas", () => {
  it("lower-cases a brand key but leaves its rules to the database", () => {
    expect(
      createTenantSchema.parse({
        name: " North ",
        brandKey: "Not A Key",
        idempotencyKey: key,
        locale: "ar",
      }),
    ).toEqual({
      name: "North",
      brandKey: "not a key",
      idempotencyKey: key,
      locale: "ar",
    });
    expect(codes(createTenantSchema, { name: "", brandKey: "x" })).toMatchObject({
      name: ["required"],
      idempotencyKey: ["idempotency_key_invalid"],
    });
  });

  it("splits the provisioning target and normalises the request", () => {
    const parsed = requestProvisioningSchema.parse({
      target: `${id}|${id}`,
      releaseId: id,
      slug: "North-Clinic",
      planKey: "standard",
      defaultLocale: "ar",
      timezone: "Asia/Riyadh",
      currency: "sar",
      clientHostname: " Book.Example.com ",
      dashboardHostname: "",
      idempotencyKey: key,
    });
    expect(parsed.target).toEqual({
      tenantId: id.toLowerCase(),
      instanceId: id.toLowerCase(),
    });
    expect(parsed.slug).toBe("north-clinic");
    expect(parsed.currency).toBe("SAR");
    expect(parsed.clientHostname).toBe("book.example.com");
    expect(parsed.dashboardHostname).toBeUndefined();
    expect(parsed.locale).toBe("en");
    expect(codes(requestProvisioningSchema, { target: "x|y" })).toMatchObject({
      target: ["not_found"],
      slug: ["required"],
    });
  });

  it("validates operator email and role", () => {
    expect(
      codes(addOperatorSchema, { email: "nope", role: "owner", reason: "short" }),
    ).toMatchObject({ email: ["invalid_email"], role: ["required"] });
    expect(
      addOperatorSchema.parse({
        email: " ops@example.invalid ",
        role: "admin",
        expiresAt: "",
        reason: "Rotating on-call",
      }),
    ).toEqual({
      email: "ops@example.invalid",
      role: "admin",
      expiresAt: null,
      reason: "Rotating on-call",
    });
  });

  it("lower-cases plan keys and features", () => {
    expect(
      savePlanSchema.parse({
        mode: "create",
        key: "Pro",
        name: "Pro",
        features: "Booking.Online, reports.operational\n",
        active: true,
        reason: "New plan",
      }),
    ).toMatchObject({
      key: "pro",
      features: ["booking.online", "reports.operational"],
      active: true,
    });
  });

  it("parses release numbers and notes", () => {
    const parsed = registerReleaseSchema.parse({
      version: "0.3.1",
      channel: "candidate",
      gitCommit: "A".repeat(40),
      configSchemaVersion: "2",
      backendMin: "1",
      backendMax: "3",
      migrationIds: "20261006120000, 20261006140000",
      featureNotes: "Adds a, b\nFixes c",
      upgradeNotes: "None",
      reversible: false,
      idempotencyKey: key,
      locale: "en",
    });
    expect(parsed).toMatchObject({
      gitCommit: "a".repeat(40),
      configSchemaVersion: 2,
      backendMin: 1,
      backendMax: 3,
      migrationIds: ["20261006120000", "20261006140000"],
      featureNotes: ["Adds a, b", "Fixes c"],
      upgradeNotes: ["None"],
      reversible: false,
    });
    expect(codes(registerReleaseSchema, { gitCommit: "abc" })).toMatchObject({
      gitCommit: ["too_short"],
      featureNotes: ["required"],
    });
  });

  it("refuses a malformed rollout instance as a stale page", () => {
    expect(
      codes(createRolloutSchema, {
        releaseId: id,
        rings: ["canary"],
        instanceIds: ["bogus"],
        reason: "Specific instance",
        idempotencyKey: key,
      }),
    ).toEqual({ "instanceIds.0": ["not_found"] });
  });

  it("keeps flag messages optional and integration names upper-case", () => {
    expect(
      saveFlagSchema.parse({
        key: "Demo.Flag",
        kind: "feature",
        enabled: true,
        messageEn: " ",
        messageAr: "رسالة",
        startsAt: "",
        endsAt: "2026-10-08T00:00",
        reason: "Local flag",
      }),
    ).toMatchObject({
      key: "demo.flag",
      messageEn: null,
      messageAr: "رسالة",
      startsAt: null,
      endsAt: "2026-10-08T00:00:00.000Z",
    });
    expect(
      saveReferencesSchema.parse({
        provider: "github",
        references: "github_app_id\nX",
      }),
    ).toEqual({ provider: "github", references: ["GITHUB_APP_ID", "X"] });
    expect(codes(saveReferencesSchema, { provider: "gitlab" })).toMatchObject({
      provider: ["not_found"],
    });
  });

  it("reads the override grant as a boolean", () => {
    expect(
      setEntitlementOverrideSchema.parse({
        tenantId: id,
        featureKey: "Booking.Online",
        granted: "no",
        reason: "Paused",
      }),
    ).toMatchObject({ featureKey: "booking.online", granted: false, expiresAt: null });
  });

  it("bounds support access minutes", () => {
    expect(approveSupportSchema.parse({ grantId: id, minutes: "60" }).minutes).toBe(60);
    expect(codes(approveSupportSchema, { grantId: id, minutes: "4" })).toEqual({
      minutes: ["too_small"],
    });
  });

  it("ignores malformed audit export filters like the list does", () => {
    expect(
      exportAuditSchema.parse({
        q: " north ",
        tenant: "not-a-uuid",
        from: "2026-10-01",
        to: "yesterday",
        locale: "ar",
      }),
    ).toEqual({
      q: "north",
      family: undefined,
      tenant: undefined,
      outcome: undefined,
      from: "2026-10-01",
      to: undefined,
      locale: "ar",
    });
  });

  it("checks sign-in fields and six-digit codes without trimming passwords", () => {
    expect(
      signInSchema.parse({ email: " a@example.invalid ", password: " p " }),
    ).toEqual({
      email: "a@example.invalid",
      password: " p ",
    });
    expect(codes(signInSchema, { email: "", password: "" })).toEqual({
      email: ["required"],
      password: ["required"],
    });
    expect(totpCodeSchema.parse({ code: " 123456 " })).toEqual({ code: "123456" });
    expect(codes(totpCodeSchema, { code: "12345" })).toEqual({ code: ["code_format"] });
  });
});
