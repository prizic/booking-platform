/** Version carried by the api_v1 DTOs in this module, not the deployed range. */
export const apiV1ContractVersion = 1 as const;
export type BackendContractVersion = typeof apiV1ContractVersion;

export type TenantId = string;
export type BrandId = string;
export type InstanceId = string;
export type LocationId = string;
export type BookingId = string;
export type IdempotencyKey = string;
export type ContractLocale = "en" | "ar";

export const capabilityNames = [
  "booking.view.own",
  "booking.view.any",
  "booking.create_on_behalf",
  "booking.approve",
  "booking.reschedule",
  "booking.cancel",
  "refund.issue",
  "booking.check_in",
  "booking.check_in_override",
  "booking.mark_no_show",
  "booking.complete",
  "booking.correct_status",
  "catalog.edit",
  "schedule.edit",
  "staff.manage",
  "policy.edit",
  "customer.pii.view",
  "customer.data.export",
  "customer.data.export_on_behalf",
  "customer.data.correct",
  "customer.data.delete",
  "customer.data.restrict",
  "brand.manage",
  "integration.manage",
  "billing.view",
  "billing.change_plan",
  "support.grant_access",
  "audit.read",
  "instance.request_update",
  "tenant.owner_transfer",
  "tenant.read_other_tenant",
] as const;

export type CapabilityName = (typeof capabilityNames)[number];
export type CapabilityScope = "location" | "own" | "tenant";

export interface CapabilityGrantDto {
  readonly capability: CapabilityName;
  readonly requiresApproval: boolean;
  readonly scope: CapabilityScope;
}

export type LocationScopeDto =
  | { readonly kind: "all" }
  | { readonly kind: "restricted"; readonly locationIds: readonly LocationId[] };

export interface MoneyDto {
  readonly currency: string;
  readonly minorUnits: number;
}

export type ContractErrorCode =
  | "slot_unavailable"
  | "capacity_exhausted"
  | "policy_denied"
  | "revision_conflict"
  | "payment_pending"
  | "idempotency_conflict"
  | "not_authenticated"
  | "not_authorized"
  | "tenant_selection_required"
  | "tenant_context_mismatch"
  | "membership_inactive"
  | "location_scope_denied"
  | "mfa_required"
  | "invalid_request";

export interface ContractError {
  readonly code: ContractErrorCode;
  readonly correlationId: string;
  readonly messageKey: string;
  readonly retryable: boolean;
}

export type ContractResult<T> =
  | { readonly ok: true; readonly data: T; readonly contractVersion: 1 }
  | { readonly ok: false; readonly error: ContractError; readonly contractVersion: 1 };

export type BookingStatusDto =
  | "held"
  | "requested"
  | "pending_payment"
  | "confirmed"
  | "checked_in"
  | "completed"
  | "cancelled"
  | "no_show"
  | "rejected"
  | "expired";
export type PaymentStatusDto =
  "requires_payment" | "processing" | "succeeded" | "failed" | "cancelled" | "disputed";
export type PaymentProviderDto = "stripe" | (string & {});
export type PaymentAccountStatusDto =
  | "connected"
  | "requirements_due"
  | "restricted"
  | "suspended"
  | "disconnected"
  | "error";
export interface PaymentAccountStatusV1 {
  readonly provider: PaymentProviderDto;
  readonly providerAccountReference: string;
  readonly status: PaymentAccountStatusDto;
  readonly chargesEnabled: boolean;
  readonly payoutsEnabled: boolean;
  readonly requirements: readonly string[];
  readonly capabilities: Readonly<Record<string, "active" | "pending" | "inactive">>;
}
export interface BookingPaymentV1 {
  readonly paymentId: string;
  readonly bookingId: BookingId;
  readonly amount: MoneyDto;
  readonly status: PaymentStatusDto;
}
export interface BookingRefundV1 {
  readonly refundId: string;
  readonly paymentId: string;
  readonly amount: MoneyDto;
  readonly status: RefundStatusDto;
}
export type RefundStatusDto =
  "eligible" | "pending" | "succeeded" | "failed" | "manual_review";
export type NotificationStatusDto =
  "queued" | "sending" | "delivered" | "bounced" | "complained" | "failed";
export type CalendarExportStatusDto = "pending" | "generated" | "stale";

export interface ResolvePublicTenantV1Request {
  readonly application: "client" | "dashboard";
  readonly hostname: string;
}

export interface ResolvePublicTenantV1Response {
  readonly brandId: BrandId;
  readonly configRevision: number;
  readonly deploymentState: "active";
  readonly featureRevision: number;
  readonly hostname: string;
  readonly instanceId: InstanceId;
  readonly publishedBrandRevision: number;
  readonly tenantId: TenantId;
}

export interface TenantChoiceV1 {
  readonly dashboardHostname: string;
  readonly membershipId: string;
  readonly roleKey: string;
  readonly tenantId: TenantId;
  readonly tenantName: string;
}

export interface DashboardContextV1 {
  readonly aal2: boolean;
  readonly brandId: BrandId;
  readonly configRevision: number;
  readonly dashboardHostname: string;
  readonly defaultLocale: ContractLocale;
  readonly featureRevision: number;
  readonly grants: readonly CapabilityGrantDto[];
  readonly instanceId: InstanceId;
  readonly locationIds: readonly LocationId[];
  readonly locationScope: LocationScopeDto;
  readonly membershipId: string;
  readonly publishedBrandRevision: number;
  readonly roleKey: string;
  readonly tenantId: TenantId;
  readonly tenantName: string;
}

/** Customer-safe catalog projection. It intentionally has no intake schema,
 * internal notes, authorization fields, or raw tenant-table shape. */
export interface PublicCatalogItemV1 {
  readonly tenantId: TenantId;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly locale: ContractLocale;
  readonly serviceId: string;
  readonly serviceKey: string;
  readonly categoryKey: string | null;
  readonly serviceName: string;
  readonly serviceDescription: string;
  readonly canonicalPath: string;
  readonly durationMinutes: number;
  readonly bufferBeforeMinutes: number;
  readonly bufferAfterMinutes: number;
  readonly price: MoneyDto;
  readonly taxRateBps: number;
  readonly capacityMode: "exclusive" | "group";
  readonly bookingMode: "appointment" | "exclusive_resource";
  readonly approvalRequired: boolean;
  readonly paymentMode: "none" | "deposit" | "full";
  readonly locationId: LocationId;
  readonly locationKey: string;
  readonly locationName: string;
  readonly locationDescription: string;
  readonly locationAddress: string;
  readonly locationTimeZone: string;
  readonly locationCanonicalPath: string;
  readonly cacheTag: string;
}

export function parsePublicCatalogV1(value: unknown): readonly PublicCatalogItemV1[] {
  if (!Array.isArray(value)) throw new Error("Public catalog must be an array");
  return Object.freeze(
    value.map((item) => {
      if (!isRecord(item)) throw new Error("Public catalog item is invalid");
      const stringKeys = [
        "tenantId",
        "publicationId",
        "locale",
        "serviceId",
        "serviceKey",
        "serviceName",
        "serviceDescription",
        "canonicalPath",
        "locationId",
        "locationKey",
        "locationName",
        "locationDescription",
        "locationAddress",
        "locationTimeZone",
        "locationCanonicalPath",
        "cacheTag",
      ];
      for (const key of stringKeys)
        if (key !== "locale" && (typeof item[key] !== "string" || item[key] === ""))
          throw new Error("Public catalog string is invalid");
      if (item.locale !== "en" && item.locale !== "ar")
        throw new Error("Public catalog locale is invalid");
      if (item.categoryKey !== null && typeof item.categoryKey !== "string")
        throw new Error("Public catalog category is invalid");
      const positive = ["publicationRevision", "durationMinutes"];
      for (const key of positive)
        if (
          typeof item[key] !== "number" ||
          !Number.isSafeInteger(item[key]) ||
          item[key] < 1
        )
          throw new Error("Public catalog number is invalid");
      for (const key of ["bufferBeforeMinutes", "bufferAfterMinutes", "taxRateBps"])
        if (
          typeof item[key] !== "number" ||
          !Number.isSafeInteger(item[key]) ||
          item[key] < 0
        )
          throw new Error("Public catalog value is invalid");
      if (
        typeof item.price !== "object" ||
        item.price === null ||
        typeof (item.price as Record<string, unknown>).currency !== "string" ||
        typeof (item.price as Record<string, unknown>).minorUnits !== "number" ||
        !Number.isSafeInteger((item.price as Record<string, unknown>).minorUnits)
      )
        throw new Error("Public catalog price is invalid");
      if (
        !(["exclusive", "group"] as unknown[]).includes(item.capacityMode) ||
        !(["appointment", "exclusive_resource"] as unknown[]).includes(
          item.bookingMode,
        ) ||
        !(["none", "deposit", "full"] as unknown[]).includes(item.paymentMode) ||
        typeof item.approvalRequired !== "boolean"
      )
        throw new Error("Public catalog rules are invalid");
      return Object.freeze(item as unknown as PublicCatalogItemV1);
    }),
  );
}

export interface AvailabilityV1Request {
  readonly locale: ContractLocale;
  readonly locationId: LocationId;
  readonly partySize: number;
  readonly serviceId: string;
  readonly startAfter: string;
  readonly timeZone: string;
}
export interface AvailabilitySlotV1 {
  readonly endAt: string;
  readonly resourceIds: readonly string[];
  readonly startAt: string;
  readonly timeZone: string;
}
export interface CreateHoldV1Request {
  readonly idempotencyKey: IdempotencyKey;
  readonly locale: ContractLocale;
  readonly locationId: LocationId;
  readonly partySize: number;
  readonly serviceId: string;
  readonly startAt: string;
}
export interface CreateHoldV1Response {
  readonly expiresAt: string;
  readonly holdId: string;
  readonly price: MoneyDto;
}
export interface BookingSummaryV1 {
  readonly bookingId: BookingId;
  readonly calendarStatus: CalendarExportStatusDto;
  readonly notificationStatus: NotificationStatusDto;
  readonly paymentStatus: PaymentStatusDto;
  readonly publicReference: string;
  readonly status: BookingStatusDto;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function requireNonEmptyString(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("Expected a non-empty string");
  }
  return value;
}

function requirePositiveRevision(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error("Expected a positive revision");
  }
  return value;
}

function parseGrant(value: unknown): CapabilityGrantDto {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["capability", "requiresApproval", "scope"])
  ) {
    throw new Error("Capability grant has an unexpected shape");
  }
  if (
    typeof value.capability !== "string" ||
    !capabilityNames.includes(value.capability as CapabilityName) ||
    typeof value.requiresApproval !== "boolean" ||
    (value.scope !== "tenant" && value.scope !== "location" && value.scope !== "own")
  ) {
    throw new Error("Capability grant is invalid");
  }
  return Object.freeze({
    capability: value.capability as CapabilityName,
    requiresApproval: value.requiresApproval,
    scope: value.scope,
  });
}

function parseLocationScope(value: unknown): LocationScopeDto {
  if (!isRecord(value) || typeof value.kind !== "string") {
    throw new Error("Location scope is invalid");
  }
  if (value.kind === "all" && hasExactKeys(value, ["kind"])) {
    return Object.freeze({ kind: "all" });
  }
  if (
    value.kind === "restricted" &&
    hasExactKeys(value, ["kind", "locationIds"]) &&
    Array.isArray(value.locationIds) &&
    value.locationIds.every(
      (locationId) => typeof locationId === "string" && locationId.trim() !== "",
    )
  ) {
    return Object.freeze({
      kind: "restricted",
      locationIds: Object.freeze([...value.locationIds]),
    });
  }
  throw new Error("Location scope is invalid");
}

export function parseTenantChoicesV1(value: unknown): readonly TenantChoiceV1[] {
  if (!Array.isArray(value)) throw new Error("Tenant choices must be an array");
  return Object.freeze(
    value.map((choice) => {
      if (
        !isRecord(choice) ||
        !hasExactKeys(choice, [
          "dashboardHostname",
          "membershipId",
          "roleKey",
          "tenantId",
          "tenantName",
        ])
      ) {
        throw new Error("Tenant choice has an unexpected shape");
      }
      return Object.freeze({
        dashboardHostname: requireNonEmptyString(choice.dashboardHostname),
        membershipId: requireNonEmptyString(choice.membershipId),
        roleKey: requireNonEmptyString(choice.roleKey),
        tenantId: requireNonEmptyString(choice.tenantId),
        tenantName: requireNonEmptyString(choice.tenantName),
      });
    }),
  );
}

export function parseDashboardContextV1(value: unknown): DashboardContextV1 {
  const keys = [
    "aal2",
    "brandId",
    "configRevision",
    "dashboardHostname",
    "defaultLocale",
    "featureRevision",
    "grants",
    "instanceId",
    "locationIds",
    "locationScope",
    "membershipId",
    "publishedBrandRevision",
    "roleKey",
    "tenantId",
    "tenantName",
  ] as const;
  if (!isRecord(value) || !hasExactKeys(value, keys)) {
    throw new Error("Dashboard context has an unexpected shape");
  }
  if (!Array.isArray(value.grants) || !Array.isArray(value.locationIds)) {
    throw new Error("Dashboard context collections are invalid");
  }
  const locationIds = value.locationIds.map(requireNonEmptyString);
  if (
    typeof value.aal2 !== "boolean" ||
    (value.defaultLocale !== "en" && value.defaultLocale !== "ar")
  ) {
    throw new Error("Dashboard context values are invalid");
  }
  return Object.freeze({
    aal2: value.aal2,
    brandId: requireNonEmptyString(value.brandId),
    configRevision: requirePositiveRevision(value.configRevision),
    dashboardHostname: requireNonEmptyString(value.dashboardHostname),
    defaultLocale: value.defaultLocale,
    featureRevision: requirePositiveRevision(value.featureRevision),
    grants: Object.freeze(value.grants.map(parseGrant)),
    instanceId: requireNonEmptyString(value.instanceId),
    locationIds: Object.freeze(locationIds),
    locationScope: parseLocationScope(value.locationScope),
    membershipId: requireNonEmptyString(value.membershipId),
    publishedBrandRevision: requirePositiveRevision(value.publishedBrandRevision),
    roleKey: requireNonEmptyString(value.roleKey),
    tenantId: requireNonEmptyString(value.tenantId),
    tenantName: requireNonEmptyString(value.tenantName),
  });
}

export function parseResolvePublicTenantV1(
  value: unknown,
): ResolvePublicTenantV1Response {
  const keys = [
    "brandId",
    "configRevision",
    "deploymentState",
    "featureRevision",
    "hostname",
    "instanceId",
    "publishedBrandRevision",
    "tenantId",
  ] as const;
  if (!isRecord(value) || !hasExactKeys(value, keys)) {
    throw new Error("Resolved tenant has an unexpected shape");
  }
  if (value.deploymentState !== "active") {
    throw new Error("Resolved tenant is inactive");
  }
  return Object.freeze({
    brandId: requireNonEmptyString(value.brandId),
    configRevision: requirePositiveRevision(value.configRevision),
    deploymentState: value.deploymentState,
    featureRevision: requirePositiveRevision(value.featureRevision),
    hostname: requireNonEmptyString(value.hostname),
    instanceId: requireNonEmptyString(value.instanceId),
    publishedBrandRevision: requirePositiveRevision(value.publishedBrandRevision),
    tenantId: requireNonEmptyString(value.tenantId),
  });
}
