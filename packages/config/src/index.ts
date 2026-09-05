export interface BackendContractRange {
  readonly max: number;
  readonly min: number;
}

export interface PlatformContract {
  readonly backendContract: BackendContractRange;
  readonly configSchemaVersion: number;
  readonly whiteLabelVersion: string;
}

export type RuntimeEnvironment =
  "local" | "test" | "development" | "preview" | "production";

export interface PublicRuntimeConfig {
  readonly environment: RuntimeEnvironment;
  readonly supabasePublishableKey: string;
  readonly supabaseUrl: string;
}

export function parsePublicSiteOrigin(
  value: string | undefined,
  localFallback?: string,
): URL {
  const candidate = value?.trim() || localFallback;
  if (!candidate) {
    throw new Error("Public site URL is required");
  }
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("Public site URL is invalid");
  }

  const localHost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && localHost)) {
    throw new Error("Public site URL must use HTTPS outside local development");
  }
  if (
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error("Public site URL must be an origin without credentials or a path");
  }

  return new URL(url.origin);
}

export interface InstanceManifest {
  readonly backendContract: BackendContractRange;
  readonly configSchemaVersion: number;
  readonly defaultLocale: "en" | "ar";
  readonly instanceId: string;
  readonly supportedLocales: readonly ("en" | "ar")[];
  readonly tenantId: string;
  readonly whiteLabelVersion: string;
}

export interface FeatureSetting {
  readonly enabled: boolean;
  readonly configuration?: Readonly<Record<string, unknown>>;
}

export type FeatureConfiguration = Readonly<Record<string, FeatureSetting>>;
export type RuntimeEntitlements = Readonly<Record<string, boolean>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function parsePlatformContract(value: unknown): PlatformContract {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "whiteLabelVersion",
      "configSchemaVersion",
      "backendContract",
    ])
  ) {
    throw new Error("Platform contract must contain exactly three keys");
  }

  const backend = value.backendContract;
  if (!isRecord(backend) || !hasExactKeys(backend, ["min", "max"])) {
    throw new Error("Backend contract must contain exactly min and max");
  }

  if (
    typeof value.whiteLabelVersion !== "string" ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value.whiteLabelVersion) ||
    !isPositiveInteger(value.configSchemaVersion) ||
    !isPositiveInteger(backend.min) ||
    !isPositiveInteger(backend.max) ||
    backend.min > backend.max
  ) {
    throw new Error("Platform contract values are invalid");
  }

  return Object.freeze({
    whiteLabelVersion: value.whiteLabelVersion,
    configSchemaVersion: value.configSchemaVersion,
    backendContract: Object.freeze({ min: backend.min, max: backend.max }),
  });
}

export function parseInstanceManifest(value: unknown): InstanceManifest {
  const keys = [
    "tenantId",
    "instanceId",
    "whiteLabelVersion",
    "configSchemaVersion",
    "backendContract",
    "defaultLocale",
    "supportedLocales",
  ] as const;
  if (!isRecord(value) || !hasExactKeys(value, keys)) {
    throw new Error("Instance manifest has an unexpected shape");
  }

  const contract = parsePlatformContract({
    whiteLabelVersion: value.whiteLabelVersion,
    configSchemaVersion: value.configSchemaVersion,
    backendContract: value.backendContract,
  });
  const supportedLocales = value.supportedLocales;
  if (
    typeof value.tenantId !== "string" ||
    value.tenantId.trim() === "" ||
    typeof value.instanceId !== "string" ||
    value.instanceId.trim() === "" ||
    (value.defaultLocale !== "en" && value.defaultLocale !== "ar") ||
    !Array.isArray(supportedLocales) ||
    supportedLocales.length !== 2 ||
    !supportedLocales.includes("en") ||
    !supportedLocales.includes("ar") ||
    new Set(supportedLocales).size !== supportedLocales.length
  ) {
    throw new Error("Instance manifest values are invalid");
  }

  return Object.freeze({
    tenantId: value.tenantId,
    instanceId: value.instanceId,
    whiteLabelVersion: contract.whiteLabelVersion,
    configSchemaVersion: contract.configSchemaVersion,
    backendContract: contract.backendContract,
    defaultLocale: value.defaultLocale,
    supportedLocales: Object.freeze([...supportedLocales]) as readonly ("en" | "ar")[],
  });
}

const runtimeEnvironments: readonly RuntimeEnvironment[] = [
  "local",
  "test",
  "development",
  "preview",
  "production",
];

export function parsePublicRuntimeConfig(value: unknown): PublicRuntimeConfig {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["environment", "supabaseUrl", "supabasePublishableKey"])
  ) {
    throw new Error("Public runtime configuration has an unexpected shape");
  }

  if (
    typeof value.environment !== "string" ||
    !runtimeEnvironments.includes(value.environment as RuntimeEnvironment) ||
    typeof value.supabaseUrl !== "string" ||
    typeof value.supabasePublishableKey !== "string" ||
    value.supabasePublishableKey.trim() === ""
  ) {
    throw new Error("Public runtime configuration values are invalid");
  }

  let url: URL;
  try {
    url = new URL(value.supabaseUrl);
  } catch {
    throw new Error("Supabase URL is invalid");
  }

  const localHost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && localHost)) {
    throw new Error("Supabase URL must use HTTPS outside local development");
  }

  return Object.freeze({
    environment: value.environment as RuntimeEnvironment,
    supabasePublishableKey: value.supabasePublishableKey,
    supabaseUrl: url.toString().replace(/\/$/, ""),
  });
}

export function isFeatureEnabled(
  featureKey: string,
  localConfiguration: FeatureConfiguration,
  runtimeEntitlements: RuntimeEntitlements,
): boolean {
  return (
    runtimeEntitlements[featureKey] === true &&
    localConfiguration[featureKey]?.enabled === true
  );
}

export type ApplicationIdentity = "client" | "dashboard" | "platform-admin";

export interface PublicReleaseIdentity extends PlatformContract {
  readonly application: ApplicationIdentity;
  readonly buildCommit: string;
  readonly releaseId: string;
  readonly schemaVersion: 1;
}

const fullGitCommitPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

export function createPublicReleaseIdentity(
  application: ApplicationIdentity,
  platformContractValue: unknown,
  commitCandidates: readonly (string | undefined)[],
): PublicReleaseIdentity {
  const contract = parsePlatformContract(platformContractValue);
  const buildCommit =
    commitCandidates.find(
      (candidate): candidate is string =>
        typeof candidate === "string" && fullGitCommitPattern.test(candidate),
    ) ?? "local";

  return Object.freeze({
    schemaVersion: 1,
    application,
    releaseId: `tenant-runtime-v${contract.whiteLabelVersion}`,
    buildCommit,
    ...contract,
  });
}

export interface ContentSecurityPolicyOptions {
  readonly connectSources?: readonly string[];
  readonly development?: boolean;
}

export function createContentSecurityPolicy(
  nonce: string,
  options: ContentSecurityPolicyOptions = {},
): string {
  if (!/^[A-Za-z0-9+/_=-]+$/u.test(nonce) || nonce.length < 16) {
    throw new Error("Content security policy nonce is invalid");
  }

  const connectSources = new Set<string>();
  for (const source of options.connectSources ?? []) {
    const url = new URL(source);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("Content security policy connect source must use HTTP(S)");
    }
    connectSources.add(url.origin);
    connectSources.add(`${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`);
  }
  const developmentScriptSource = options.development === true ? " 'unsafe-eval'" : "";
  const extraConnectSources =
    connectSources.size === 0 ? "" : ` ${[...connectSources].join(" ")}`;

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${developmentScriptSource}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${extraConnectSources}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "worker-src 'self' blob:",
  ].join("; ");
}
