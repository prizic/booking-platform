import type { StaffResourceWorkspaceV1 } from "@wlbp/api-contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TeamResourcesView } from "./team-resources-view";

const workspace: StaffResourceWorkspaceV1 = {
  tenantId: "tenant-a",
  items: [
    {
      futureAllocationCount: 2,
      id: "a8000000-0000-0000-0000-000000000001",
      kind: "staff",
      locationIds: ["location-a"],
      name: "Layla Hassan",
      resourceTypeName: null,
      serviceIds: ["service-a"],
      status: "active",
    },
    {
      futureAllocationCount: 0,
      id: "a8200000-0000-0000-0000-000000000001",
      kind: "resource",
      locationIds: ["location-a"],
      name: "Room 1",
      resourceTypeName: "Room",
      serviceIds: ["service-a"],
      status: "maintenance",
    },
  ],
};

describe("Team and resources workspace view", () => {
  it("renders labelled management controls and explicit disabled seams", () => {
    const html = renderToStaticMarkup(
      createElement(TeamResourcesView, {
        locale: "en",
        state: {
          context: {} as never,
          kind: "ready",
          workspace,
        },
      }),
    );

    expect(html).toContain("Team and resources");
    expect(html).toContain("Layla Hassan");
    expect(html).toContain("Room 1");
    expect(html).toContain('disabled=""');
    expect(html).not.toContain("<form");
    expect(html).toContain("Deactivate safely");
    expect(html).toContain('aria-describedby="management-api-note"');
  });

  it("renders the same protected state in Arabic", () => {
    const html = renderToStaticMarkup(
      createElement(TeamResourcesView, {
        locale: "ar",
        state: {
          kind: "access-unavailable",
          reason: "location-scope-unavailable",
        },
      }),
    );

    expect(html).toContain("الإدارة محددة الموقع غير متصلة بعد");
    expect(html).toContain("لا يوسّع");
  });
});
