export type DeploymentState = "provisioning" | "active" | "suspended" | "closed";

export interface TenantDomainRecord {
  readonly brandId: string;
  readonly deploymentState: DeploymentState;
  readonly domainVerified: boolean;
  readonly hostname: string;
  readonly instanceId: string;
  readonly publishedBrandRevision: number;
  readonly tenantId: string;
}

export interface TenantDomainResolver {
  readonly resolveByHostname: (hostname: string) => Promise<TenantDomainRecord | null>;
}

export interface TenantContext {
  readonly brandId: string;
  readonly hostname: string;
  readonly instanceId: string;
  readonly publishedBrandRevision: number;
  readonly tenantId: string;
}

const ipv4Pattern = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const domainLabelPattern = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

export function normalizeHostname(input: string): string {
  const candidate = input.trim();

  if (candidate === "" || /[\s/@\\?#]/.test(candidate)) {
    throw new Error("Hostname is not a valid tenant domain");
  }

  let hostname: string;
  try {
    hostname = new URL(`https://${candidate}`).hostname
      .toLowerCase()
      .replace(/\.$/, "");
  } catch {
    throw new Error("Hostname is not a valid tenant domain");
  }

  const labels = hostname.split(".");
  if (
    hostname.length > 253 ||
    labels.length < 2 ||
    ipv4Pattern.test(hostname) ||
    labels.some((label) => !domainLabelPattern.test(label))
  ) {
    throw new Error("Hostname is not a valid tenant domain");
  }

  return hostname;
}

export async function resolveTenantContext(
  input: string,
  resolver: TenantDomainResolver,
): Promise<TenantContext> {
  const hostname = normalizeHostname(input);
  const record = await resolver.resolveByHostname(hostname);

  if (
    record === null ||
    !record.domainVerified ||
    record.deploymentState !== "active" ||
    !Number.isSafeInteger(record.publishedBrandRevision) ||
    record.publishedBrandRevision < 1 ||
    [record.tenantId, record.brandId, record.instanceId].some(
      (id) => id.trim() === "",
    ) ||
    normalizeHostname(record.hostname) !== hostname
  ) {
    throw new Error("Hostname did not resolve to an active, verified tenant domain");
  }

  return Object.freeze({
    brandId: record.brandId,
    hostname,
    instanceId: record.instanceId,
    publishedBrandRevision: record.publishedBrandRevision,
    tenantId: record.tenantId,
  });
}
