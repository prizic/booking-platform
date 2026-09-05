import { describe, expect, it } from "vitest";

import {
  parseDashboardContextV1,
  parsePublicCatalogV1,
  parseTenantChoicesV1,
} from "./index.js";

describe("tenant isolation DTOs", () => {
  it("parses a customer-safe bilingual catalog item", () => {
    const [item] = parsePublicCatalogV1([{
      tenantId: "tenant-a", publicationId: "publication-a", publicationRevision: 1,
      locale: "ar", serviceId: "service-a", serviceKey: "consultation", categoryKey: null,
      serviceName: "استشارة", serviceDescription: "وصف", canonicalPath: "/services/consultation",
      durationMinutes: 45, bufferBeforeMinutes: 0, bufferAfterMinutes: 10,
      price: { currency: "SAR", minorUnits: 18000 }, taxRateBps: 1500,
      capacityMode: "exclusive", bookingMode: "appointment", approvalRequired: false,
      paymentMode: "none", locationId: "location-a", locationKey: "riyadh",
      locationName: "الرياض", locationDescription: "موقع", locationAddress: "العنوان",
      locationTimeZone: "Asia/Riyadh", locationCanonicalPath: "/locations/riyadh",
      cacheTag: "catalog:tenant-a:1:ar",
    }]);
    expect(item?.locale).toBe("ar");
    expect(item?.cacheTag).toBe("catalog:tenant-a:1:ar");
  });

  it("parses a minimal tenant-safe Dashboard context", () => {
    expect(
      parseDashboardContextV1({
        aal2: false,
        brandId: "brand-a",
        tenantId: "tenant-a",
        instanceId: "instance-a",
        dashboardHostname: "dashboard.tenant.example",
        defaultLocale: "en",
        tenantName: "Tenant A",
        membershipId: "membership-a",
        roleKey: "scheduler",
        grants: [
          {
            capability: "booking.view.any",
            requiresApproval: false,
            scope: "location",
          },
        ],
        locationIds: ["location-a"],
        locationScope: { kind: "all" },
        publishedBrandRevision: 2,
        configRevision: 3,
        featureRevision: 4,
      }),
    ).toMatchObject({ tenantId: "tenant-a", roleKey: "scheduler" });
  });

  it("rejects whole rows and malformed grants instead of forwarding them", () => {
    expect(() =>
      parseDashboardContextV1({
        aal2: false,
        brandId: "brand-a",
        tenantId: "tenant-a",
        instanceId: "instance-a",
        dashboardHostname: "dashboard.tenant.example",
        defaultLocale: "en",
        tenantName: "Tenant A",
        membershipId: "membership-a",
        roleKey: "scheduler",
        grants: [{ capability: "root", requiresApproval: false, scope: "tenant" }],
        locationIds: [],
        locationScope: { kind: "all" },
        publishedBrandRevision: 2,
        configRevision: 3,
        featureRevision: 4,
        rawCustomerEmail: "must-not-pass",
      }),
    ).toThrow("Dashboard context");
  });

  it("requires canonical tenant choices", () => {
    expect(
      parseTenantChoicesV1([
        {
          tenantId: "tenant-a",
          membershipId: "membership-a",
          roleKey: "scheduler",
          tenantName: "Tenant A",
          dashboardHostname: "dashboard.tenant.example",
        },
      ]),
    ).toHaveLength(1);
  });
});
