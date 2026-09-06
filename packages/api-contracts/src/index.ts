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
