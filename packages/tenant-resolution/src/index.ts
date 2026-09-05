export type DeploymentState = "active" | "suspended" | "retired";

export type TenantApplication = "client" | "dashboard";

export type RuntimeEnvironment =
  "local" | "test" | "development" | "preview" | "production";

export interface RequestHeaders {
  get(name: string): string | null;
}

export interface RequestHostnameOptions {
  localFallback?: string;
  runtimeEnvironment?: RuntimeEnvironment;
  /** Hostname already authenticated by a deployment-specific proxy adapter. */
  trustedProxyHostname?: string;
}

export interface TenantDomainRecord {
  application: TenantApplication;
  brandId: string;
  configRevision: number;
  deploymentState: DeploymentState;
  domainVerified: boolean;
  featureRevision: number;
  hostname: string;
  instanceId: string;
  publishedBrandRevision: number;
  tenantId: string;
}

export type TenantContext = TenantDomainRecord;

export interface TenantDomainResolver {
  resolveByHostname(
    hostname: string,
    application: TenantApplication,
  ): Promise<TenantDomainRecord | null>;
}

const forbiddenHostnameCharacters = new Set("/@\\?#,;[]*");
const ipv4Address = /^(?:\d{1,3}\.){3}\d{1,3}$/u;
const dnsLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;

function invalidHostname(): never {
  throw new Error("Input is not a valid tenant domain");
}

function containsUnsafeCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return (
      codePoint <= 32 || codePoint === 127 || forbiddenHostnameCharacters.has(character)
    );
  });
}

export function normalizeHostname(input: string): string {
  let candidate = input.trim();

  if (!candidate || containsUnsafeCharacter(candidate)) {
    invalidHostname();
  }

  const colonIndex = candidate.lastIndexOf(":");
  if (colonIndex !== -1) {
    if (candidate.indexOf(":") !== colonIndex) {
      invalidHostname();
    }

    const port = candidate.slice(colonIndex + 1);
    if (!/^\d{1,5}$/u.test(port) || Number(port) > 65_535) {
      invalidHostname();
    }
    candidate = candidate.slice(0, colonIndex);
  }

  if (candidate.endsWith(".")) {
    candidate = candidate.slice(0, -1);
  }
  if (!candidate || candidate.includes("..")) {
    invalidHostname();
  }

  let hostname: string;
  try {
    const parsed = new URL(`https://${candidate}`);
    if (
      parsed.username ||
      parsed.password ||
      parsed.port ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      invalidHostname();
    }
    hostname = parsed.hostname.toLowerCase();
  } catch {
    invalidHostname();
  }

  if (
    hostname.length > 253 ||
    hostname.split(".").length < 2 ||
    ipv4Address.test(hostname) ||
    !hostname.split(".").every((label) => dnsLabel.test(label))
  ) {
    invalidHostname();
  }

  return hostname;
}

export function extractRequestHostname(
  headers: RequestHeaders,
  options: RequestHostnameOptions = {},
): string {
  const host = options.trustedProxyHostname ?? headers.get("host");
  const environment = options.runtimeEnvironment ?? "production";
  const localFallbackAllowed =
    environment === "local" || environment === "test" || environment === "development";

  if (host) {
    try {
      return normalizeHostname(host);
    } catch (error) {
      if (!options.localFallback || !localFallbackAllowed) throw error;
      return normalizeHostname(options.localFallback);
    }
  }

  if (options.localFallback && localFallbackAllowed) {
    return normalizeHostname(options.localFallback);
  }

  throw new Error("Missing request hostname");
}

function assertRevision(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("Invalid tenant cache scope revision");
  }
}

export async function resolveTenantContext(
  input: string,
  resolver: TenantDomainResolver,
  application: TenantApplication = "client",
): Promise<TenantContext> {
  const hostname = normalizeHostname(input);
  const record = await resolver.resolveByHostname(hostname, application);

  if (!record) {
    throw new Error("Unknown tenant hostname");
  }

  if (
    !record.domainVerified ||
    record.deploymentState !== "active" ||
    record.application !== application ||
    normalizeHostname(record.hostname) !== hostname ||
    !record.tenantId ||
    !record.brandId ||
    !record.instanceId
  ) {
    throw new Error("Hostname is not an active, verified tenant domain");
  }

  assertRevision(record.configRevision);
  assertRevision(record.featureRevision);
  assertRevision(record.publishedBrandRevision);

  return { ...record, hostname };
}

export interface TenantCacheScope {
  configRevision: number;
  featureRevision: number;
  locale: "ar" | "en";
  publishedBrandRevision: number;
  tenantId: string;
}

function cacheSegment(value: string): string {
  if (!value || containsUnsafeCharacter(value)) {
    throw new Error("Invalid cache scope segment");
  }
  return `${value.length}:${value}`;
}

export function buildTenantCacheKey(
  namespace: string,
  scope: TenantCacheScope,
  parts: readonly string[] = [],
): string {
  assertRevision(scope.publishedBrandRevision);
  assertRevision(scope.configRevision);
  assertRevision(scope.featureRevision);

  if (!scope.tenantId || !/^[a-z0-9_-]+$/iu.test(namespace)) {
    throw new Error("Invalid cache scope");
  }

  const segments = [
    namespace,
    scope.tenantId,
    scope.locale,
    String(scope.publishedBrandRevision),
    String(scope.configRevision),
    String(scope.featureRevision),
    ...parts,
  ];

  return `wlbp:v1:${segments.map(cacheSegment).join(":")}`;
}
