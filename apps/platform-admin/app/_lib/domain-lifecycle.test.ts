import { describe, expect, it } from "vitest";
import {
  canRequestDomainVerification,
  domainRetirementState,
  eligibleDomainReplacements,
  validateDomainRead,
  type RetirementDomain,
} from "./domain-lifecycle";

const source: RetirementDomain = {
  id: "d4000000-0000-4000-8000-000000000136",
  tenant_id: "d1000000-0000-4000-8000-000000000136",
  instance_id: "d3000000-0000-4000-8000-000000000136",
  hostname: "source.example.invalid",
  application: "client",
  kind: "production",
  verification_status: "verified",
  active: true,
  retired_at: null,
  replacement_domain_id: null,
};
const replacement: RetirementDomain = {
  ...source,
  id: "d4000000-0000-4000-8000-000000000137",
  hostname: "replacement.example.invalid",
  active: false,
};
const retiredAt = "2026-10-13T08:00:00+00:00";

describe("retained domain lifecycle read contract", () => {
  it("retains retirement date and replacement lineage on directory and tenant reads", () => {
    const domain = {
      ...source,
      retired_at: retiredAt,
      replacement_domain_id: replacement.id,
      active: false,
    };
    expect(() =>
      validateDomainRead("list_domains_v1", [{ ...domain, domain_id: domain.id }]),
    ).not.toThrow();
    expect(() =>
      validateDomainRead("get_tenant_v1", { domains: [domain] }),
    ).not.toThrow();
    expect(domainRetirementState(domain)).toBe("retired");
    expect(domain.replacement_domain_id).toBe(replacement.id);
  });

  it("distinguishes absent N-1 metadata from a known unretired record", () => {
    const {
      retired_at: _date,
      replacement_domain_id: _replacement,
      ...legacy
    } = source;
    expect(() =>
      validateDomainRead("get_tenant_v1", { domains: [legacy] }),
    ).not.toThrow();
    expect(domainRetirementState(legacy)).toBe("unknown");
    expect(legacy).not.toHaveProperty("retired_at");
    expect(domainRetirementState(source)).toBe("not_retired");
  });

  it.each([
    { ...source, retired_at: "not-a-date" },
    { ...source, retired_at: true },
    { ...source, replacement_domain_id: "wrong-id" },
  ])(
    "refuses malformed additive metadata instead of accepting an empty read (%j)",
    (domain) => {
      expect(() =>
        validateDomainRead("list_domains_v1", [{ ...domain, domain_id: domain.id }]),
      ).toThrow();
      expect(() =>
        validateDomainRead("get_tenant_v1", { domains: [domain] }),
      ).toThrow();
    },
  );

  it.each([null, {}, [null], [{}]])("refuses invalid directory shape (%j)", (data) => {
    expect(() => validateDomainRead("list_domains_v1", data)).toThrow();
  });

  it("keeps the successful empty directory separate from malformed tenant data", () => {
    expect(() => validateDomainRead("list_domains_v1", [])).not.toThrow();
    expect(() => validateDomainRead("get_tenant_v1", { domains: [] })).not.toThrow();
    expect(() => validateDomainRead("get_tenant_v1", { domains: null })).toThrow();
  });
});

describe("domain retirement presentation eligibility", () => {
  it("never offers retired verified inactive domains or actions on a retired source", () => {
    const retired = { ...replacement, retired_at: retiredAt };
    expect(eligibleDomainReplacements(source, [retired])).toEqual([]);
    expect(
      eligibleDomainReplacements({ ...source, retired_at: retiredAt }, [replacement]),
    ).toEqual([]);
    expect(
      canRequestDomainVerification({ ...retired, verification_status: "failed" }),
    ).toBe(false);
  });

  it.each([
    { ...replacement, tenant_id: "d1000000-0000-4000-8000-000000000138" },
    { ...replacement, instance_id: "d3000000-0000-4000-8000-000000000138" },
    { ...replacement, application: "dashboard" },
    { ...replacement, kind: "preview" },
    { ...replacement, verification_status: "pending" },
    { ...replacement, pending_retirement_job_id: source.id },
    source,
  ])(
    "excludes a replacement outside the verified production context (%j)",
    (candidate) => {
      expect(eligibleDomainReplacements(source, [candidate])).toEqual([]);
    },
  );

  it.each([true, false])(
    "offers verified unretired production replacements when active=%s",
    (active) => {
      const candidate = { ...replacement, active };
      expect(eligibleDomainReplacements(source, [candidate])).toEqual([candidate]);
    },
  );

  it("keeps legacy retirement status unknown without offering an unproven replacement", () => {
    const { retired_at: _date, ...legacy } = replacement;
    expect(eligibleDomainReplacements(source, [legacy])).toEqual([]);
    expect(domainRetirementState(legacy)).toBe("unknown");
  });

  it("offers verification for unretired failed domains only", () => {
    expect(
      canRequestDomainVerification({ ...source, verification_status: "failed" }),
    ).toBe(true);
    expect(canRequestDomainVerification(source)).toBe(false);
    expect(
      canRequestDomainVerification({
        ...source,
        verification_status: "failed",
        pending_retirement_job_id: source.id,
      }),
    ).toBe(false);
  });
});
