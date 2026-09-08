import {
  parseDashboardContextV1,
  parseTenantChoicesV1,
  type AvailabilityV1Request,
  type AvailabilityV1Response,
  type BookingDecisionV1Request,
  type BookingDecisionV1Response,
  type BookingRequestV1,
  type DashboardContextV1,
  type ResolvePublicTenantV1Response,
  type TenantChoiceV1,
} from "@wlbp/api-contracts";
import type { VerifiedIdentity } from "@wlbp/auth";
import { buildTenantCacheKey, normalizeHostname } from "@wlbp/tenant-resolution";

export interface DashboardDataSource {
  getDashboardContext(tenantId: string): Promise<unknown>;
  getVerifiedIdentity(): Promise<VerifiedIdentity | null>;
  listTenantChoices(): Promise<unknown>;
  resolveTenant(hostname: string): Promise<ResolvePublicTenantV1Response | null>;
  getScheduleWorkspace?: (tenantId: string, locationId?: string) => Promise<unknown>;
  getAvailability?: (
    hostname: string,
    request: AvailabilityV1Request,
  ) => Promise<AvailabilityV1Response>;
  saveScheduleConfig?: (request: {
    tenantId: string;
    operation: string;
    payload: Readonly<Record<string, unknown>>;
    expectedRevision: number | null;
  }) => Promise<unknown>;
  listBookingRequests?: (tenantId: string) => Promise<readonly BookingRequestV1[]>;
  decideBookingRequest?: (
    request: BookingDecisionV1Request,
  ) => Promise<BookingDecisionV1Response>;
}

export type DashboardAccessState =
  | {
      readonly cacheScopeKey: string;
      readonly context: DashboardContextV1;
      readonly choices: readonly TenantChoiceV1[];
      readonly identity: VerifiedIdentity;
      readonly kind: "ready";
    }
  | { readonly kind: "unauthenticated" }
  | {
      readonly choices: readonly TenantChoiceV1[];
      readonly kind: "selection-required";
    }
  | {
      readonly kind: "denied";
      readonly reason:
        | "backend_unavailable"
        | "invalid_host"
        | "membership_inactive"
        | "tenant_context_mismatch";
    };

export interface LoadDashboardAccessInput {
  readonly hostname: string;
  readonly locale: "ar" | "en";
  /** Untrusted browser preference. It never grants access. */
  readonly selectedTenantId?: string;
}

export async function loadDashboardAccess(
  input: LoadDashboardAccessInput,
  source: DashboardDataSource,
): Promise<DashboardAccessState> {
  let hostname: string;
  try {
    hostname = normalizeHostname(input.hostname);
  } catch {
    return { kind: "denied", reason: "invalid_host" };
  }

  try {
    const identity = await source.getVerifiedIdentity();
    if (identity === null) return { kind: "unauthenticated" };

    const [resolvedTenant, rawChoices] = await Promise.all([
      source.resolveTenant(hostname),
      source.listTenantChoices(),
    ]);
    if (resolvedTenant === null) {
      return { kind: "denied", reason: "invalid_host" };
    }

    const choices = parseTenantChoicesV1(rawChoices);
    if (choices.length === 0) {
      return { kind: "denied", reason: "membership_inactive" };
    }
    const hostnameChoice = choices.find(
      (choice) => normalizeHostname(choice.dashboardHostname) === hostname,
    );
    if (
      input.selectedTenantId === undefined &&
      choices.length > 1 &&
      hostnameChoice === undefined
    ) {
      return { kind: "selection-required", choices };
    }

    const selectedTenantId =
      input.selectedTenantId ?? hostnameChoice?.tenantId ?? choices[0]?.tenantId;
    const selectedChoice = choices.find(
      (choice) => choice.tenantId === selectedTenantId,
    );
    if (
      selectedChoice === undefined ||
      selectedChoice.tenantId !== resolvedTenant.tenantId ||
      normalizeHostname(selectedChoice.dashboardHostname) !== hostname
    ) {
      return { kind: "denied", reason: "tenant_context_mismatch" };
    }

    const context = parseDashboardContextV1(
      await source.getDashboardContext(selectedChoice.tenantId),
    );
    if (
      context.tenantId !== resolvedTenant.tenantId ||
      context.instanceId !== resolvedTenant.instanceId ||
      normalizeHostname(context.dashboardHostname) !== hostname ||
      context.publishedBrandRevision !== resolvedTenant.publishedBrandRevision ||
      context.configRevision !== resolvedTenant.configRevision ||
      context.featureRevision !== resolvedTenant.featureRevision
    ) {
      return { kind: "denied", reason: "tenant_context_mismatch" };
    }

    return {
      cacheScopeKey: buildTenantCacheKey("dashboard-context", {
        tenantId: context.tenantId,
        locale: input.locale,
        publishedBrandRevision: context.publishedBrandRevision,
        configRevision: context.configRevision,
        featureRevision: context.featureRevision,
      }),
      choices,
      context,
      identity,
      kind: "ready",
    };
  } catch {
    return { kind: "denied", reason: "backend_unavailable" };
  }
}
