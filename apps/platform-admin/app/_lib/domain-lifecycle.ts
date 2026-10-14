import type { Database } from "@wlbp/supabase-client";
import { z } from "zod";

/** Additive private read fields: absence means the older backend did not report them. */
export const domainRetirementMetadataSchema = z
  .object({
    retired_at: z.string().datetime({ offset: true }).nullable().optional(),
    replacement_domain_id: z.string().uuid().nullable().optional(),
    pending_retirement_job_id: z.string().uuid().nullable().optional(),
  })
  .passthrough();
export type DomainRetirementMetadata = Pick<
  z.output<typeof domainRetirementMetadataSchema>,
  "retired_at" | "replacement_domain_id" | "pending_retirement_job_id"
>;
export type DomainListRow = Omit<
  Database["api_v1"]["Functions"]["list_domains_v1"]["Returns"][number],
  keyof DomainRetirementMetadata
> &
  DomainRetirementMetadata;
export type RetirementDomain = DomainRetirementMetadata & {
  id: string;
  hostname: string;
  application: string;
  kind: string;
  verification_status: string;
  active: boolean;
  instance_id: string;
  tenant_id: string;
};

const domainReadFields = {
  hostname: z.string(),
  instance_id: z.string().uuid(),
  application: z.string(),
  kind: z.string(),
  verification_status: z.string(),
  active: z.boolean(),
};
const directoryDomainSchema = domainRetirementMetadataSchema.extend({
  ...domainReadFields,
  domain_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
});
const tenantDomainSchema = domainRetirementMetadataSchema.extend({
  ...domainReadFields,
  id: z.string().uuid(),
});

/** Validate new fields without stripping existing table/tenant fields or inventing defaults. */
export function validateDomainRead(fn: string, data: unknown): void {
  if (fn === "list_domains_v1") z.array(directoryDomainSchema).parse(data);
  if (fn === "get_tenant_v1")
    z.object({ domains: z.array(tenantDomainSchema) }).parse(data);
}

export function domainRetirementState(
  domain: DomainRetirementMetadata,
): "retired" | "not_retired" | "unknown" {
  if (domain.retired_at === undefined) return "unknown";
  return domain.retired_at === null ? "not_retired" : "retired";
}

export function canRequestDomainVerification(
  domain: DomainRetirementMetadata & { verification_status: string },
): boolean {
  return (
    domainRetirementState(domain) !== "retired" &&
    !domain.pending_retirement_job_id &&
    domain.verification_status !== "verified"
  );
}

/** Presentation choices only; the retirement request and independent decision revalidate live SQL state. */
export function eligibleDomainReplacements<T extends RetirementDomain>(
  domain: RetirementDomain,
  candidates: readonly T[],
): T[] {
  if (domainRetirementState(domain) === "retired") return [];
  return candidates.filter(
    (candidate) =>
      domainRetirementState(candidate) === "not_retired" &&
      !candidate.pending_retirement_job_id &&
      candidate.id !== domain.id &&
      candidate.tenant_id === domain.tenant_id &&
      candidate.instance_id === domain.instance_id &&
      candidate.application === domain.application &&
      candidate.kind === "production" &&
      candidate.verification_status === "verified",
  );
}
