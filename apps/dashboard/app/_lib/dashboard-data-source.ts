import {
  capabilityNames,
  normalizeAvailabilityV1TransportRow,
  parseAvailabilityV1Response,
  parseDashboardContextV1,
  parseResolvePublicTenantV1,
  parseStaffResourceDeactivationV1,
  parseStaffResourceWorkspaceV1,
  parseTenantChoicesV1,
  parseBookingDecisionV1Request,
  parseBookingDecisionV1Response,
  parseBookingRequestsV1,
  parseScheduleWorkspaceV1,
  parseSaveScheduleConfigV1,
  type CapabilityName,
  type AvailabilityV1Request,
  type StaffResourceDeactivationV1,
  type StaffResourceWorkspaceV1,
  type BookingDecisionV1Request,
} from "@wlbp/api-contracts";
import { getVerifiedIdentity } from "@wlbp/auth";
import type { RequestScopedSupabaseClient } from "@wlbp/supabase-client";

import type {
  BookingDetailV1,
  BookingHistoryEntryV1,
  BookingNoteV1,
  BookingSearchRowV1,
  CustomerBookingV1,
  CustomerConsentV1,
  CustomerDetailV1,
  CustomerRowV1,
  DashboardDataSource,
  BookingReportV1,
  PaymentExceptionV1,
  RefundRowV1,
  PrivacyRequestRowV1,
  TodayItemV1,
} from "./dashboard-access";

interface RpcError {
  readonly code?: string;
  readonly message?: string;
}

interface RpcResult {
  readonly data: unknown;
  readonly error: RpcError | null;
}

export class DashboardRpcError extends Error {
  /**
   * `code` is the SQLSTATE; `stableMessage` is the platform's published error
   * string, which is what a caller should branch on. Neither discloses the
   * conflicting row.
   */
  constructor(
    readonly code: string,
    readonly stableMessage: string | null = null,
  ) {
    super(`Dashboard API failed: ${code}`);
    this.name = "DashboardRpcError";
  }
}

interface RpcSchema {
  rpc(name: string, args?: Readonly<Record<string, unknown>>): PromiseLike<RpcResult>;
}

export interface TeamResourcesDataSource {
  deactivateResource(
    input: DeactivateResourceInput,
  ): Promise<StaffResourceDeactivationV1>;
  deactivateStaff(input: DeactivateStaffInput): Promise<StaffResourceDeactivationV1>;
  getStaffResourceWorkspace(
    tenantId: string,
    locale: "ar" | "en",
  ): Promise<StaffResourceWorkspaceV1>;
  saveResource(input: SaveResourceInput): Promise<void>;
  saveResourceType(input: SaveResourceTypeInput): Promise<void>;
  saveStaffProfile(input: SaveStaffProfileInput): Promise<void>;
  setResourceLocationEligibility(
    input: ResourceLocationEligibilityInput,
  ): Promise<void>;
  setResourceRequirement(input: ResourceRequirementInput): Promise<void>;
  setStaffServiceLocationEligibility(input: StaffEligibilityInput): Promise<void>;
}

function mapAvailabilityRows(rows: unknown, request: AvailabilityV1Request) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Availability returned no summary");
  }
  const mapped = rows.map((value) => {
    const row = firstRow(value);
    if (row === null) throw new Error("Availability returned an invalid row");
    return normalizeAvailabilityV1TransportRow(row);
  });
  const first = mapped[0]!;
  const slotRows = mapped.filter((row) => row.result_kind === "slot");
  return parseAvailabilityV1Response({
    advisory: true,
    displayTimeZone: first.customer_time_zone ?? request.timeZone,
    locationTimeZone: first.location_time_zone,
    noSlotReason:
      slotRows.length === 0
        ? first.no_slot_code === "none_available"
          ? "no_matching_availability"
          : first.no_slot_code
        : null,
    providerHealth: "not_applicable",
    slots: slotRows.map((row) => ({
      allocationKind: row.allocation_kind,
      endAt: row.slot_end,
      staffId: row.staff_id,
      startAt: row.slot_start,
    })),
  });
}

export interface DeactivateStaffInput {
  readonly reason: string;
  readonly replacementStaffId: string | null;
  readonly requestId: string;
  readonly resolution: "cancel" | "defer" | "reassign";
  readonly staffId: string;
  readonly tenantId: string;
}

export interface DeactivateResourceInput {
  readonly reason: string;
  readonly replacementResourceId: string | null;
  readonly requestId: string;
  readonly resolution: "cancel" | "defer" | "reassign";
  readonly resourceId: string;
  readonly tenantId: string;
}

export interface SaveStaffProfileInput {
  readonly bio: string;
  readonly expectedRevision: number | null;
  readonly internalNotes: string;
  readonly membershipId: string | null;
  readonly offeredHoursPerWeek: number;
  readonly publicName: string;
  readonly reason: string;
  readonly requestId: string;
  readonly staffId: string | null;
  readonly tenantId: string;
}

export interface SaveResourceTypeInput {
  readonly exclusive: boolean;
  readonly expectedRevision: number | null;
  readonly key: string;
  readonly name: string;
  readonly reason: string;
  readonly requestId: string;
  readonly resourceTypeId: string | null;
  readonly tenantId: string;
}

export interface SaveResourceInput {
  readonly expectedRevision: number | null;
  readonly internalNotes: string;
  readonly key: string;
  readonly publicName: string;
  readonly reason: string;
  readonly requestId: string;
  readonly resourceId: string | null;
  readonly resourceTypeId: string;
  readonly status: "active" | "maintenance";
  readonly tenantId: string;
}

export interface StaffEligibilityInput {
  readonly eligible: boolean;
  readonly locationId: string;
  readonly reason: string;
  readonly requestId: string;
  readonly serviceId: string;
  readonly staffId: string;
  readonly tenantId: string;
}

export interface ResourceLocationEligibilityInput {
  readonly eligible: boolean;
  readonly locationId: string;
  readonly reason: string;
  readonly requestId: string;
  readonly resourceId: string;
  readonly tenantId: string;
}

export interface ResourceRequirementInput {
  readonly reason: string;
  readonly requestId: string;
  readonly required: boolean;
  readonly resourceTypeId: string | null;
  readonly serviceId: string;
  readonly tenantId: string;
}

function firstRow(value: unknown): Record<string, unknown> | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (row === undefined || row === null) return null;
  if (typeof row !== "object" || Array.isArray(row)) {
    throw new Error("API returned an invalid row");
  }
  return row as Record<string, unknown>;
}

function requireString(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("API returned an invalid string");
  }
  return value;
}

function requireNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error("API returned an invalid number");
  }
  return value;
}

function requireStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) throw new Error("API returned an invalid array");
  return value.map(requireString);
}

function requireCapabilityGrants(value: unknown) {
  if (!Array.isArray(value)) throw new Error("API returned invalid capabilities");
  return value.map((item) => {
    if (
      typeof item !== "object" ||
      item === null ||
      Array.isArray(item) ||
      Object.keys(item).length !== 3 ||
      !("capability" in item) ||
      !("grantKind" in item) ||
      !("scopeKind" in item) ||
      typeof item.capability !== "string" ||
      !capabilityNames.includes(item.capability as CapabilityName) ||
      (item.grantKind !== "direct" && item.grantKind !== "approval") ||
      (item.scopeKind !== "tenant" &&
        item.scopeKind !== "location" &&
        item.scopeKind !== "own")
    ) {
      throw new Error("API returned an unknown capability");
    }
    return {
      capability: item.capability as CapabilityName,
      requiresApproval: item.grantKind === "approval",
      scope: item.scopeKind,
    };
  });
}

const todayQueues = new Set([
  "arrivals",
  "cancellations",
  "exceptions",
  "payments",
  "requests",
  "upcoming",
]);

function toTodayItem(value: unknown): TodayItemV1 {
  const row = value as Record<string, unknown>;
  const queue = String(row.queue ?? "upcoming");
  return {
    approvalDeadline:
      row.approval_deadline === null || row.approval_deadline === undefined
        ? null
        : new Date(String(row.approval_deadline)).toISOString(),
    bookingId: requireString(row.booking_id),
    bookingRevision: requireNumber(row.booking_revision),
    currency: typeof row.currency === "string" ? row.currency : "USD",
    // Null unless this member may read customer personal data.
    customerDisplayName:
      typeof row.customer_display_name === "string" ? row.customer_display_name : null,
    endAt: new Date(String(row.ends_at)).toISOString(),
    hasIntake: row.has_intake === true,
    locationName: requireString(row.location_name),
    locationTimeZone: requireString(row.location_time_zone),
    notificationStatus: String(row.notification_status ?? "queued"),
    paymentStatus: String(row.payment_status ?? "not_required"),
    priceMinor: typeof row.price_minor === "number" ? row.price_minor : 0,
    publicReference: requireString(row.public_reference),
    queue: (todayQueues.has(queue) ? queue : "upcoming") as TodayItemV1["queue"],
    serviceName: requireString(row.service_name),
    staffId: typeof row.staff_id === "string" ? row.staff_id : null,
    startAt: new Date(String(row.starts_at)).toISOString(),
    status: requireString(row.status),
  };
}

function toSearchRow(value: unknown): BookingSearchRowV1 {
  const row = value as Record<string, unknown>;
  return {
    bookingId: requireString(row.booking_id),
    bookingRevision: requireNumber(row.booking_revision),
    currency: typeof row.currency === "string" ? row.currency : "USD",
    // Null unless this member may read customer personal data.
    customerDisplayName:
      typeof row.customer_display_name === "string" ? row.customer_display_name : null,
    locationTimeZone: requireString(row.location_time_zone),
    noteCount: typeof row.note_count === "number" ? row.note_count : 0,
    notificationStatus: String(row.notification_status ?? "queued"),
    paymentStatus: String(row.payment_status ?? "not_required"),
    priceMinor: typeof row.price_minor === "number" ? row.price_minor : 0,
    publicReference: requireString(row.public_reference),
    serviceName: requireString(row.service_name),
    startAt: new Date(String(row.starts_at)).toISOString(),
    status: requireString(row.status),
  };
}

function toHistory(value: unknown): readonly BookingHistoryEntryV1[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const row = entry as Record<string, unknown>;
    return {
      actorKind: String(row.actorKind ?? "system"),
      createdAt: new Date(String(row.createdAt)).toISOString(),
      eventType: requireString(row.eventType),
      reason: typeof row.reason === "string" ? row.reason : null,
      sequence: Number(row.sequence ?? 0),
    };
  });
}

function toNotes(value: unknown): readonly BookingNoteV1[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const row = entry as Record<string, unknown>;
    // A visibility this client does not know is dropped rather than guessed:
    // rendering an unknown class of note as operational would be the one
    // mistake this surface must never make.
    const visibility = row.visibility;
    if (visibility !== "operational" && visibility !== "sensitive") return [];
    return [
      {
        body: requireString(row.body),
        createdAt: new Date(String(row.createdAt)).toISOString(),
        noteId: requireString(row.noteId),
        visibility,
      },
    ];
  });
}

function toBookingDetail(row: Record<string, unknown>): BookingDetailV1 {
  return {
    bookingId: requireString(row.booking_id),
    bookingRevision: requireNumber(row.booking_revision),
    cancelledAt:
      row.cancelled_at === null || row.cancelled_at === undefined
        ? null
        : new Date(String(row.cancelled_at)).toISOString(),
    currency: typeof row.currency === "string" ? row.currency : "USD",
    customerEmail: typeof row.customer_email === "string" ? row.customer_email : null,
    customerFullName:
      typeof row.customer_full_name === "string" ? row.customer_full_name : null,
    customerPhone: typeof row.customer_phone === "string" ? row.customer_phone : null,
    durationMinutes:
      typeof row.duration_minutes === "number" ? row.duration_minutes : 0,
    hasIntake: row.has_intake === true,
    history: toHistory(row.history),
    locationName: requireString(row.location_name),
    locationTimeZone: requireString(row.location_time_zone),
    notes: toNotes(row.notes),
    notificationStatus: String(row.notification_status ?? "queued"),
    paymentStatus: String(row.payment_status ?? "not_required"),
    priceMinor: typeof row.price_minor === "number" ? row.price_minor : 0,
    publicReference: requireString(row.public_reference),
    refundEligibleMinor:
      typeof row.refund_eligible_minor === "number" ? row.refund_eligible_minor : null,
    rescheduleCount:
      typeof row.reschedule_count === "number" ? row.reschedule_count : 0,
    serviceName: requireString(row.service_name),
    startAt: new Date(String(row.starts_at)).toISOString(),
    status: requireString(row.status),
  };
}

function toCustomerRow(value: unknown): CustomerRowV1 {
  const row = value as Record<string, unknown>;
  return {
    bookingCount: Number(row.booking_count ?? 0),
    customerId: requireString(row.customer_id),
    // Null once erased. The surface reads absence as erasure rather than
    // rendering a placeholder that looks like a real address.
    email: typeof row.email === "string" ? row.email : null,
    erased: row.erased === true,
    fullName: typeof row.full_name === "string" ? row.full_name : null,
    lastBookingAt:
      row.last_booking_at === null || row.last_booking_at === undefined
        ? null
        : new Date(String(row.last_booking_at)).toISOString(),
    legalHold: row.legal_hold === true,
    phone: typeof row.phone === "string" ? row.phone : null,
    restricted: row.restricted === true,
    suppressed: row.suppressed === true,
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
  };
}

function toCustomerBookings(value: unknown): readonly CustomerBookingV1[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const row = entry as Record<string, unknown>;
    return {
      bookingId: requireString(row.booking_id),
      contactName: typeof row.contact_name === "string" ? row.contact_name : null,
      publicReference: requireString(row.public_reference),
      serviceName: requireString(row.service_name),
      startAt: new Date(String(row.starts_at)).toISOString(),
      status: requireString(row.status),
    };
  });
}

function toConsents(value: unknown): readonly CustomerConsentV1[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const row = entry as Record<string, unknown>;
    return {
      acceptedAt: new Date(String(row.accepted_at)).toISOString(),
      policyKey: requireString(row.policy_key),
      policyVersion: Number(row.policy_version ?? 1),
      source: String(row.source ?? "booking"),
    };
  });
}

function toCustomerDetail(row: Record<string, unknown>): CustomerDetailV1 {
  return {
    bookings: toCustomerBookings(row.bookings),
    consents: toConsents(row.consents),
    createdAt: new Date(String(row.created_at)).toISOString(),
    customerId: requireString(row.customer_id),
    email: typeof row.email === "string" ? row.email : null,
    erased: row.erased === true,
    fullName: typeof row.full_name === "string" ? row.full_name : null,
    intakeCount: Number(row.intake_count ?? 0),
    legalHold: row.legal_hold === true,
    phone: typeof row.phone === "string" ? row.phone : null,
    restricted: row.restricted === true,
    restrictionReason:
      typeof row.restriction_reason === "string" ? row.restriction_reason : null,
    revision: requireNumber(row.revision),
    sensitiveNoteCount: Number(row.sensitive_note_count ?? 0),
    suppressed: row.suppressed === true,
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
  };
}

function toPrivacyRequestRow(value: unknown): PrivacyRequestRowV1 {
  const row = value as Record<string, unknown>;
  return {
    blockedReason: typeof row.blocked_reason === "string" ? row.blocked_reason : null,
    completedAt:
      row.completed_at === null || row.completed_at === undefined
        ? null
        : new Date(String(row.completed_at)).toISOString(),
    createdAt: new Date(String(row.created_at)).toISOString(),
    customerId: typeof row.customer_id === "string" ? row.customer_id : null,
    kind: requireString(row.kind),
    offboardingPhase:
      typeof row.offboarding_phase === "string" ? row.offboarding_phase : null,
    pendingSteps: Number(row.pending_steps ?? 0),
    requestId: requireString(row.request_id),
    status: requireString(row.status),
  };
}

function toPaymentException(value: unknown): PaymentExceptionV1 {
  const row = value as Record<string, unknown>;
  return {
    amountMinorUnits:
      typeof row.amount_minor_units === "number" ? row.amount_minor_units : null,
    bookingId: typeof row.booking_id === "string" ? row.booking_id : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    currency: typeof row.currency === "string" ? row.currency : null,
    detailCode: requireString(row.detail_code),
    exceptionId: requireString(row.exception_id),
    kind: requireString(row.kind),
    providerReference:
      typeof row.provider_reference === "string" ? row.provider_reference : null,
    publicReference:
      typeof row.public_reference === "string" ? row.public_reference : null,
    resolution: typeof row.resolution === "string" ? row.resolution : null,
    resolvedAt:
      row.resolved_at === null || row.resolved_at === undefined
        ? null
        : new Date(String(row.resolved_at)).toISOString(),
    severity: String(row.severity ?? "action_required"),
    status: requireString(row.status),
    subjectKind: requireString(row.subject_kind),
  };
}

function toRefundRow(value: unknown): RefundRowV1 {
  const row = value as Record<string, unknown>;
  return {
    amountMinorUnits: Number(row.amount_minor_units ?? 0),
    attempts: Number(row.attempts ?? 0),
    bookingId: typeof row.booking_id === "string" ? row.booking_id : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    currency: String(row.currency ?? "USD"),
    failureCode: typeof row.failure_code === "string" ? row.failure_code : null,
    publicReference:
      typeof row.public_reference === "string" ? row.public_reference : null,
    reason: String(row.reason ?? "requested_by_customer"),
    refundId: requireString(row.refund_id),
    status: requireString(row.status),
  };
}

function toBookingReport(row: Record<string, unknown>): BookingReportV1 {
  return {
    averageLeadTimeMinutes: Number(row.average_lead_time_minutes ?? 0),
    bookingsCancelled: Number(row.bookings_cancelled ?? 0),
    bookingsCompleted: Number(row.bookings_completed ?? 0),
    bookingsConfirmed: Number(row.bookings_confirmed ?? 0),
    bookingsCreated: Number(row.bookings_created ?? 0),
    bookingsNoShow: Number(row.bookings_no_show ?? 0),
    bookingsRequested: Number(row.bookings_requested ?? 0),
    completionRateBps: Number(row.completion_rate_bps ?? 0),
    medianLeadTimeMinutes: Number(row.median_lead_time_minutes ?? 0),
    noShowRateBps: Number(row.no_show_rate_bps ?? 0),
    outcomeDenominator: Number(row.outcome_denominator ?? 0),
    reportDefinitionVersion: Number(row.report_definition_version ?? 1),
    timeZone: String(row.time_zone ?? "UTC"),
  };
}

function assertRpc(result: RpcResult): unknown {
  if (result.error !== null) {
    throw new DashboardRpcError(
      result.error.code ?? "unknown",
      result.error.message ?? null,
    );
  }
  return result.data;
}

export function createDashboardDataSource(
  client: RequestScopedSupabaseClient,
): DashboardDataSource & TeamResourcesDataSource {
  const api = client.schema("api_v1") as unknown as RpcSchema;

  return {
    getAvailability: async (hostname, request) => {
      const rows = assertRpc(
        await api.rpc("get_availability_v1", {
          p_application: "dashboard",
          p_customer_time_zone: request.timeZone,
          p_hostname: hostname,
          p_location_id: request.locationId,
          p_party_size: request.partySize,
          p_service_id: request.serviceId,
          p_staff_preference_id: request.staffPreferenceId,
          p_window_end: request.endBefore,
          p_window_start: request.startAfter,
        }),
      );
      return mapAvailabilityRows(rows, request);
    },
    deactivateResource: async (input) => {
      const row = firstRow(
        assertRpc(
          await api.rpc("deactivate_resource_v1", {
            p_reason: input.reason,
            p_replacement_resource_id: input.replacementResourceId,
            p_request_id: input.requestId,
            p_resolution: input.resolution,
            p_resource_id: input.resourceId,
            p_tenant_id: input.tenantId,
          }),
        ),
      );
      if (row === null) throw new Error("Resource deactivation returned no result");
      return parseStaffResourceDeactivationV1({
        outcome: row.outcome,
        remainingAllocationCount: row.remaining_allocations,
        targetId: row.resource_id,
      });
    },

    deactivateStaff: async (input) => {
      const row = firstRow(
        assertRpc(
          await api.rpc("deactivate_staff_v1", {
            p_reason: input.reason,
            p_replacement_staff_id: input.replacementStaffId,
            p_request_id: input.requestId,
            p_resolution: input.resolution,
            p_staff_id: input.staffId,
            p_tenant_id: input.tenantId,
          }),
        ),
      );
      if (row === null) throw new Error("Staff deactivation returned no result");
      return parseStaffResourceDeactivationV1({
        outcome: row.outcome,
        remainingAllocationCount: row.remaining_allocations,
        targetId: row.staff_id,
      });
    },

    getStaffResourceWorkspace: async (tenantId, locale) => {
      const [rawRows, rawChoices] = await Promise.all([
        api.rpc("get_staff_resource_workspace_v1", { p_tenant_id: tenantId }),
        api.rpc("get_staff_resource_choices_v1", {
          p_locale: locale,
          p_tenant_id: tenantId,
        }),
      ]);
      const rows = assertRpc(rawRows);
      const choices = assertRpc(rawChoices);
      if (!Array.isArray(rows)) {
        throw new Error("Staff/resource workspace is invalid");
      }
      if (!Array.isArray(choices)) {
        throw new Error("Staff/resource choices are invalid");
      }
      const choiceRows = choices.map((rawRow) => {
        const row = firstRow(rawRow);
        if (row === null) throw new Error("Staff/resource choice is invalid");
        return row;
      });
      return parseStaffResourceWorkspaceV1({
        tenantId,
        locations: choiceRows
          .filter((row) => row.choice_kind === "location")
          .map((row) => ({ id: row.choice_id, name: row.choice_name })),
        resourceTypes: choiceRows
          .filter((row) => row.choice_kind === "resource_type")
          .map((row) => ({
            exclusive: row.exclusive,
            id: row.choice_id,
            key: row.choice_key,
            name: row.choice_name,
            revision: row.revision,
          })),
        services: choiceRows
          .filter((row) => row.choice_kind === "service")
          .map((row) => ({ id: row.choice_id, name: row.choice_name })),
        items: rows.map((rawRow) => {
          const row = firstRow(rawRow);
          if (row === null || row.tenant_id !== tenantId) {
            throw new Error("Staff/resource workspace tenant mismatch");
          }
          return {
            futureAllocationCount: row.future_allocation_count,
            id: row.item_id,
            internalNotes: row.internal_notes,
            key: row.item_key,
            kind: row.item_kind,
            locationIds: row.location_ids,
            membershipId: row.membership_id,
            name: row.name,
            offeredHoursPerWeek: row.offered_hours_per_week,
            publicBio: row.public_bio,
            resourceTypeId: row.resource_type_id,
            resourceTypeName: row.resource_type_name,
            revision: row.revision,
            serviceIds: row.service_ids,
            status: row.status,
          };
        }),
      });
    },

    saveResource: async (input) => {
      assertRpc(
        await api.rpc("save_resource_v1", {
          p_expected_revision: input.expectedRevision,
          p_internal_notes: input.internalNotes,
          p_key: input.key,
          p_public_name: input.publicName,
          p_reason: input.reason,
          p_request_id: input.requestId,
          p_resource_id: input.resourceId,
          p_resource_type_id: input.resourceTypeId,
          p_status: input.status,
          p_tenant_id: input.tenantId,
        }),
      );
    },

    saveResourceType: async (input) => {
      assertRpc(
        await api.rpc("save_resource_type_v1", {
          p_exclusive: input.exclusive,
          p_expected_revision: input.expectedRevision,
          p_key: input.key,
          p_name: input.name,
          p_reason: input.reason,
          p_request_id: input.requestId,
          p_resource_type_id: input.resourceTypeId,
          p_tenant_id: input.tenantId,
        }),
      );
    },

    saveStaffProfile: async (input) => {
      assertRpc(
        await api.rpc("save_staff_profile_v1", {
          p_public_bio: input.bio,
          p_expected_revision: input.expectedRevision,
          p_internal_notes: input.internalNotes,
          p_membership_id: input.membershipId,
          p_offered_hours_per_week: input.offeredHoursPerWeek,
          p_public_name: input.publicName,
          p_reason: input.reason,
          p_request_id: input.requestId,
          p_staff_id: input.staffId,
          p_tenant_id: input.tenantId,
        }),
      );
    },

    setResourceLocationEligibility: async (input) => {
      assertRpc(
        await api.rpc("set_resource_location_eligibility_v1", {
          p_eligible: input.eligible,
          p_location_id: input.locationId,
          p_reason: input.reason,
          p_request_id: input.requestId,
          p_resource_id: input.resourceId,
          p_tenant_id: input.tenantId,
        }),
      );
    },

    setResourceRequirement: async (input) => {
      assertRpc(
        await api.rpc("set_resource_requirement_v1", {
          p_reason: input.reason,
          p_request_id: input.requestId,
          p_required: input.required,
          p_resource_type_id: input.resourceTypeId,
          p_service_id: input.serviceId,
          p_tenant_id: input.tenantId,
        }),
      );
    },

    setStaffServiceLocationEligibility: async (input) => {
      assertRpc(
        await api.rpc("set_staff_service_location_eligibility_v1", {
          p_eligible: input.eligible,
          p_location_id: input.locationId,
          p_reason: input.reason,
          p_request_id: input.requestId,
          p_service_id: input.serviceId,
          p_staff_id: input.staffId,
          p_tenant_id: input.tenantId,
        }),
      );
    },

    getVerifiedIdentity: async () =>
      getVerifiedIdentity(client as Parameters<typeof getVerifiedIdentity>[0]),

    resolveTenant: async (hostname) => {
      const row = firstRow(
        assertRpc(
          await api.rpc("resolve_public_tenant_v1", {
            p_application: "dashboard",
            p_hostname: hostname,
          }),
        ),
      );
      if (row === null) return null;
      return parseResolvePublicTenantV1({
        brandId: row.brand_id,
        configRevision: row.config_version,
        deploymentState: row.deployment_state,
        featureRevision: row.feature_version,
        hostname: row.hostname,
        instanceId: row.instance_id,
        publishedBrandRevision: row.published_brand_revision,
        tenantId: row.tenant_id,
      });
    },

    listTenantChoices: async () => {
      const rows = assertRpc(await api.rpc("list_tenant_choices_v1"));
      if (!Array.isArray(rows)) throw new Error("Tenant choices are invalid");
      return parseTenantChoicesV1(
        rows.map((rawRow) => {
          const row = firstRow(rawRow);
          if (row === null) throw new Error("Tenant choice is invalid");
          return {
            dashboardHostname: row.dashboard_hostname,
            membershipId: row.membership_id,
            roleKey: row.role_key,
            tenantId: row.tenant_id,
            tenantName: row.tenant_name,
          };
        }),
      );
    },

    getDashboardContext: async (tenantId) => {
      const row = firstRow(
        assertRpc(await api.rpc("get_dashboard_context_v1", { p_tenant_id: tenantId })),
      );
      if (row === null) throw new Error("Dashboard membership is not active");

      const locationIds = requireStringArray(row.location_ids);
      const grants = requireCapabilityGrants(row.capabilities);
      const locationScopeMode = requireString(row.location_scope_mode);

      return parseDashboardContextV1({
        aal2: row.aal2,
        brandId: row.brand_id,
        configRevision: requireNumber(row.config_version),
        dashboardHostname: row.dashboard_hostname,
        defaultLocale: row.default_locale,
        featureRevision: requireNumber(row.feature_version),
        grants,
        instanceId: row.instance_id,
        locationIds,
        locationScope:
          locationScopeMode === "tenant"
            ? { kind: "all" }
            : locationScopeMode === "assigned"
              ? { kind: "restricted", locationIds }
              : null,
        membershipId: row.membership_id,
        publishedBrandRevision: requireNumber(row.published_brand_revision),
        roleKey: row.role_key,
        tenantId: row.tenant_id,
        tenantName: row.tenant_name,
      });
    },

    getScheduleWorkspace: async (tenantId, locationId) => {
      const rows = assertRpc(
        await api.rpc("get_schedule_workspace_v1", {
          p_tenant_id: tenantId,
          ...(locationId === undefined ? {} : { p_location_id: locationId }),
        }),
      );
      return parseScheduleWorkspaceV1(rows);
    },

    listBookingRequests: async (tenantId) => {
      const rows = assertRpc(
        await api.rpc("list_booking_requests_v1", { p_tenant_id: tenantId }),
      );
      return parseBookingRequestsV1(
        (Array.isArray(rows) ? rows : []).map((value) => {
          const row = value as Record<string, unknown>;
          return {
            approvalDeadline: new Date(String(row.approval_deadline)).toISOString(),
            bookingId: row.booking_id,
            bookingRevision: Number(row.booking_revision),
            // Null unless this member may read customer personal data: the
            // contact row is behind its own policy, not this DTO.
            customerDisplayName: row.customer_display_name ?? null,
            endAt: new Date(String(row.ends_at)).toISOString(),
            hasIntake: row.has_intake === true,
            locale: row.locale,
            locationId: row.location_id,
            locationName: row.location_name,
            locationTimeZone: row.location_time_zone,
            price: { currency: row.currency, minorUnits: Number(row.price_minor) },
            proposal:
              row.proposal_state === "pending"
                ? {
                    expiresAt: new Date(String(row.proposal_expires_at)).toISOString(),
                    startAt: new Date(String(row.proposal_starts_at)).toISOString(),
                  }
                : null,
            publicReference: row.public_reference,
            requestedAt: new Date(String(row.requested_at)).toISOString(),
            serviceName: row.service_name,
            startAt: new Date(String(row.starts_at)).toISOString(),
          };
        }),
      );
    },

    decideBookingRequest: async (request: BookingDecisionV1Request) => {
      const decision = parseBookingDecisionV1Request(request);
      const row = firstRow(
        assertRpc(
          await api.rpc("decide_booking_request_v1", {
            p_action: decision.action,
            p_booking_id: decision.bookingId,
            p_expected_revision: decision.expectedRevision,
            p_proposed_start: decision.proposedStartAt,
            p_reason_internal: decision.internalReason,
            p_reason_public: decision.publicReason,
            p_request_id: crypto.randomUUID(),
            p_tenant_id: decision.tenantId,
          }),
        ),
      );
      if (row === null) throw new Error("Booking decision returned no result");
      return parseBookingDecisionV1Response({
        approvalStatus: row.approval_status,
        bookingId: row.booking_id,
        bookingRevision: Number(row.booking_revision),
        proposalActionToken: row.proposal_action_token ?? null,
        proposalExpiresAt:
          row.proposal_expires_at === null || row.proposal_expires_at === undefined
            ? null
            : new Date(String(row.proposal_expires_at)).toISOString(),
        status: row.status,
      });
    },

    getTodayWorkspace: async (request) => {
      const rows = assertRpc(
        await api.rpc("get_today_workspace_v1", {
          p_from: request.from,
          p_tenant_id: request.tenantId,
          p_to: request.to,
        }),
      );
      return (Array.isArray(rows) ? rows : []).map(toTodayItem);
    },

    listCalendar: async (request) => {
      const rows = assertRpc(
        await api.rpc("list_calendar_v1", {
          p_from: request.from,
          p_location_id: request.locationId,
          p_service_id: request.serviceId,
          p_staff_id: request.staffId,
          p_tenant_id: request.tenantId,
          p_to: request.to,
        }),
      );
      // The calendar and the queues render the same shape, so one component
      // can show a booking wherever an operator meets it.
      return (Array.isArray(rows) ? rows : []).map((row) =>
        toTodayItem({ ...(row as Record<string, unknown>), queue: "upcoming" }),
      );
    },

    resendBookingNotification: async (request) => {
      assertRpc(
        await api.rpc("replay_booking_notification_v1", {
          p_booking_id: request.bookingId,
          p_tenant_id: request.tenantId,
        }),
      );
    },

    changeBooking: async (request) => {
      // Both transitions are the database's, not this client's: it only carries
      // the revision the reader acted on.
      if (request.action === "cancel") {
        assertRpc(
          await api.rpc("cancel_booking_v1", {
            p_booking_id: request.bookingId,
            p_expected_revision: request.expectedRevision,
            p_reason_internal: request.internalReason,
            p_reason_public: request.publicReason,
            p_request_id: crypto.randomUUID(),
            p_tenant_id: request.tenantId,
          }),
        );
        return;
      }
      assertRpc(
        await api.rpc("reschedule_booking_v1", {
          p_booking_id: request.bookingId,
          p_expected_revision: request.expectedRevision,
          p_new_start: request.newStartAt,
          p_reason_internal: request.internalReason,
          p_request_id: crypto.randomUUID(),
          p_tenant_id: request.tenantId,
        }),
      );
    },

    searchBookings: async (request) => {
      const rows = assertRpc(
        await api.rpc("search_bookings_v1", {
          p_from: request.from,
          p_location_id: request.locationId,
          p_query: request.query,
          p_staff_id: request.staffId,
          p_status: request.status,
          p_tenant_id: request.tenantId,
          p_to: request.to,
        }),
      );
      return (Array.isArray(rows) ? rows : []).map(toSearchRow);
    },

    getBookingDetail: async (request) => {
      const row = firstRow(
        assertRpc(
          await api.rpc("get_booking_detail_v1", {
            p_booking_id: request.bookingId,
            p_tenant_id: request.tenantId,
          }),
        ),
      );
      // No row means row level security did not grant this booking to this
      // member. That is a missing booking to the caller, never a hint.
      return row === null ? null : toBookingDetail(row);
    },

    transitionBooking: async (request) => {
      // The state machine is the database's. This carries the revision the
      // reader acted on and the key that makes a double submit one act.
      assertRpc(
        await api.rpc("transition_booking_v1", {
          p_action: request.action,
          p_booking_id: request.bookingId,
          p_expected_revision: request.expectedRevision,
          p_idempotency_key: request.idempotencyKey,
          p_reason: request.reason,
          p_request_id: crypto.randomUUID(),
          p_tenant_id: request.tenantId,
        }),
      );
    },

    addBookingNote: async (request) => {
      assertRpc(
        await api.rpc("add_booking_note_v1", {
          p_body: request.body,
          p_booking_id: request.bookingId,
          p_request_id: crypto.randomUUID(),
          p_tenant_id: request.tenantId,
          p_visibility: request.visibility,
        }),
      );
    },

    searchCustomers: async (request) => {
      const rows = assertRpc(
        await api.rpc("search_customers_v1", {
          p_include_erased: request.includeErased,
          p_query: request.query,
          p_tenant_id: request.tenantId,
        }),
      );
      return (Array.isArray(rows) ? rows : []).map(toCustomerRow);
    },

    getCustomerDetail: async (request) => {
      const row = firstRow(
        assertRpc(
          await api.rpc("get_customer_detail_v1", {
            p_customer_id: request.customerId,
            p_tenant_id: request.tenantId,
          }),
        ),
      );
      // No row means row level security did not grant this customer to this
      // member. Absent and forbidden read identically on purpose.
      return row === null ? null : toCustomerDetail(row);
    },

    correctCustomer: async (request) => {
      assertRpc(
        await api.rpc("correct_customer_v1", {
          p_customer_id: request.customerId,
          p_email: request.email,
          p_expected_revision: request.expectedRevision,
          p_full_name: request.fullName,
          p_phone: request.phone,
          p_tags: request.tags,
          p_tenant_id: request.tenantId,
        }),
      );
    },

    setCustomerRestriction: async (request) => {
      assertRpc(
        await api.rpc("set_customer_restriction_v1", {
          p_customer_id: request.customerId,
          p_reason: request.reason,
          p_restricted: request.restricted,
          p_tenant_id: request.tenantId,
        }),
      );
    },

    setLegalHold: async (request) => {
      assertRpc(
        await api.rpc("set_legal_hold_v1", {
          p_customer_id: request.customerId,
          p_hold: request.hold,
          p_reason: request.reason,
          p_tenant_id: request.tenantId,
        }),
      );
    },

    openPrivacyRequest: async (request) => {
      const id = assertRpc(
        await api.rpc("open_privacy_request_v1", {
          p_customer_id: request.customerId,
          p_kind: request.kind,
          p_tenant_id: request.tenantId,
        }),
      );
      return String(id);
    },

    runPrivacyRequest: async (request) => {
      // Restartable on the database side, so a retry after a lost response
      // resumes the same job instead of starting a second one.
      assertRpc(
        await api.rpc("run_privacy_request_v1", {
          p_request_id: request.requestId,
          p_tenant_id: request.tenantId,
        }),
      );
    },

    getPrivacyRequest: async (request) => {
      const row = firstRow(
        assertRpc(
          await api.rpc("get_privacy_request_v1", {
            p_request_id: request.requestId,
            p_tenant_id: request.tenantId,
          }),
        ),
      );
      if (row === null) return null;
      return {
        // Null unless this caller may export and stepped up, and unexpired.
        artifact: row.artifact ?? null,
        artifactExpiresAt:
          row.artifact_expires_at === null || row.artifact_expires_at === undefined
            ? null
            : new Date(String(row.artifact_expires_at)).toISOString(),
        blockedReason:
          typeof row.blocked_reason === "string" ? row.blocked_reason : null,
        kind: requireString(row.kind),
        requestId: requireString(row.request_id),
        status: requireString(row.status),
        steps: (Array.isArray(row.steps) ? row.steps : []).map((entry) => {
          const step = entry as Record<string, unknown>;
          return {
            outcomeCode:
              typeof step.outcome_code === "string" ? step.outcome_code : null,
            status: String(step.status ?? "pending"),
            subsystem: requireString(step.subsystem),
          };
        }),
      };
    },

    getBookingReport: async (request) => {
      const row = firstRow(
        assertRpc(
          await api.rpc("get_booking_report_v1", {
            p_from: request.from,
            p_location_id: request.locationId,
            p_tenant_id: request.tenantId,
            p_time_zone: request.timeZone,
            p_to: request.to,
          }),
        ),
      );
      return row === null ? null : toBookingReport(row);
    },

    getUtilizationReport: async (request) => {
      const rows = assertRpc(
        await api.rpc("get_utilization_report_v1", {
          p_from: request.from,
          p_location_id: request.locationId,
          p_tenant_id: request.tenantId,
          p_time_zone: request.timeZone,
          p_to: request.to,
        }),
      );
      return (Array.isArray(rows) ? rows : []).map((value) => {
        const row = value as Record<string, unknown>;
        return {
          bookedMinutes: Number(row.booked_minutes ?? 0),
          bookingCount: Number(row.booking_count ?? 0),
          offeredMinutes: Number(row.offered_minutes ?? 0),
          staffId: requireString(row.staff_id),
          staffName: typeof row.staff_name === "string" ? row.staff_name : null,
          utilizationBps: Number(row.utilization_bps ?? 0),
        };
      });
    },

    getRevenueReport: async (request) => {
      // The database refuses this without the financial capability, so a
      // reader who may not see money gets no revenue panel rather than zeroes.
      const row = firstRow(
        assertRpc(
          await api.rpc("get_revenue_report_v1", {
            p_from: request.from,
            p_tenant_id: request.tenantId,
            p_time_zone: request.timeZone,
            p_to: request.to,
          }),
        ),
      );
      if (row === null) return null;
      return {
        averageOrderValueMinor: Number(row.average_order_value_minor ?? 0),
        chargeCount: Number(row.charge_count ?? 0),
        chargedMinor: Number(row.charged_minor ?? 0),
        currency: String(row.currency ?? ""),
        netMinor: Number(row.net_minor ?? 0),
        outstandingMinor: Number(row.outstanding_minor ?? 0),
        refundCount: Number(row.refund_count ?? 0),
        refundedMinor: Number(row.refunded_minor ?? 0),
        unsettledPayments: Number(row.unsettled_payments ?? 0),
      };
    },

    runReportExport: async (request) => {
      const row = firstRow(
        assertRpc(
          await api.rpc("run_report_export_v1", {
            p_from: request.from,
            p_location_id: request.locationId,
            p_report_key: request.reportKey,
            p_tenant_id: request.tenantId,
            p_time_zone: request.timeZone,
            p_to: request.to,
          }),
        ),
      );
      return String(row?.export_id ?? "");
    },

    getReportExport: async (request) => {
      const row = firstRow(
        assertRpc(
          await api.rpc("get_report_export_v1", {
            p_export_id: request.exportId,
            p_tenant_id: request.tenantId,
          }),
        ),
      );
      if (row === null) return null;
      return {
        exportId: requireString(row.export_id),
        expiresAt:
          row.expires_at === null || row.expires_at === undefined
            ? null
            : new Date(String(row.expires_at)).toISOString(),
        reportKey: requireString(row.report_key),
        // Null once expired, or when the reader may not see the money it holds.
        rows: Array.isArray(row.rows_payload)
          ? (row.rows_payload as Readonly<Record<string, unknown>>[])
          : [],
        rowCount: Number(row.row_count ?? 0),
        status: requireString(row.status),
      };
    },

    listPaymentExceptions: async (request) => {
      const rows = assertRpc(
        await api.rpc("list_payment_exceptions_v1", {
          p_status: request.status,
          p_tenant_id: request.tenantId,
        }),
      );
      return (Array.isArray(rows) ? rows : []).map(toPaymentException);
    },

    listRefunds: async (request) => {
      const rows = assertRpc(
        await api.rpc("list_refunds_v1", {
          p_booking_id: request.bookingId,
          p_tenant_id: request.tenantId,
        }),
      );
      return (Array.isArray(rows) ? rows : []).map(toRefundRow);
    },

    requestRefund: async (request) => {
      // Eligibility and amount were decided at cancellation. This asks for the
      // refund that was already earned; it never proposes a figure.
      assertRpc(
        await api.rpc("request_refund_v1", {
          p_booking_id: request.bookingId,
          p_idempotency_key: request.idempotencyKey,
          p_reason: request.reason,
          p_tenant_id: request.tenantId,
        }),
      );
    },

    resolvePaymentException: async (request) => {
      assertRpc(
        await api.rpc("resolve_payment_exception_v1", {
          p_exception_id: request.exceptionId,
          p_note: request.note,
          p_resolution: request.resolution,
          p_tenant_id: request.tenantId,
        }),
      );
    },

    listPrivacyRequests: async (request) => {
      const rows = assertRpc(
        await api.rpc("list_privacy_requests_v1", {
          p_customer_id: request.customerId,
          p_tenant_id: request.tenantId,
        }),
      );
      return (Array.isArray(rows) ? rows : []).map(toPrivacyRequestRow);
    },

    saveScheduleConfig: async (request) => {
      const row = firstRow(
        assertRpc(
          await api.rpc("save_schedule_config_v1", {
            p_tenant_id: request.tenantId,
            p_operation: request.operation,
            p_payload: request.payload,
            p_expected_revision: request.expectedRevision,
            p_request_id: crypto.randomUUID(),
          }),
        ),
      );
      if (row === null) throw new Error("Schedule save returned no result");
      return parseSaveScheduleConfigV1({
        targetId: row.target_id,
        revision: row.revision,
      });
    },
  };
}
