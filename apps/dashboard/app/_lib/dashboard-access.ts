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
  getTodayWorkspace?: (request: {
    from: string;
    tenantId: string;
    to: string;
  }) => Promise<readonly TodayItemV1[]>;
  listCalendar?: (request: {
    from: string;
    locationId: string | null;
    serviceId: string | null;
    staffId: string | null;
    tenantId: string;
    to: string;
  }) => Promise<readonly TodayItemV1[]>;
  resendBookingNotification?: (request: {
    bookingId: string;
    tenantId: string;
  }) => Promise<void>;
  changeBooking?: (request: {
    action: "cancel" | "reschedule";
    bookingId: string;
    expectedRevision: number;
    internalReason: string | null;
    newStartAt: string | null;
    publicReason: string | null;
    tenantId: string;
  }) => Promise<void>;
  searchBookings?: (
    request: BookingSearchV1Request,
  ) => Promise<readonly BookingSearchRowV1[]>;
  getBookingDetail?: (request: {
    bookingId: string;
    tenantId: string;
  }) => Promise<BookingDetailV1 | null>;
  transitionBooking?: (request: {
    action: BookingTransitionAction;
    bookingId: string;
    expectedRevision: number;
    idempotencyKey: string;
    reason: string | null;
    tenantId: string;
  }) => Promise<void>;
  addBookingNote?: (request: {
    bookingId: string;
    body: string;
    tenantId: string;
    visibility: BookingNoteVisibility;
  }) => Promise<void>;
  searchCustomers?: (request: {
    includeErased: boolean;
    query: string | null;
    tenantId: string;
  }) => Promise<readonly CustomerRowV1[]>;
  getCustomerDetail?: (request: {
    customerId: string;
    tenantId: string;
  }) => Promise<CustomerDetailV1 | null>;
  correctCustomer?: (request: {
    customerId: string;
    email: string;
    expectedRevision: number;
    fullName: string;
    phone: string | null;
    tags: readonly string[];
    tenantId: string;
  }) => Promise<void>;
  setCustomerRestriction?: (request: {
    customerId: string;
    reason: string | null;
    restricted: boolean;
    tenantId: string;
  }) => Promise<void>;
  setLegalHold?: (request: {
    customerId: string;
    hold: boolean;
    reason: string;
    tenantId: string;
  }) => Promise<void>;
  openPrivacyRequest?: (request: {
    customerId: string;
    kind: PrivacyRequestKind;
    tenantId: string;
  }) => Promise<string>;
  runPrivacyRequest?: (request: {
    requestId: string;
    tenantId: string;
  }) => Promise<void>;
  getPrivacyRequest?: (request: {
    requestId: string;
    tenantId: string;
  }) => Promise<PrivacyRequestDetailV1 | null>;
  listPaymentExceptions?: (request: {
    status: string | null;
    tenantId: string;
  }) => Promise<readonly PaymentExceptionV1[]>;
  listRefunds?: (request: {
    bookingId: string | null;
    tenantId: string;
  }) => Promise<readonly RefundRowV1[]>;
  requestRefund?: (request: {
    bookingId: string;
    idempotencyKey: string;
    reason: string;
    tenantId: string;
  }) => Promise<void>;
  resolvePaymentException?: (request: {
    exceptionId: string;
    note: string | null;
    resolution: PaymentExceptionResolution;
    tenantId: string;
  }) => Promise<void>;
  listPrivacyRequests?: (request: {
    customerId: string | null;
    tenantId: string;
  }) => Promise<readonly PrivacyRequestRowV1[]>;
}

/** The privacy rights this surface can start as a job (issue #18). */
export type PrivacyRequestKind = "deletion" | "export";

/** One row of the customer directory. */
export interface CustomerRowV1 {
  readonly bookingCount: number;
  readonly customerId: string;
  readonly email: string | null;
  readonly erased: boolean;
  readonly fullName: string | null;
  readonly lastBookingAt: string | null;
  readonly legalHold: boolean;
  readonly phone: string | null;
  readonly restricted: boolean;
  readonly suppressed: boolean;
  readonly tags: readonly string[];
}

/** One booking as the customer record sees it: the snapshot, not current identity. */
export interface CustomerBookingV1 {
  readonly bookingId: string;
  readonly contactName: string | null;
  readonly publicReference: string;
  readonly serviceName: string;
  readonly startAt: string;
  readonly status: string;
}

/** Minimal consent evidence: the document and version, never its text. */
export interface CustomerConsentV1 {
  readonly acceptedAt: string;
  readonly policyKey: string;
  readonly policyVersion: number;
  readonly source: string;
}

export interface CustomerDetailV1 {
  readonly bookings: readonly CustomerBookingV1[];
  readonly consents: readonly CustomerConsentV1[];
  readonly createdAt: string;
  readonly customerId: string;
  readonly email: string | null;
  readonly erased: boolean;
  readonly fullName: string | null;
  readonly intakeCount: number;
  readonly legalHold: boolean;
  readonly phone: string | null;
  readonly restricted: boolean;
  readonly restrictionReason: string | null;
  readonly revision: number;
  readonly sensitiveNoteCount: number;
  readonly suppressed: boolean;
  readonly tags: readonly string[];
}

/**
 * A finished job with its per-subsystem outcomes and, for an export the caller
 * is entitled to and has stepped up for, the artifact itself. The list surface
 * cannot carry this: the artifact is excluded from the table grant and comes
 * back only from the function that re-checks capability.
 */
export interface PrivacyRequestDetailV1 {
  readonly artifact: unknown;
  readonly artifactExpiresAt: string | null;
  readonly blockedReason: string | null;
  readonly kind: string;
  readonly requestId: string;
  readonly status: string;
  readonly steps: readonly {
    readonly outcomeCode: string | null;
    readonly status: string;
    readonly subsystem: string;
  }[];
}

/** How an operator can close a queue item. The database owns which are valid. */
export type PaymentExceptionResolution =
  "contested" | "no_action_needed" | "reconciled" | "refunded" | "written_off";

/** One item in the money queue (issue #23). Carries no customer PII by design. */
export interface PaymentExceptionV1 {
  readonly amountMinorUnits: number | null;
  readonly bookingId: string | null;
  readonly createdAt: string;
  readonly currency: string | null;
  readonly detailCode: string;
  readonly exceptionId: string;
  readonly kind: string;
  readonly providerReference: string | null;
  readonly publicReference: string | null;
  readonly resolution: string | null;
  readonly resolvedAt: string | null;
  readonly severity: string;
  readonly status: string;
  readonly subjectKind: string;
}

/** One refund and how far the worker got with it. */
export interface RefundRowV1 {
  readonly amountMinorUnits: number;
  readonly attempts: number;
  readonly bookingId: string | null;
  readonly createdAt: string;
  readonly currency: string;
  readonly failureCode: string | null;
  readonly publicReference: string | null;
  readonly reason: string;
  readonly refundId: string;
  readonly status: string;
}

/** A privacy job and how far it got. */
export interface PrivacyRequestRowV1 {
  readonly blockedReason: string | null;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly customerId: string | null;
  readonly kind: string;
  readonly offboardingPhase: string | null;
  readonly pendingSteps: number;
  readonly requestId: string;
  readonly status: string;
}

/** The §7.1 transitions a member can ask for. The database owns which apply. */
export type BookingTransitionAction = "check_in" | "complete" | "correct" | "no_show";

export type BookingNoteVisibility = "operational" | "sensitive";

export interface BookingSearchV1Request {
  readonly from: string | null;
  readonly locationId: string | null;
  readonly query: string | null;
  readonly staffId: string | null;
  readonly status: string | null;
  readonly tenantId: string;
  readonly to: string | null;
}

/** One row of the searchable booking list (issue #17). */
export interface BookingSearchRowV1 {
  readonly bookingId: string;
  readonly bookingRevision: number;
  readonly currency: string;
  readonly customerDisplayName: string | null;
  readonly locationTimeZone: string;
  readonly noteCount: number;
  readonly notificationStatus: string;
  readonly paymentStatus: string;
  readonly priceMinor: number;
  readonly publicReference: string;
  readonly serviceName: string;
  readonly startAt: string;
  readonly status: string;
}

/** One entry of the immutable status history. */
export interface BookingHistoryEntryV1 {
  readonly actorKind: string;
  readonly createdAt: string;
  readonly eventType: string;
  readonly reason: string | null;
  readonly sequence: number;
}

/** A note. Sensitive notes are simply absent for a reader without the grant. */
export interface BookingNoteV1 {
  readonly body: string;
  readonly createdAt: string;
  readonly noteId: string;
  readonly visibility: BookingNoteVisibility;
}

/**
 * One booking with everything an operator needs to act on it. Every
 * customer-shaped field is nullable because the same read returns the same row
 * with less in it for a member who may not see that class of data.
 */
export interface BookingDetailV1 {
  readonly bookingId: string;
  readonly bookingRevision: number;
  readonly cancelledAt: string | null;
  readonly currency: string;
  readonly customerEmail: string | null;
  readonly customerFullName: string | null;
  readonly customerPhone: string | null;
  readonly durationMinutes: number;
  readonly hasIntake: boolean;
  readonly history: readonly BookingHistoryEntryV1[];
  readonly locationName: string;
  readonly locationTimeZone: string;
  readonly notes: readonly BookingNoteV1[];
  readonly notificationStatus: string;
  readonly paymentStatus: string;
  readonly priceMinor: number;
  readonly publicReference: string;
  readonly refundEligibleMinor: number | null;
  readonly rescheduleCount: number;
  readonly serviceName: string;
  readonly startAt: string;
  readonly status: string;
}

/** One item of work in a Today queue (issue #16). */
export interface TodayItemV1 {
  readonly approvalDeadline: string | null;
  readonly bookingId: string;
  readonly bookingRevision: number;
  readonly currency: string;
  readonly customerDisplayName: string | null;
  readonly endAt: string;
  readonly hasIntake: boolean;
  readonly locationName: string;
  readonly locationTimeZone: string;
  readonly notificationStatus: string;
  readonly paymentStatus: string;
  readonly priceMinor: number;
  readonly publicReference: string;
  readonly queue:
    "arrivals" | "cancellations" | "exceptions" | "payments" | "requests" | "upcoming";
  readonly serviceName: string;
  readonly staffId: string | null;
  readonly startAt: string;
  readonly status: string;
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
