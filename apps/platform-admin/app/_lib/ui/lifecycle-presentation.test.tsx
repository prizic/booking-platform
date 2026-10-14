import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../operator-page", () => ({
  atLeast: (role: string, minimum: string) => {
    const rank: Record<string, number> = {
      viewer: 0,
      operator: 1,
      admin: 2,
      break_glass: 3,
    };
    return rank[role]! >= rank[minimum]!;
  },
}));
// These tests inspect server-owned availability and copy. Parent E2E exercises
// the real dialogs, schema validation, step-up and authoritative RPC decisions.
vi.mock("./action-dialog", () => ({
  ActionDialog: ({ trigger, operation }: { trigger: string; operation: string }) => (
    <span data-operation={operation}>{trigger}</span>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/en/tenants/synthetic",
}));
vi.mock("./operator-form", () => ({
  OperatorForm: () => <span>unexpected-form</span>,
}));
import { DomainRetirementDialog } from "./domain-actions";
import { InstanceLifecycle } from "./instance-lifecycle";
import { ReviewDetails } from "./review-details";
import {
  LifecycleSection,
  SubscriptionSection,
  type TenantDetail,
} from "../../[locale]/(console)/tenants/[tenantId]/sections";

const id = "d3000000-0000-4000-8000-000000000136";
const operator = {
  operatorId: id,
  role: "admin" as const,
  email: "synthetic@example.invalid",
  expiresAt: null,
  stepUpSeconds: 900,
};
const config = {
  instance_id: id,
  tenant_id: id,
  display_name: null,
  revision: 0,
  deployment_state: "suspended" as const,
};
const domain = {
  id,
  tenant_id: id,
  instance_id: id,
  hostname: "synthetic.example.invalid",
  application: "client",
  kind: "production",
  active: false,
  verification_status: "verified",
  retired_at: null,
};
const detail = {
  tenant: {
    id,
    name: "Synthetic",
    status: "suspended",
    created_at: "2026-10-13T08:00:00Z",
    updated_at: "2026-10-13T08:00:00Z",
  },
  brands: [],
  subscription: null,
  plan: null,
  entitlements: [],
  domains: [],
  instances: [],
  provisioning_runs: [],
  jobs: [],
  support_grants: [],
  audit: [],
} satisfies TenantDetail;

describe("lifecycle presentation refuses misleading controls", () => {
  it("a retired route has no retirement control; pending retirement links to its specific review", () => {
    const retired = renderToStaticMarkup(
      <DomainRetirementDialog
        locale="en"
        domain={{ ...domain, retired_at: "2026-10-13T08:00:00Z" }}
        domains={[]}
      />,
    );
    expect(retired).toBe("");
    const pending = renderToStaticMarkup(
      <DomainRetirementDialog
        locale="en"
        domain={{ ...domain, pending_retirement_job_id: id }}
        domains={[]}
      />,
    );
    expect(pending).toContain(`href="/en/review/job/${id}"`);
    expect(pending).not.toContain("Retire domain");
  });

  it.each(["en", "ar"] as const)(
    "instance closure is unavailable when prerequisite reads failed in %s",
    (locale) => {
      const missing = renderToStaticMarkup(
        <InstanceLifecycle
          locale={locale}
          config={config}
          operator={operator}
          tenantStatus="suspended"
          pendingJobs={undefined}
        />,
      );
      const ready = renderToStaticMarkup(
        <InstanceLifecycle
          locale={locale}
          config={config}
          operator={operator}
          tenantStatus="suspended"
          pendingJobs={[]}
        />,
      );
      expect(missing).not.toContain('data-operation="requestInstanceClosure"');
      expect(ready).toContain('data-operation="requestInstanceClosure"');
    },
  );

  it("closed instances retain configuration and never show edit/deactivate/closure actions", () => {
    const html = renderToStaticMarkup(
      <InstanceLifecycle
        locale="en"
        config={{ ...config, deployment_state: "closed" }}
        operator={operator}
        tenantStatus="suspended"
        pendingJobs={[]}
      />,
    );
    expect(html).toContain("Instance configuration");
    expect(html).toContain("retained for inspection");
    for (const label of ["Edit configuration", "Deactivate", "Request closure"])
      expect(html).not.toContain(label);
  });

  it("tenant reactivation/closure uses complete closure data and preserves failed-read refusal", () => {
    const blocked = renderToStaticMarkup(
      <LifecycleSection
        locale="en"
        detail={detail}
        operator={operator}
        closureJobs={[{ id, status: "queued", needs_approval: true }]}
        closureErrorCode={undefined}
      />,
    );
    expect(blocked).not.toContain("Reactivate");
    expect(blocked).toContain(`href="/en/review/job/${id}"`);
    const failed = renderToStaticMarkup(
      <LifecycleSection
        locale="en"
        detail={detail}
        operator={operator}
        closureJobs={undefined}
        closureErrorCode="unavailable"
      />,
    );
    expect(failed).toContain('data-slot="error-state"');
    expect(failed).not.toContain("Reactivate");
  });

  it("a failed plan read is explicit and cannot open a plan assignment form", () => {
    const html = renderToStaticMarkup(
      <SubscriptionSection
        locale="en"
        detail={detail}
        operator={operator}
        plans={undefined}
        planErrorCode="unavailable"
      />,
    );
    expect(html).toContain('data-slot="error-state"');
    expect(html).not.toContain('data-operation="assignSubscription"');
  });

  it("Arabic review details localize state/action/scope and retain expiry and revocation evidence", () => {
    const html = renderToStaticMarkup(
      <ReviewDetails
        locale="ar"
        detail={{
          kind: "retire_domain",
          status: "queued",
          scope: "read",
          expires_at: "2026-10-13T09:00:00Z",
          revoked_at: "2026-10-13T08:30:00Z",
          provider_payload: "private-provider-payload",
        }}
      />,
    );
    expect(html).toContain("إيقاف مسار النطاق");
    expect(html).toContain("في قائمة الانتظار");
    expect(html).toContain("قراءة فقط");
    expect(html).toMatch(/datetime="2026-10-13T08:30:00Z"/iu);
    expect(html).not.toContain("private-provider-payload");
    expect(html).not.toContain(">queued<");
  });
});
