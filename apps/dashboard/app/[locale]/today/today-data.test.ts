import { describe, expect, it, vi } from "vitest";
import type { DashboardRequestAccess } from "../../_lib/dashboard-server";
import { DashboardRpcError } from "../../_lib/dashboard-data-source";
vi.mock("../../_lib/dashboard-server", () => ({ loadDashboardRequestAccess: vi.fn() }));
import { loadToday } from "./today-data";
const offer = {
  id: "service",
  name: "Service",
  locationId: "location",
  locationName: "Location",
  timeZone: "Pacific/Auckland",
  paymentMode: "none",
  approvalRequired: false,
  canCreate: true,
};
function request(overrides: Record<string, unknown> = {}) {
  const getTodayWorkspace = vi.fn(
    async (_request: { tenantId: string; from: string; to: string }) => [
      { bookingId: "booking", queue: "arrivals" },
    ],
  );
  return {
    value: {
      state: { kind: "ready", context: { tenantId: "tenant-a" } },
      source: {
        getOperationalChoices: vi.fn(async () => ({
          offers: [offer],
          staff: [],
          resources: [],
        })),
        getTodayWorkspace,
        ...overrides,
      },
    } as unknown as DashboardRequestAccess,
    getTodayWorkspace,
  };
}
describe("Today authorized first read", () => {
  it("uses the authorized location civil day on the first call and makes one booking read", async () => {
    const { value, getTodayWorkspace } = request();
    const result = await loadToday("en", value);
    expect(result).toMatchObject({
      kind: "ready",
      timeZone: "Pacific/Auckland",
      items: [{ bookingId: "booking" }],
      canCreate: true,
    });
    expect(getTodayWorkspace).toHaveBeenCalledTimes(1);
    expect(getTodayWorkspace.mock.calls[0]?.[0]).toMatchObject({
      tenantId: "tenant-a",
    });
  });
  it("does not turn an operational choices failure into a Riyadh day or empty schedule", async () => {
    const diagnostic = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { value, getTodayWorkspace } = request({
      getOperationalChoices: vi.fn(async () => {
        throw new TypeError("sensitive provider body");
      }),
    });
    expect(await loadToday("en", value)).toMatchObject({
      kind: "failure",
      outcome: "transport_unavailable",
    });
    expect(getTodayWorkspace).not.toHaveBeenCalled();
    const log = diagnostic.mock.calls.map((call) => call.join(" ")).join(" ");
    expect(log).not.toContain("sensitive provider body");
    expect(log).not.toContain("tenant-a");
    expect(JSON.parse(String(diagnostic.mock.calls[0]?.[0]))).toMatchObject({
      event: "dashboard_read_failure",
      operation: "today_choices",
      outcome: "transport_unavailable",
    });
    diagnostic.mockRestore();
  });
  it("separates access denial and tenant setup from transport failure", async () => {
    expect(
      await loadToday("ar", { state: { kind: "configuration-missing" }, source: null }),
    ).toEqual({ kind: "failure", outcome: "tenant_setup" });
    const { value } = request();
    expect(
      await loadToday("en", {
        ...value,
        state: { kind: "denied", reason: "membership_inactive" },
      }),
    ).toEqual({ kind: "failure", outcome: "access_denied" });
    const diagnostic = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failed = request({
      getTodayWorkspace: vi.fn(async () => {
        throw new DashboardRpcError("42501", "not_authorized");
      }),
    });
    expect(await loadToday("en", failed.value)).toMatchObject({
      kind: "failure",
      outcome: "access_denied",
    });
    diagnostic.mockRestore();
  });
  it("shows a genuine empty day only after successful reads with an authorized timezone", async () => {
    const { value } = request({
      getOperationalChoices: vi.fn(async () => ({
        offers: [],
        staff: [],
        resources: [],
      })),
      getScheduleChoices: vi.fn(async () => [
        { kind: "location", timeZone: "Europe/London" },
      ]),
      getTodayWorkspace: vi.fn(async () => []),
    });
    expect(await loadToday("en", value)).toMatchObject({
      kind: "ready",
      timeZone: "Europe/London",
      items: [],
      canCreate: false,
    });
  });
});
