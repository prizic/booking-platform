import { describe, expect, it } from "vitest";
import { auditRange, toCsv } from "./audit-csv";

const row = {
  event_id: "e1",
  created_at: "2026-10-06T10:00:00Z",
  operator_id: "o1",
  operator_email: "ops@example.invalid",
  action: "tenant.suspended",
  outcome: "succeeded",
  tenant_id: "t1",
  tenant_name: 'North, "Main"',
  instance_id: null,
  target_kind: "tenant",
  target_id: "t1",
  reason: '=HYPERLINK("x")',
  detail: { from: "active" },
};

describe("toCsv", () => {
  it("writes a header and quotes every field", () => {
    const [header, line] = toCsv([row], "en").trim().split("\r\n");
    expect(header).toBe(
      '"Time (UTC)","Timestamp (UTC ISO)","Operator","Action","Action code","Outcome","Outcome code","Tenant","Target kind","Target ID","Reason","Detail"',
    );
    expect(line).toContain('"North, ""Main"""');
  });
  it("neutralises spreadsheet formulas", () => {
    expect(toCsv([row], "en")).toContain(`"'=HYPERLINK(""x"")"`);
  });
  it("names a failed attempted operation without implying it succeeded", () => {
    const failed = { ...row, action: "tenant.create", outcome: "failed" };
    expect(toCsv([failed], "en")).toContain(
      '"Register a tenant","tenant.create","Failed","failed"',
    );
    expect(toCsv([failed], "ar")).toContain(
      '"تسجيل مستأجر","tenant.create","فشل","failed"',
    );
  });
  it("localizes Arabic headers, actions, outcomes and dates while retaining stable codes", () => {
    const csv = toCsv([row], "ar");
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"المشغّل"');
    expect(csv).toContain('"علّق مستأجرًا","tenant.suspended","نجح","succeeded"');
    expect(csv).toMatch(/[٠-٩]/u);
    expect(csv).toContain('"t1"');
    expect(csv).toContain('"2026-10-06T10:00:00Z"');
  });
});

describe("auditRange", () => {
  it("turns civil dates into a half-open UTC range", () => {
    expect(auditRange("2026-10-01", "2026-10-06")).toEqual({
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-10-07T00:00:00.000Z",
    });
    expect(auditRange(undefined, undefined)).toEqual({});
  });
});
