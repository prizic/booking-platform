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
  | "checkout_not_ready"
  | "idempotency_conflict"
  | "not_authenticated"
  | "not_authorized"
  | "tenant_selection_required"
  | "tenant_context_mismatch"
  | "membership_inactive"
  | "location_scope_denied"
  | "mfa_required"
  | "availability_unavailable"
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
  | "not_required"
  | "requires_payment"
  | "processing"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "disputed";
const paymentStatuses = [
  "not_required",
  "requires_payment",
  "processing",
  "succeeded",
  "failed",
  "cancelled",
  "disputed",
] as const;
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
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "bounced"
  | "complained"
  | "failed"
  | "suppressed";
const notificationStatuses = [
  "queued",
  "sending",
  // Handed to the provider and awaiting its callback. `delivered` is the
  // provider's own confirmation, and the two are never conflated.
  "sent",
  "delivered",
  "bounced",
  "complained",
  "failed",
  "suppressed",
] as const;
export type CalendarExportStatusDto = "pending" | "generated" | "stale";
const calendarExportStatuses = ["pending", "generated", "stale"] as const;

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

export type ScheduleOperationV1 =
  | "scope"
  | "weekly"
  | "break"
  | "exception"
  | "time_off"
  | "holiday"
  | "blackout"
  | "maintenance"
  | "policy";

export interface ScheduleWorkspaceRowV1 {
  readonly kind:
    | "scope"
    | "weekly"
    | "break"
    | "exception"
    | "time_off"
    | "holiday"
    | "blackout"
    | "maintenance"
    | "policy";
  readonly id: string;
  readonly scopeId: string | null;
  readonly locationId: string | null;
  readonly staffId: string | null;
  readonly resourceId: string | null;
  readonly localDate: string | null;
  readonly dayOfWeek: number | null;
  readonly startMinute: number | null;
  readonly endMinute: number | null;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly exceptionKind: "closed" | "override" | null;
  readonly timeZone: string | null;
  readonly reason: string | null;
  readonly policyKey: string | null;
  readonly value: number | null;
  readonly revision: number;
}

export interface SaveScheduleConfigV1Request {
  readonly tenantId: TenantId;
  readonly operation: ScheduleOperationV1;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly expectedRevision: number | null;
}

export interface SaveScheduleConfigV1Response {
  readonly targetId: string;
  readonly revision: number;
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

/** Customer-safe assignment choices; internal notes and authorization are
 * deliberately absent. */
export interface AssignmentCandidateV1 {
  readonly assignmentMode:
    "fixed_staff" | "customer_choice" | "any_available" | "round_robin";
  readonly candidateRank: number;
  readonly staffId: string | null;
  readonly staffName: string | null;
  readonly resourceId: string | null;
  readonly resourceName: string | null;
}

export function parseAssignmentCandidatesV1(
  value: unknown,
): readonly AssignmentCandidateV1[] {
  if (!Array.isArray(value)) throw new Error("Assignment candidates must be an array");

  const keys = [
    "assignmentMode",
    "candidateRank",
    "resourceId",
    "resourceName",
    "staffId",
    "staffName",
  ] as const;

  return Object.freeze(
    value.map((candidate) => {
      if (!isRecord(candidate) || !hasExactKeys(candidate, keys)) {
        throw new Error("Assignment candidate has an unexpected shape");
      }
      if (
        !["fixed_staff", "customer_choice", "any_available", "round_robin"].includes(
          candidate.assignmentMode as string,
        ) ||
        !Number.isSafeInteger(candidate.candidateRank) ||
        (candidate.candidateRank as number) < 1
      ) {
        throw new Error("Assignment candidate is invalid");
      }

      const hasStaff =
        typeof candidate.staffId === "string" &&
        candidate.staffId.trim() !== "" &&
        typeof candidate.staffName === "string" &&
        candidate.staffName.trim() !== "";
      const hasResource =
        typeof candidate.resourceId === "string" &&
        candidate.resourceId.trim() !== "" &&
        typeof candidate.resourceName === "string" &&
        candidate.resourceName.trim() !== "";
      const emptyStaff = candidate.staffId === null && candidate.staffName === null;
      const emptyResource =
        candidate.resourceId === null && candidate.resourceName === null;

      if (!((hasStaff && emptyResource) || (hasResource && emptyStaff))) {
        throw new Error("Assignment candidate identity is invalid");
      }

      return Object.freeze({
        assignmentMode:
          candidate.assignmentMode as AssignmentCandidateV1["assignmentMode"],
        candidateRank: candidate.candidateRank as number,
        resourceId: candidate.resourceId as string | null,
        resourceName: candidate.resourceName as string | null,
        staffId: candidate.staffId as string | null,
        staffName: candidate.staffName as string | null,
      });
    }),
  );
}

export interface StaffResourceWorkspaceItemV1 {
  readonly futureAllocationCount: number;
  readonly id: string;
  readonly internalNotes: string | null;
  readonly key: string | null;
  readonly kind: "resource" | "staff";
  readonly locationIds: readonly LocationId[];
  readonly membershipId: string | null;
  readonly name: string;
  readonly offeredHoursPerWeek: number | null;
  readonly publicBio: string | null;
  readonly resourceTypeId: string | null;
  readonly resourceTypeName: string | null;
  readonly revision: number | null;
  readonly serviceIds: readonly string[];
  readonly status: "active" | "deactivation_pending" | "inactive" | "maintenance";
}

export interface StaffResourceChoiceV1 {
  readonly id: string;
  readonly name: string;
}

export interface ResourceTypeChoiceV1 extends StaffResourceChoiceV1 {
  readonly exclusive: boolean;
  readonly key: string;
  readonly revision: number;
}

export interface StaffResourceWorkspaceV1 {
  readonly items: readonly StaffResourceWorkspaceItemV1[];
  readonly locations: readonly StaffResourceChoiceV1[];
  readonly resourceTypes: readonly ResourceTypeChoiceV1[];
  readonly services: readonly StaffResourceChoiceV1[];
  readonly tenantId: TenantId;
}

export interface StaffResourceDeactivationV1 {
  readonly outcome: "cancelled" | "deactivated" | "deferred" | "reassigned";
  readonly remainingAllocationCount: number;
  readonly targetId: string;
}

export function parseStaffResourceDeactivationV1(
  value: unknown,
): StaffResourceDeactivationV1 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["outcome", "remainingAllocationCount", "targetId"]) ||
    (value.outcome !== "cancelled" &&
      value.outcome !== "deactivated" &&
      value.outcome !== "deferred" &&
      value.outcome !== "reassigned") ||
    !Number.isSafeInteger(value.remainingAllocationCount) ||
    (value.remainingAllocationCount as number) < 0
  ) {
    throw new Error("Staff/resource deactivation result is invalid");
  }

  return Object.freeze({
    outcome: value.outcome,
    remainingAllocationCount: value.remainingAllocationCount as number,
    targetId: requireNonEmptyString(value.targetId),
  });
}

export function parseStaffResourceWorkspaceV1(
  value: unknown,
): StaffResourceWorkspaceV1 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "items",
      "locations",
      "resourceTypes",
      "services",
      "tenantId",
    ]) ||
    !Array.isArray(value.items) ||
    !Array.isArray(value.locations) ||
    !Array.isArray(value.resourceTypes) ||
    !Array.isArray(value.services)
  ) {
    throw new Error("Staff/resource workspace has an unexpected shape");
  }

  const items = value.items.map((item): StaffResourceWorkspaceItemV1 => {
    const keys = [
      "futureAllocationCount",
      "id",
      "internalNotes",
      "key",
      "kind",
      "locationIds",
      "membershipId",
      "name",
      "offeredHoursPerWeek",
      "publicBio",
      "resourceTypeId",
      "resourceTypeName",
      "revision",
      "serviceIds",
      "status",
    ] as const;
    if (
      !isRecord(item) ||
      !hasExactKeys(item, keys) ||
      (item.kind !== "staff" && item.kind !== "resource") ||
      (item.status !== "active" &&
        item.status !== "deactivation_pending" &&
        item.status !== "inactive" &&
        item.status !== "maintenance") ||
      (item.kind === "staff" && item.status === "maintenance") ||
      !Array.isArray(item.locationIds) ||
      !Array.isArray(item.serviceIds) ||
      !Number.isSafeInteger(item.futureAllocationCount) ||
      (item.futureAllocationCount as number) < 0 ||
      (item.internalNotes !== null && typeof item.internalNotes !== "string") ||
      (item.key !== null && typeof item.key !== "string") ||
      (item.membershipId !== null && typeof item.membershipId !== "string") ||
      (item.offeredHoursPerWeek !== null &&
        (typeof item.offeredHoursPerWeek !== "number" ||
          !Number.isFinite(item.offeredHoursPerWeek) ||
          item.offeredHoursPerWeek <= 0 ||
          item.offeredHoursPerWeek > 168)) ||
      (item.publicBio !== null && typeof item.publicBio !== "string") ||
      (item.resourceTypeId !== null && typeof item.resourceTypeId !== "string") ||
      (item.resourceTypeName !== null && typeof item.resourceTypeName !== "string") ||
      (item.revision !== null &&
        (!Number.isSafeInteger(item.revision) || (item.revision as number) < 1)) ||
      (item.kind === "staff" &&
        (item.key !== null ||
          item.resourceTypeId !== null ||
          item.resourceTypeName !== null)) ||
      (item.kind === "staff" && item.resourceTypeName !== null) ||
      (item.kind === "resource" &&
        (item.membershipId !== null ||
          item.offeredHoursPerWeek !== null ||
          item.publicBio !== null ||
          item.resourceTypeName === null))
    ) {
      throw new Error("Staff/resource workspace item is invalid");
    }

    return Object.freeze({
      futureAllocationCount: item.futureAllocationCount as number,
      id: requireNonEmptyString(item.id),
      internalNotes: item.internalNotes,
      key: item.key === null ? null : requireNonEmptyString(item.key),
      kind: item.kind,
      locationIds: Object.freeze(item.locationIds.map(requireNonEmptyString)),
      membershipId:
        item.membershipId === null ? null : requireNonEmptyString(item.membershipId),
      name: requireNonEmptyString(item.name),
      offeredHoursPerWeek: item.offeredHoursPerWeek as number | null,
      publicBio: item.publicBio,
      resourceTypeId:
        item.resourceTypeId === null
          ? null
          : requireNonEmptyString(item.resourceTypeId),
      resourceTypeName:
        item.resourceTypeName === null
          ? null
          : requireNonEmptyString(item.resourceTypeName),
      revision: item.revision as number | null,
      serviceIds: Object.freeze(item.serviceIds.map(requireNonEmptyString)),
      status: item.status,
    });
  });

  const parseChoices = (
    choices: readonly unknown[],
  ): readonly StaffResourceChoiceV1[] =>
    Object.freeze(
      choices.map((choice) => {
        if (!isRecord(choice) || !hasExactKeys(choice, ["id", "name"])) {
          throw new Error("Staff/resource workspace choice is invalid");
        }
        return Object.freeze({
          id: requireNonEmptyString(choice.id),
          name: requireNonEmptyString(choice.name),
        });
      }),
    );

  const resourceTypes = Object.freeze(
    value.resourceTypes.map((choice) => {
      if (
        !isRecord(choice) ||
        !hasExactKeys(choice, ["exclusive", "id", "key", "name", "revision"]) ||
        typeof choice.exclusive !== "boolean" ||
        !Number.isSafeInteger(choice.revision) ||
        (choice.revision as number) < 1
      ) {
        throw new Error("Staff/resource workspace resource type is invalid");
      }
      return Object.freeze({
        exclusive: choice.exclusive,
        id: requireNonEmptyString(choice.id),
        key: requireNonEmptyString(choice.key),
        name: requireNonEmptyString(choice.name),
        revision: choice.revision as number,
      });
    }),
  );

  return Object.freeze({
    items: Object.freeze(items),
    locations: parseChoices(value.locations),
    resourceTypes,
    services: parseChoices(value.services),
    tenantId: requireNonEmptyString(value.tenantId),
  });
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
  readonly endBefore: string;
  readonly locale: ContractLocale;
  readonly locationId: LocationId;
  readonly partySize: number;
  readonly serviceId: string;
  readonly staffPreferenceId: string | null;
  readonly startAfter: string;
  readonly timeZone: string;
}
export interface AvailabilitySlotV1 {
  readonly allocationKind: "appointment" | "exclusive_resource";
  readonly endAt: string;
  readonly staffId: string | null;
  readonly startAt: string;
}
export type AvailabilityNoSlotReasonV1 =
  | "capacity_unavailable"
  | "no_matching_availability"
  | "outside_booking_window"
  | "policy_restricted";
export interface AvailabilityV1Response {
  readonly advisory: true;
  readonly displayTimeZone: string;
  readonly locationTimeZone: string;
  readonly noSlotReason: AvailabilityNoSlotReasonV1 | null;
  readonly providerHealth: "not_applicable";
  readonly slots: readonly AvailabilitySlotV1[];
}

const availabilityNoSlotReasons = [
  "capacity_unavailable",
  "no_matching_availability",
  "outside_booking_window",
  "policy_restricted",
] as const;

const availabilityTransportTimestampFields = [
  "advisory_as_of",
  "advisory_until",
  "slot_end",
  "slot_start",
] as const;

const postgrestTimestamptzPattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+-](\d{2}):(\d{2}))$/u;

function requireUtcInstant(value: unknown): string {
  const instant = requireNonEmptyString(value);
  const epoch = Date.parse(instant);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== instant) {
    throw new Error("Expected a canonical UTC instant");
  }
  return instant;
}

function normalizePostgrestTimestamptz(value: unknown): string {
  const instant = requireNonEmptyString(value);
  const match = postgrestTimestamptzPattern.exec(instant);
  const epoch = Date.parse(instant);
  if (
    match === null ||
    !hasValidPostgrestTimestamptzComponents(match) ||
    !Number.isFinite(epoch)
  ) {
    throw new Error("Expected a PostgreSQL timestamptz value");
  }
  return new Date(epoch).toISOString();
}

function hasValidPostgrestTimestamptzComponents(match: RegExpExecArray): boolean {
  const [year, month, day, hour, minute, second, offsetHour, offsetMinute] = match
    .slice(1)
    .map((value) => (value === undefined ? undefined : Number(value)));
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    second === undefined ||
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return false;
  }
  return (
    (offsetHour === undefined && offsetMinute === undefined) ||
    (offsetHour !== undefined &&
      offsetMinute !== undefined &&
      offsetHour <= 23 &&
      offsetMinute <= 59)
  );
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * Normalizes only the timestamptz columns returned by get_availability_v1.
 * Request DTOs stay subject to canonical-UTC validation in
 * parseAvailabilityV1Request.
 */
export function normalizeAvailabilityV1TransportRow(
  row: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const normalized = { ...row };
  for (const field of availabilityTransportTimestampFields) {
    const value = row[field];
    if (value !== null && value !== undefined) {
      normalized[field] = normalizePostgrestTimestamptz(value);
    }
  }
  return Object.freeze(normalized);
}

function requireTimeZone(value: unknown): string {
  const timeZone = requireNonEmptyString(value);
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format(0);
  } catch {
    throw new Error("Expected a valid IANA timezone");
  }
  return timeZone;
}

export function parseAvailabilityV1Request(value: unknown): AvailabilityV1Request {
  const keys = [
    "endBefore",
    "locale",
    "locationId",
    "partySize",
    "serviceId",
    "staffPreferenceId",
    "startAfter",
    "timeZone",
  ] as const;
  if (!isRecord(value) || !hasExactKeys(value, keys)) {
    throw new Error("Availability request has an unexpected shape");
  }
  if (value.locale !== "en" && value.locale !== "ar") {
    throw new Error("Availability locale is unsupported");
  }
  if (
    !Number.isSafeInteger(value.partySize) ||
    (value.partySize as number) < 1 ||
    (value.partySize as number) > 50
  ) {
    throw new Error("Availability party size is out of bounds");
  }
  const startAfter = requireUtcInstant(value.startAfter);
  const endBefore = requireUtcInstant(value.endBefore);
  const windowMilliseconds = Date.parse(endBefore) - Date.parse(startAfter);
  if (windowMilliseconds <= 0 || windowMilliseconds > 31 * 24 * 60 * 60 * 1_000) {
    throw new Error("Availability window must be positive and at most 31 days");
  }
  return Object.freeze({
    endBefore,
    locale: value.locale,
    locationId: requireNonEmptyString(value.locationId) as LocationId,
    partySize: value.partySize as number,
    serviceId: requireNonEmptyString(value.serviceId),
    staffPreferenceId:
      value.staffPreferenceId === null
        ? null
        : requireNonEmptyString(value.staffPreferenceId),
    startAfter,
    timeZone: requireTimeZone(value.timeZone),
  });
}

export function parseAvailabilityV1Response(value: unknown): AvailabilityV1Response {
  const keys = [
    "advisory",
    "displayTimeZone",
    "locationTimeZone",
    "noSlotReason",
    "providerHealth",
    "slots",
  ] as const;
  if (!isRecord(value) || !hasExactKeys(value, keys)) {
    throw new Error("Availability response has an unexpected shape");
  }
  if (value.advisory !== true || value.providerHealth !== "not_applicable") {
    throw new Error("Availability response is not advisory v1");
  }
  if (
    value.noSlotReason !== null &&
    !availabilityNoSlotReasons.includes(
      value.noSlotReason as AvailabilityNoSlotReasonV1,
    )
  ) {
    throw new Error("Availability no-slot reason is invalid");
  }
  if (!Array.isArray(value.slots) || value.slots.length > 500) {
    throw new Error("Availability slots exceed the result bound");
  }
  const slots = value.slots.map((slot) => {
    const slotKeys = ["allocationKind", "endAt", "staffId", "startAt"] as const;
    if (!isRecord(slot) || !hasExactKeys(slot, slotKeys)) {
      throw new Error("Availability slot has an unexpected shape");
    }
    const startAt = requireUtcInstant(slot.startAt);
    const endAt = requireUtcInstant(slot.endAt);
    if (
      Date.parse(startAt) >= Date.parse(endAt) ||
      (slot.allocationKind !== "appointment" &&
        slot.allocationKind !== "exclusive_resource")
    ) {
      throw new Error("Availability slot range is invalid");
    }
    return Object.freeze({
      allocationKind: slot.allocationKind,
      endAt,
      staffId: slot.staffId === null ? null : requireNonEmptyString(slot.staffId),
      startAt,
    });
  });
  if ((slots.length === 0) !== (value.noSlotReason !== null)) {
    throw new Error("Availability no-slot reason does not match slots");
  }
  return Object.freeze({
    advisory: true,
    displayTimeZone: requireTimeZone(value.displayTimeZone),
    locationTimeZone: requireTimeZone(value.locationTimeZone),
    noSlotReason: value.noSlotReason as AvailabilityNoSlotReasonV1 | null,
    providerHealth: "not_applicable",
    slots: Object.freeze(slots),
  });
}
export interface CreateHoldV1Request {
  readonly expectedCacheTag: string | null;
  readonly idempotencyKey: IdempotencyKey;
  readonly locale: ContractLocale;
  readonly locationId: LocationId;
  readonly partySize: number;
  readonly serviceId: string;
  /** Opaque caller-generated session identity. Rate limiting only, never authorization. */
  readonly sessionToken: string;
  readonly staffPreferenceId: string | null;
  readonly startAt: string;
}
export interface CreateHoldV1Response {
  readonly allocationKind: "appointment" | "exclusive_resource";
  readonly expiresAt: string;
  readonly holdId: string;
  readonly price: MoneyDto;
  /** True when an identical retry replayed the original hold. */
  readonly replayed: boolean;
  readonly slotEnd: string;
  readonly slotStart: string;
  /** Null for exclusive-resource holds: the allocated resource stays private. */
  readonly staffId: string | null;
  readonly state: "active" | "expired" | "released";
}

const holdStates = ["active", "expired", "released"] as const;

export function parseCreateHoldV1Request(value: unknown): CreateHoldV1Request {
  const keys = [
    "expectedCacheTag",
    "idempotencyKey",
    "locale",
    "locationId",
    "partySize",
    "serviceId",
    "sessionToken",
    "staffPreferenceId",
    "startAt",
  ] as const;
  if (!isRecord(value) || !hasExactKeys(value, keys)) {
    throw new Error("Hold request has an unexpected shape");
  }
  if (value.locale !== "en" && value.locale !== "ar") {
    throw new Error("Hold locale is unsupported");
  }
  if (value.partySize !== 1) {
    throw new Error("Hold party size is out of bounds");
  }
  const sessionToken = requireNonEmptyString(value.sessionToken);
  const idempotencyKey = requireNonEmptyString(value.idempotencyKey);
  if (
    sessionToken.length < 16 ||
    sessionToken.length > 200 ||
    idempotencyKey.length < 16 ||
    idempotencyKey.length > 200 ||
    idempotencyKey.trim() !== idempotencyKey
  ) {
    throw new Error("Hold session token or idempotency key is out of bounds");
  }
  const startAt = requireUtcInstant(value.startAt);
  if (Date.parse(startAt) % 60_000 !== 0) {
    throw new Error("Hold slot must start on a whole minute");
  }
  return Object.freeze({
    expectedCacheTag:
      value.expectedCacheTag === null
        ? null
        : requireNonEmptyString(value.expectedCacheTag),
    idempotencyKey,
    locale: value.locale,
    locationId: requireNonEmptyString(value.locationId) as LocationId,
    partySize: 1,
    serviceId: requireNonEmptyString(value.serviceId),
    sessionToken,
    staffPreferenceId:
      value.staffPreferenceId === null
        ? null
        : requireNonEmptyString(value.staffPreferenceId),
    startAt,
  });
}

export function parseCreateHoldV1Response(value: unknown): CreateHoldV1Response {
  const keys = [
    "allocationKind",
    "expiresAt",
    "holdId",
    "price",
    "replayed",
    "slotEnd",
    "slotStart",
    "staffId",
    "state",
  ] as const;
  if (!isRecord(value) || !hasExactKeys(value, keys)) {
    throw new Error("Hold response has an unexpected shape");
  }
  if (
    (value.allocationKind !== "appointment" &&
      value.allocationKind !== "exclusive_resource") ||
    typeof value.replayed !== "boolean" ||
    !holdStates.includes(value.state as (typeof holdStates)[number])
  ) {
    throw new Error("Hold response is invalid");
  }
  if (value.allocationKind === "exclusive_resource" && value.staffId !== null) {
    throw new Error("Exclusive-resource holds must not disclose a subject");
  }
  if (
    !isRecord(value.price) ||
    !hasExactKeys(value.price, ["currency", "minorUnits"])
  ) {
    throw new Error("Hold price has an unexpected shape");
  }
  const currency = requireNonEmptyString(value.price.currency);
  if (
    !/^[A-Z]{3}$/u.test(currency) ||
    typeof value.price.minorUnits !== "number" ||
    !Number.isSafeInteger(value.price.minorUnits) ||
    value.price.minorUnits < 0
  ) {
    throw new Error("Hold price is invalid");
  }
  const slotStart = requireUtcInstant(value.slotStart);
  const slotEnd = requireUtcInstant(value.slotEnd);
  const expiresAt = requireUtcInstant(value.expiresAt);
  if (Date.parse(slotStart) >= Date.parse(slotEnd)) {
    throw new Error("Hold slot range is invalid");
  }
  // A hold that outlives the slot it protects would let a caller confirm a slot
  // that has already started.
  if (Date.parse(expiresAt) > Date.parse(slotStart)) {
    throw new Error("Hold cannot expire after the slot it protects");
  }
  return Object.freeze({
    allocationKind: value.allocationKind,
    expiresAt,
    holdId: requireNonEmptyString(value.holdId),
    price: Object.freeze({ currency, minorUnits: value.price.minorUnits }),
    replayed: value.replayed,
    slotEnd,
    slotStart,
    staffId: value.staffId === null ? null : requireNonEmptyString(value.staffId),
    state: value.state as CreateHoldV1Response["state"],
  });
}
export interface BookingSummaryV1 {
  readonly bookingId: BookingId;
  readonly calendarStatus: CalendarExportStatusDto;
  readonly notificationStatus: NotificationStatusDto;
  readonly paymentStatus: PaymentStatusDto;
  readonly publicReference: string;
  readonly status: BookingStatusDto;
}

/**
 * The consent text and intake questions from exactly the publication the hold
 * read. Field labels arrive already localized: catalog revisions are per locale.
 */
export interface HoldFormFieldV1 {
  readonly key: string;
  readonly label: string;
  readonly maxLength: number;
  readonly required: boolean;
}

export interface HoldFormV1 {
  /** Issue #22. What a deposit leaves owed later. Zero unless `payment_mode` is `deposit`. */
  readonly balanceMinor: number;
  readonly consentText: string;
  readonly consentVersion: string;
  /** What is owed today, decided by the server. Zero when nothing is owed. */
  readonly dueMinor: number;
  readonly fields: readonly HoldFormFieldV1[];
  readonly locationName: string;
  readonly paymentMode: "deposit" | "full" | "none";
  readonly serviceName: string;
}

export function parseHoldFormV1(value: unknown): HoldFormV1 {
  const keys = [
    "balanceMinor",
    "consentText",
    "consentVersion",
    "dueMinor",
    "fields",
    "locationName",
    "paymentMode",
    "serviceName",
  ] as const;
  if (!isRecord(value) || !hasExactKeys(value, keys)) {
    throw new Error("Hold form has an unexpected shape");
  }
  const consentVersion = requireNonEmptyString(value.consentVersion);
  if (consentVersion.length > 40 || typeof value.consentText !== "string") {
    throw new Error("Hold form consent is invalid");
  }
  // A payment mode this client does not know is refused rather than guessed:
  // treating an unknown mode as `none` would show a free booking for a service
  // that is not free.
  if (
    value.paymentMode !== "none" &&
    value.paymentMode !== "deposit" &&
    value.paymentMode !== "full"
  ) {
    throw new Error("Hold form payment mode is unknown");
  }
  if (
    typeof value.dueMinor !== "number" ||
    typeof value.balanceMinor !== "number" ||
    !Number.isSafeInteger(value.dueMinor) ||
    !Number.isSafeInteger(value.balanceMinor) ||
    value.dueMinor < 0 ||
    value.balanceMinor < 0
  ) {
    throw new Error("Hold form amounts are invalid");
  }
  if (!Array.isArray(value.fields) || value.fields.length > 50) {
    throw new Error("Hold form exceeds the field bound");
  }
  const fields = value.fields.map((field) => {
    if (
      !isRecord(field) ||
      !hasExactKeys(field, ["key", "label", "maxLength", "required"])
    ) {
      throw new Error("Hold form field has an unexpected shape");
    }
    const key = requireNonEmptyString(field.key);
    if (
      key.length > 80 ||
      typeof field.required !== "boolean" ||
      typeof field.maxLength !== "number" ||
      !Number.isSafeInteger(field.maxLength) ||
      field.maxLength < 1 ||
      field.maxLength > 2000
    ) {
      throw new Error("Hold form field is invalid");
    }
    return Object.freeze({
      key,
      label: requireNonEmptyString(field.label),
      maxLength: field.maxLength,
      required: field.required,
    });
  });
  return Object.freeze({
    balanceMinor: value.balanceMinor,
    consentText: value.consentText,
    consentVersion,
    dueMinor: value.dueMinor,
    fields: Object.freeze(fields),
    locationName: requireNonEmptyString(value.locationName),
    paymentMode: value.paymentMode,
    serviceName: requireNonEmptyString(value.serviceName),
  });
}

export interface ConfirmBookingV1Request {
  readonly consentVersion: string;
  readonly contact: {
    readonly email: string;
    readonly fullName: string;
    readonly phone: string | null;
  };
  readonly customerTimeZone: string;
  readonly holdId: string;
  readonly idempotencyKey: IdempotencyKey;
  /** Answers to the published intake schema. Declared keys only, bounded text. */
  readonly intake: Readonly<Record<string, string>>;
  readonly locale: ContractLocale;
  /** The session that created the hold. Ownership evidence, never authorization. */
  readonly sessionToken: string;
}

export interface ConfirmBookingV1Response {
  readonly approvalStatus: "not_required" | "pending" | "approved" | "declined";
  /** When a staff decision is due. Present only while a request is pending. */
  readonly approvalDeadline: string | null;
  readonly bookingId: BookingId;
  /** Snapshot reference: the booking revision the confirmation describes. */
  readonly bookingRevision: number;
  readonly calendarStatus: CalendarExportStatusDto;
  /** Snapshot reference: the policy version the customer consented to. */
  readonly consentVersion: string;
  readonly customerTimeZone: string;
  readonly endAt: string;
  readonly locale: ContractLocale;
  readonly locationName: string;
  readonly locationTimeZone: string;
  readonly notificationStatus: NotificationStatusDto;
  readonly paymentStatus: PaymentStatusDto;
  readonly price: MoneyDto;
  readonly publicReference: string;
  /** True when a duplicate submission replayed the original booking. */
  readonly replayed: boolean;
  readonly serviceName: string;
  readonly startAt: string;
  /** Approval-gated services commit `requested`, never `confirmed` (ADR-0005). */
  readonly status: "confirmed" | "requested";
  readonly taxRateBps: number;
}

const bookingApprovalStatuses = [
  "not_required",
  "pending",
  "approved",
  "declined",
  "expired",
] as const;

/**
 * Issue #22. Opening a checkout carries exactly what confirming carries, because
 * it is the same booking — captured before the customer leaves for the provider,
 * since settlement happens with no browser present. No amount is sent: the
 * server prices it, and a submitted amount would be a value nothing reads.
 */
export type BeginCheckoutV1Request = ConfirmBookingV1Request;

export interface BeginCheckoutV1Response {
  /** What remains after a deposit. Zero for a full payment. */
  readonly balanceMinor: number;
  readonly currency: string;
  /** What is owed now, decided by the server. */
  readonly dueMinor: number;
  readonly paymentAttemptId: string;
  readonly paymentMode: "deposit" | "full";
  readonly status: string;
  readonly taxMinor: number;
  readonly totalMinor: number;
}

export interface CheckoutStatusV1Response {
  readonly balanceMinor: number;
  readonly bookingId: string | null;
  readonly bookingStatus: string | null;
  readonly currency: string;
  readonly dueMinor: number;
  /** Named reason a verified payment could not become this booking. */
  readonly exceptionCode: string | null;
  readonly paymentStatus: string | null;
  readonly publicReference: string | null;
  readonly purpose: "deposit" | "full";
  readonly status: string;
}

export function parseBeginCheckoutV1Request(value: unknown): BeginCheckoutV1Request {
  // Identical shape to confirmation, so there is one place where a booking
  // request is validated rather than two that can drift.
  return parseConfirmBookingV1Request(value);
}

export function parseConfirmBookingV1Request(value: unknown): ConfirmBookingV1Request {
  const keys = [
    "consentVersion",
    "contact",
    "customerTimeZone",
    "holdId",
    "idempotencyKey",
    "intake",
    "locale",
    "sessionToken",
  ] as const;
  if (!isRecord(value) || !hasExactKeys(value, keys)) {
    throw new Error("Booking request has an unexpected shape");
  }
  if (value.locale !== "en" && value.locale !== "ar") {
    throw new Error("Booking locale is unsupported");
  }
  const sessionToken = requireNonEmptyString(value.sessionToken);
  const idempotencyKey = requireNonEmptyString(value.idempotencyKey);
  if (
    sessionToken.length < 16 ||
    sessionToken.length > 200 ||
    idempotencyKey.length < 16 ||
    idempotencyKey.length > 200 ||
    idempotencyKey.trim() !== idempotencyKey
  ) {
    throw new Error("Booking session token or idempotency key is out of bounds");
  }
  const consentVersion = requireNonEmptyString(value.consentVersion);
  if (consentVersion.length > 40) {
    throw new Error("Booking consent version is out of bounds");
  }
  if (
    !isRecord(value.contact) ||
    !hasExactKeys(value.contact, ["email", "fullName", "phone"])
  ) {
    throw new Error("Booking contact has an unexpected shape");
  }
  // Contact data is minimized at the boundary: three declared fields, each
  // bounded, and nothing is accepted that the booking purpose does not need.
  const fullName = requireNonEmptyString(value.contact.fullName).trim();
  const email = requireNonEmptyString(value.contact.email).trim().toLowerCase();
  const phone =
    value.contact.phone === null
      ? null
      : requireNonEmptyString(value.contact.phone).trim();
  if (
    fullName.length === 0 ||
    fullName.length > 160 ||
    email.length > 320 ||
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(email) ||
    (phone !== null &&
      (phone.length < 3 || phone.length > 40 || !/^[+0-9 ()-]+$/u.test(phone)))
  ) {
    throw new Error("Booking contact is invalid");
  }
  if (!isRecord(value.intake)) {
    throw new Error("Booking intake has an unexpected shape");
  }
  const intakeEntries = Object.entries(value.intake);
  if (intakeEntries.length > 50) {
    throw new Error("Booking intake exceeds the field bound");
  }
  for (const [key, answer] of intakeEntries) {
    if (
      key.trim().length === 0 ||
      key.length > 80 ||
      typeof answer !== "string" ||
      answer.length > 2000
    ) {
      throw new Error("Booking intake answer is invalid");
    }
  }
  return Object.freeze({
    consentVersion,
    contact: Object.freeze({ email, fullName, phone }),
    customerTimeZone: requireTimeZone(value.customerTimeZone),
    holdId: requireNonEmptyString(value.holdId),
    idempotencyKey,
    intake: Object.freeze({ ...(value.intake as Record<string, string>) }),
    locale: value.locale,
    sessionToken,
  });
}

export function parseConfirmBookingV1Response(
  value: unknown,
): ConfirmBookingV1Response {
  const keys = [
    "approvalDeadline",
    "approvalStatus",
    "bookingId",
    "bookingRevision",
    "calendarStatus",
    "consentVersion",
    "customerTimeZone",
    "endAt",
    "locale",
    "locationName",
    "locationTimeZone",
    "notificationStatus",
    "paymentStatus",
    "price",
    "publicReference",
    "replayed",
    "serviceName",
    "startAt",
    "status",
    "taxRateBps",
  ] as const;
  if (!isRecord(value) || !hasExactKeys(value, keys)) {
    throw new Error("Booking response has an unexpected shape");
  }
  if (
    (value.status !== "confirmed" && value.status !== "requested") ||
    typeof value.replayed !== "boolean" ||
    (value.locale !== "en" && value.locale !== "ar") ||
    !bookingApprovalStatuses.includes(
      value.approvalStatus as (typeof bookingApprovalStatuses)[number],
    )
  ) {
    throw new Error("Booking response is invalid");
  }
  // Booking, payment, notification, and calendar states stay independent: a
  // pending email never downgrades a committed booking.
  if (
    !paymentStatuses.includes(value.paymentStatus as PaymentStatusDto) ||
    !notificationStatuses.includes(value.notificationStatus as NotificationStatusDto) ||
    !calendarExportStatuses.includes(value.calendarStatus as CalendarExportStatusDto)
  ) {
    throw new Error("Booking provider state is invalid");
  }
  if (
    !isRecord(value.price) ||
    !hasExactKeys(value.price, ["currency", "minorUnits"])
  ) {
    throw new Error("Booking price has an unexpected shape");
  }
  const currency = requireNonEmptyString(value.price.currency);
  if (
    !/^[A-Z]{3}$/u.test(currency) ||
    typeof value.price.minorUnits !== "number" ||
    !Number.isSafeInteger(value.price.minorUnits) ||
    value.price.minorUnits < 0 ||
    typeof value.taxRateBps !== "number" ||
    !Number.isSafeInteger(value.taxRateBps) ||
    value.taxRateBps < 0 ||
    value.taxRateBps > 3000 ||
    typeof value.bookingRevision !== "number" ||
    !Number.isSafeInteger(value.bookingRevision) ||
    value.bookingRevision < 1
  ) {
    throw new Error("Booking price or revision is invalid");
  }
  const startAt = requireUtcInstant(value.startAt);
  const endAt = requireUtcInstant(value.endAt);
  if (Date.parse(startAt) >= Date.parse(endAt)) {
    throw new Error("Booking range is invalid");
  }
  // A pending request always carries the deadline the customer is told about,
  // and a settled booking never carries a stale one.
  const approvalDeadline =
    value.approvalDeadline === null ? null : requireUtcInstant(value.approvalDeadline);
  if ((value.approvalStatus === "pending") !== (approvalDeadline !== null)) {
    throw new Error("Booking approval deadline does not match its approval state");
  }
  if ((value.status === "requested") !== (value.approvalStatus === "pending")) {
    throw new Error("Booking status does not match its approval state");
  }
  const publicReference = requireNonEmptyString(value.publicReference);
  if (!/^[0-9A-HJ-NP-Z]{10}$/u.test(publicReference)) {
    throw new Error("Booking reference is invalid");
  }
  return Object.freeze({
    approvalDeadline,
    approvalStatus: value.approvalStatus as ConfirmBookingV1Response["approvalStatus"],
    bookingId: requireNonEmptyString(value.bookingId) as BookingId,
    bookingRevision: value.bookingRevision,
    calendarStatus: value.calendarStatus as CalendarExportStatusDto,
    consentVersion: requireNonEmptyString(value.consentVersion),
    customerTimeZone: requireTimeZone(value.customerTimeZone),
    endAt,
    locale: value.locale,
    locationName: requireNonEmptyString(value.locationName),
    locationTimeZone: requireTimeZone(value.locationTimeZone),
    notificationStatus: value.notificationStatus as NotificationStatusDto,
    paymentStatus: value.paymentStatus as PaymentStatusDto,
    price: Object.freeze({ currency, minorUnits: value.price.minorUnits }),
    publicReference,
    replayed: value.replayed,
    serviceName: requireNonEmptyString(value.serviceName),
    startAt,
    status: value.status,
    taxRateBps: value.taxRateBps,
  });
}

/** One row of the Dashboard pending-action queue (issue #13). */
export interface BookingRequestV1 {
  readonly approvalDeadline: string;
  readonly bookingId: BookingId;
  readonly bookingRevision: number;
  /** Null unless the reader may see customer personal data. */
  readonly customerDisplayName: string | null;
  readonly endAt: string;
  readonly hasIntake: boolean;
  readonly locale: ContractLocale;
  readonly locationId: LocationId;
  readonly locationName: string;
  readonly locationTimeZone: string;
  readonly price: MoneyDto;
  readonly proposal: {
    readonly expiresAt: string;
    readonly startAt: string;
  } | null;
  readonly publicReference: string;
  readonly requestedAt: string;
  readonly serviceName: string;
  readonly startAt: string;
}

export type BookingDecisionActionV1 = "accept" | "propose" | "reject";

export interface BookingDecisionV1Request {
  readonly action: BookingDecisionActionV1;
  readonly bookingId: BookingId;
  readonly expectedRevision: number;
  /** Staff-only note. It is lineage, never customer-facing text. */
  readonly internalReason: string | null;
  readonly proposedStartAt: string | null;
  /** Shown to the customer, so it is bounded and optional. */
  readonly publicReason: string | null;
  readonly tenantId: TenantId;
}

export interface BookingDecisionV1Response {
  readonly approvalStatus: ConfirmBookingV1Response["approvalStatus"];
  readonly bookingId: BookingId;
  readonly bookingRevision: number;
  /** Returned once, for the customer link. Never stored in the clear. */
  readonly proposalActionToken: string | null;
  readonly proposalExpiresAt: string | null;
  readonly status: "confirmed" | "rejected" | "requested";
}

export function parseBookingRequestsV1(value: unknown): readonly BookingRequestV1[] {
  if (!Array.isArray(value) || value.length > 200) {
    throw new Error("Booking request queue exceeds the result bound");
  }
  return Object.freeze(
    value.map((row) => {
      const keys = [
        "approvalDeadline",
        "bookingId",
        "bookingRevision",
        "customerDisplayName",
        "endAt",
        "hasIntake",
        "locale",
        "locationId",
        "locationName",
        "locationTimeZone",
        "price",
        "proposal",
        "publicReference",
        "requestedAt",
        "serviceName",
        "startAt",
      ] as const;
      if (!isRecord(row) || !hasExactKeys(row, keys)) {
        throw new Error("Booking request has an unexpected shape");
      }
      if (
        (row.locale !== "en" && row.locale !== "ar") ||
        typeof row.hasIntake !== "boolean" ||
        typeof row.bookingRevision !== "number" ||
        !Number.isSafeInteger(row.bookingRevision) ||
        row.bookingRevision < 1
      ) {
        throw new Error("Booking request is invalid");
      }
      if (
        !isRecord(row.price) ||
        !hasExactKeys(row.price, ["currency", "minorUnits"])
      ) {
        throw new Error("Booking request price has an unexpected shape");
      }
      const currency = requireNonEmptyString(row.price.currency);
      if (
        !/^[A-Z]{3}$/u.test(currency) ||
        typeof row.price.minorUnits !== "number" ||
        !Number.isSafeInteger(row.price.minorUnits) ||
        row.price.minorUnits < 0
      ) {
        throw new Error("Booking request price is invalid");
      }
      let proposal: BookingRequestV1["proposal"] = null;
      if (row.proposal !== null) {
        if (
          !isRecord(row.proposal) ||
          !hasExactKeys(row.proposal, ["expiresAt", "startAt"])
        ) {
          throw new Error("Booking request proposal has an unexpected shape");
        }
        proposal = Object.freeze({
          expiresAt: requireUtcInstant(row.proposal.expiresAt),
          startAt: requireUtcInstant(row.proposal.startAt),
        });
      }
      const startAt = requireUtcInstant(row.startAt);
      const endAt = requireUtcInstant(row.endAt);
      if (Date.parse(startAt) >= Date.parse(endAt)) {
        throw new Error("Booking request range is invalid");
      }
      return Object.freeze({
        approvalDeadline: requireUtcInstant(row.approvalDeadline),
        bookingId: requireNonEmptyString(row.bookingId) as BookingId,
        bookingRevision: row.bookingRevision,
        customerDisplayName:
          row.customerDisplayName === null
            ? null
            : requireNonEmptyString(row.customerDisplayName),
        endAt,
        hasIntake: row.hasIntake,
        locale: row.locale,
        locationId: requireNonEmptyString(row.locationId) as LocationId,
        locationName: requireNonEmptyString(row.locationName),
        locationTimeZone: requireTimeZone(row.locationTimeZone),
        price: Object.freeze({ currency, minorUnits: row.price.minorUnits }),
        proposal,
        publicReference: requireNonEmptyString(row.publicReference),
        requestedAt: requireUtcInstant(row.requestedAt),
        serviceName: requireNonEmptyString(row.serviceName),
        startAt,
      });
    }),
  );
}

export function parseBookingDecisionV1Request(
  value: unknown,
): BookingDecisionV1Request {
  const keys = [
    "action",
    "bookingId",
    "expectedRevision",
    "internalReason",
    "proposedStartAt",
    "publicReason",
    "tenantId",
  ] as const;
  if (!isRecord(value) || !hasExactKeys(value, keys)) {
    throw new Error("Booking decision has an unexpected shape");
  }
  if (
    (value.action !== "accept" &&
      value.action !== "propose" &&
      value.action !== "reject") ||
    typeof value.expectedRevision !== "number" ||
    !Number.isSafeInteger(value.expectedRevision) ||
    value.expectedRevision < 1
  ) {
    throw new Error("Booking decision is invalid");
  }
  // A proposal is the only action that carries a time, and it must be one the
  // database will accept: a whole minute in the future.
  const proposedStartAt =
    value.proposedStartAt === null ? null : requireUtcInstant(value.proposedStartAt);
  if (
    (value.action === "propose") !== (proposedStartAt !== null) ||
    (proposedStartAt !== null && Date.parse(proposedStartAt) % 60_000 !== 0)
  ) {
    throw new Error("Booking decision proposal time is invalid");
  }
  const bounded = (reason: unknown) => {
    if (reason === null) return null;
    const text = requireNonEmptyString(reason).trim();
    if (text.length === 0 || text.length > 500) {
      throw new Error("Booking decision reason is out of bounds");
    }
    return text;
  };
  return Object.freeze({
    action: value.action,
    bookingId: requireNonEmptyString(value.bookingId) as BookingId,
    expectedRevision: value.expectedRevision,
    internalReason: bounded(value.internalReason),
    proposedStartAt,
    publicReason: bounded(value.publicReason),
    tenantId: requireNonEmptyString(value.tenantId) as TenantId,
  });
}

export function parseBookingDecisionV1Response(
  value: unknown,
): BookingDecisionV1Response {
  const keys = [
    "approvalStatus",
    "bookingId",
    "bookingRevision",
    "proposalActionToken",
    "proposalExpiresAt",
    "status",
  ] as const;
  if (!isRecord(value) || !hasExactKeys(value, keys)) {
    throw new Error("Booking decision result has an unexpected shape");
  }
  if (
    (value.status !== "confirmed" &&
      value.status !== "rejected" &&
      value.status !== "requested") ||
    !bookingApprovalStatuses.includes(
      value.approvalStatus as (typeof bookingApprovalStatuses)[number],
    ) ||
    typeof value.bookingRevision !== "number" ||
    !Number.isSafeInteger(value.bookingRevision) ||
    value.bookingRevision < 1
  ) {
    throw new Error("Booking decision result is invalid");
  }
  const token =
    value.proposalActionToken === null
      ? null
      : requireNonEmptyString(value.proposalActionToken);
  const expiresAt =
    value.proposalExpiresAt === null
      ? null
      : requireUtcInstant(value.proposalExpiresAt);
  // The token and its expiry only exist together, and only for a proposal.
  if (
    (token !== null) !== (expiresAt !== null) ||
    (token !== null && !/^[a-f0-9]{64}$/u.test(token))
  ) {
    throw new Error("Booking decision proposal link is invalid");
  }
  return Object.freeze({
    approvalStatus: value.approvalStatus as BookingDecisionV1Response["approvalStatus"],
    bookingId: requireNonEmptyString(value.bookingId) as BookingId,
    bookingRevision: value.bookingRevision,
    proposalActionToken: token,
    proposalExpiresAt: expiresAt,
    status: value.status,
  });
}

export interface ProposalResponseV1 {
  readonly bookingId: BookingId;
  readonly endAt: string;
  readonly proposalState: "accepted" | "declined";
  readonly publicReference: string;
  readonly startAt: string;
  readonly status: "confirmed" | "requested";
}

export function parseProposalResponseV1(value: unknown): ProposalResponseV1 {
  const keys = [
    "bookingId",
    "endAt",
    "proposalState",
    "publicReference",
    "startAt",
    "status",
  ] as const;
  if (!isRecord(value) || !hasExactKeys(value, keys)) {
    throw new Error("Proposal response has an unexpected shape");
  }
  if (
    (value.proposalState !== "accepted" && value.proposalState !== "declined") ||
    (value.status !== "confirmed" && value.status !== "requested") ||
    // Accepting settles the booking; declining leaves the request pending.
    (value.proposalState === "accepted") !== (value.status === "confirmed")
  ) {
    throw new Error("Proposal response is invalid");
  }
  const startAt = requireUtcInstant(value.startAt);
  const endAt = requireUtcInstant(value.endAt);
  if (Date.parse(startAt) >= Date.parse(endAt)) {
    throw new Error("Proposal response range is invalid");
  }
  return Object.freeze({
    bookingId: requireNonEmptyString(value.bookingId) as BookingId,
    endAt,
    proposalState: value.proposalState,
    publicReference: requireNonEmptyString(value.publicReference),
    startAt,
    status: value.status,
  });
}

export type ManagementIntentV1 =
  | "view"
  | "reschedule"
  | "cancel"
  | "refund_request"
  | "request_alternative"
  | "data_export"
  | "data_correction_request"
  | "data_deletion_request"
  | "data_restriction_request";

const managementIntents = [
  "view",
  "reschedule",
  "cancel",
  "refund_request",
  "request_alternative",
  "data_export",
  "data_correction_request",
  "data_deletion_request",
  "data_restriction_request",
] as const;

/**
 * What a guest sees behind a manage-booking link. Every refusal — unknown,
 * expired, revoked, consumed, wrong host, rate limited — is the same
 * `unavailable` result, so the surface never discloses whether a booking or a
 * token exists (ADR-0004 decision 12).
 */
export type ManagementViewV1 =
  | { readonly outcome: "unavailable" }
  | {
      readonly booking: {
        readonly approvalStatus: ConfirmBookingV1Response["approvalStatus"];
        readonly bookingId: BookingId;
        readonly bookingRevision: number;
        readonly consentVersion: string;
        readonly customerTimeZone: string;
        readonly endAt: string;
        readonly locale: ContractLocale;
        readonly locationName: string;
        readonly locationTimeZone: string;
        readonly paymentStatus: PaymentStatusDto;
        readonly price: MoneyDto;
        readonly publicReference: string;
        readonly serviceName: string;
        readonly startAt: string;
        readonly status: string;
      };
      readonly canCancel: boolean;
      readonly canReschedule: boolean;
      readonly intent: ManagementIntentV1;
      readonly outcome: "granted";
      readonly stepUpRequired: boolean;
      readonly stepUpVerified: boolean;
      readonly tokenExpiresAt: string;
    };

export function parseManagementViewV1(value: unknown): ManagementViewV1 {
  if (!isRecord(value)) throw new Error("Management view has an unexpected shape");
  if (value.outcome === "unavailable") {
    return Object.freeze({ outcome: "unavailable" as const });
  }
  const keys = [
    "booking",
    "canCancel",
    "canReschedule",
    "intent",
    "outcome",
    "stepUpRequired",
    "stepUpVerified",
    "tokenExpiresAt",
  ] as const;
  if (
    !hasExactKeys(value, keys) ||
    value.outcome !== "granted" ||
    typeof value.canCancel !== "boolean" ||
    typeof value.canReschedule !== "boolean" ||
    typeof value.stepUpRequired !== "boolean" ||
    typeof value.stepUpVerified !== "boolean" ||
    !managementIntents.includes(value.intent as ManagementIntentV1)
  ) {
    throw new Error("Management view is invalid");
  }
  // A view link never carries step-up, and an action link is never granted
  // without it being required (ADR-0004 decisions 6 and 9).
  if ((value.intent === "view") === value.stepUpRequired) {
    throw new Error("Management view step-up does not match its intent");
  }
  const booking = value.booking;
  const bookingKeys = [
    "approvalStatus",
    "bookingId",
    "bookingRevision",
    "consentVersion",
    "customerTimeZone",
    "endAt",
    "locale",
    "locationName",
    "locationTimeZone",
    "paymentStatus",
    "price",
    "publicReference",
    "serviceName",
    "startAt",
    "status",
  ] as const;
  if (!isRecord(booking) || !hasExactKeys(booking, bookingKeys)) {
    throw new Error("Management booking has an unexpected shape");
  }
  if (
    (booking.locale !== "en" && booking.locale !== "ar") ||
    typeof booking.bookingRevision !== "number" ||
    !Number.isSafeInteger(booking.bookingRevision) ||
    booking.bookingRevision < 1 ||
    !paymentStatuses.includes(booking.paymentStatus as PaymentStatusDto) ||
    !bookingApprovalStatuses.includes(
      booking.approvalStatus as (typeof bookingApprovalStatuses)[number],
    )
  ) {
    throw new Error("Management booking is invalid");
  }
  if (
    !isRecord(booking.price) ||
    !hasExactKeys(booking.price, ["currency", "minorUnits"])
  ) {
    throw new Error("Management booking price has an unexpected shape");
  }
  const currency = requireNonEmptyString(booking.price.currency);
  if (
    !/^[A-Z]{3}$/u.test(currency) ||
    typeof booking.price.minorUnits !== "number" ||
    !Number.isSafeInteger(booking.price.minorUnits) ||
    booking.price.minorUnits < 0
  ) {
    throw new Error("Management booking price is invalid");
  }
  const startAt = requireUtcInstant(booking.startAt);
  const endAt = requireUtcInstant(booking.endAt);
  if (Date.parse(startAt) >= Date.parse(endAt)) {
    throw new Error("Management booking range is invalid");
  }
  return Object.freeze({
    booking: Object.freeze({
      approvalStatus:
        booking.approvalStatus as ConfirmBookingV1Response["approvalStatus"],
      bookingId: requireNonEmptyString(booking.bookingId) as BookingId,
      bookingRevision: booking.bookingRevision,
      consentVersion: requireNonEmptyString(booking.consentVersion),
      customerTimeZone: requireTimeZone(booking.customerTimeZone),
      endAt,
      locale: booking.locale,
      locationName: requireNonEmptyString(booking.locationName),
      locationTimeZone: requireTimeZone(booking.locationTimeZone),
      paymentStatus: booking.paymentStatus as PaymentStatusDto,
      price: Object.freeze({ currency, minorUnits: booking.price.minorUnits }),
      publicReference: requireNonEmptyString(booking.publicReference),
      serviceName: requireNonEmptyString(booking.serviceName),
      startAt,
      status: requireNonEmptyString(booking.status),
    }),
    canCancel: value.canCancel,
    canReschedule: value.canReschedule,
    intent: value.intent as ManagementIntentV1,
    outcome: "granted" as const,
    stepUpRequired: value.stepUpRequired,
    stepUpVerified: value.stepUpVerified,
    tokenExpiresAt: requireUtcInstant(value.tokenExpiresAt),
  });
}

/** The step-up request result. `sent` never confirms that an address exists. */
export interface ManagementStepUpV1 {
  readonly expiresAt: string | null;
  readonly outcome: "sent" | "unavailable";
}

export function parseManagementStepUpV1(value: unknown): ManagementStepUpV1 {
  if (!isRecord(value) || !hasExactKeys(value, ["expiresAt", "outcome"])) {
    throw new Error("Management step-up has an unexpected shape");
  }
  if (value.outcome !== "sent" && value.outcome !== "unavailable") {
    throw new Error("Management step-up outcome is invalid");
  }
  const expiresAt =
    value.expiresAt === null ? null : requireUtcInstant(value.expiresAt);
  if ((value.outcome === "sent") !== (expiresAt !== null)) {
    throw new Error("Management step-up expiry does not match its outcome");
  }
  return Object.freeze({ expiresAt, outcome: value.outcome });
}

export type BookingChangeActionV1 = "cancel" | "reschedule";

/** What a management-link action returns. Refusals stay indistinguishable. */
export type ManagementActionV1 =
  | { readonly outcome: "unavailable" }
  | {
      readonly bookingId: BookingId;
      readonly bookingRevision: number;
      readonly outcome: "applied";
      readonly refund: MoneyDto | null;
      readonly refundPercentBps: number | null;
      readonly startAt: string | null;
      readonly status: "cancelled" | "confirmed";
    };

export function parseManagementActionV1(value: unknown): ManagementActionV1 {
  if (!isRecord(value)) throw new Error("Management action has an unexpected shape");
  if (value.outcome === "unavailable") {
    return Object.freeze({ outcome: "unavailable" as const });
  }
  const keys = [
    "bookingId",
    "bookingRevision",
    "outcome",
    "refund",
    "refundPercentBps",
    "startAt",
    "status",
  ] as const;
  if (
    !hasExactKeys(value, keys) ||
    value.outcome !== "applied" ||
    (value.status !== "cancelled" && value.status !== "confirmed") ||
    typeof value.bookingRevision !== "number" ||
    !Number.isSafeInteger(value.bookingRevision) ||
    value.bookingRevision < 1
  ) {
    throw new Error("Management action is invalid");
  }
  // Money and time belong to different actions: a cancellation reports refund
  // eligibility, a move reports the new time, and neither reports the other.
  const refundPercentBps =
    value.refundPercentBps === null ? null : Number(value.refundPercentBps);
  if (
    refundPercentBps !== null &&
    (!Number.isSafeInteger(refundPercentBps) ||
      refundPercentBps < 0 ||
      refundPercentBps > 10_000)
  ) {
    throw new Error("Management action refund percentage is invalid");
  }
  let refund: MoneyDto | null = null;
  if (value.refund !== null) {
    if (
      !isRecord(value.refund) ||
      !hasExactKeys(value.refund, ["currency", "minorUnits"])
    ) {
      throw new Error("Management action refund has an unexpected shape");
    }
    const currency = requireNonEmptyString(value.refund.currency);
    if (
      !/^[A-Z]{3}$/u.test(currency) ||
      typeof value.refund.minorUnits !== "number" ||
      !Number.isSafeInteger(value.refund.minorUnits) ||
      value.refund.minorUnits < 0
    ) {
      throw new Error("Management action refund is invalid");
    }
    refund = Object.freeze({ currency, minorUnits: value.refund.minorUnits });
  }
  const startAt = value.startAt === null ? null : requireUtcInstant(value.startAt);
  if ((value.status === "cancelled") !== (startAt === null)) {
    throw new Error("Management action result does not match its status");
  }
  return Object.freeze({
    bookingId: requireNonEmptyString(value.bookingId) as BookingId,
    bookingRevision: value.bookingRevision,
    outcome: "applied" as const,
    refund,
    refundPercentBps,
    startAt,
    status: value.status,
  });
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

const scheduleKinds = [
  "scope",
  "weekly",
  "break",
  "exception",
  "time_off",
  "holiday",
  "blackout",
  "maintenance",
  "policy",
] as const;

export function parseScheduleWorkspaceV1(
  value: unknown,
): readonly ScheduleWorkspaceRowV1[] {
  if (!Array.isArray(value)) throw new Error("Schedule workspace is not an array");
  return Object.freeze(
    value.map((entry) => {
      const keys = [
        "kind",
        "id",
        "scopeId",
        "locationId",
        "staffId",
        "resourceId",
        "localDate",
        "dayOfWeek",
        "startMinute",
        "endMinute",
        "startsAt",
        "endsAt",
        "exceptionKind",
        "timeZone",
        "reason",
        "policyKey",
        "value",
        "revision",
      ] as const;
      if (
        !isRecord(entry) ||
        !hasExactKeys(entry, keys) ||
        !scheduleKinds.includes(entry.kind as (typeof scheduleKinds)[number])
      )
        throw new Error("Schedule workspace row has an unexpected shape");
      const nullableString = (raw: unknown) =>
        raw === null ? null : requireNonEmptyString(raw);
      const nullableInteger = (raw: unknown) =>
        raw === null
          ? null
          : typeof raw === "number" && Number.isSafeInteger(raw)
            ? raw
            : (() => {
                throw new Error("Schedule integer is invalid");
              })();
      if (
        entry.exceptionKind !== null &&
        entry.exceptionKind !== "closed" &&
        entry.exceptionKind !== "override"
      )
        throw new Error("Schedule exception kind is invalid");
      return Object.freeze({
        kind: entry.kind as (typeof scheduleKinds)[number],
        id: requireNonEmptyString(entry.id),
        scopeId: nullableString(entry.scopeId),
        locationId: nullableString(entry.locationId),
        staffId: nullableString(entry.staffId),
        resourceId: nullableString(entry.resourceId),
        localDate: nullableString(entry.localDate),
        dayOfWeek: nullableInteger(entry.dayOfWeek),
        startMinute: nullableInteger(entry.startMinute),
        endMinute: nullableInteger(entry.endMinute),
        startsAt: nullableString(entry.startsAt),
        endsAt: nullableString(entry.endsAt),
        exceptionKind: entry.exceptionKind,
        timeZone: nullableString(entry.timeZone),
        reason: nullableString(entry.reason),
        policyKey: nullableString(entry.policyKey),
        value:
          entry.value === null
            ? null
            : typeof entry.value === "number" && Number.isFinite(entry.value)
              ? entry.value
              : (() => {
                  throw new Error("Schedule policy value is invalid");
                })(),
        revision: requirePositiveRevision(entry.revision),
      });
    }),
  );
}

export function parseSaveScheduleConfigV1(
  value: unknown,
): SaveScheduleConfigV1Response {
  if (!isRecord(value) || !hasExactKeys(value, ["targetId", "revision"]))
    throw new Error("Schedule save response has an unexpected shape");
  return Object.freeze({
    targetId: requireNonEmptyString(value.targetId),
    revision: requirePositiveRevision(value.revision),
  });
}
