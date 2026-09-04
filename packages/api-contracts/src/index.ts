/** Version carried by the api_v1 DTOs in this module, not the deployed range. */
export const apiV1ContractVersion = 1 as const;
export type BackendContractVersion = typeof apiV1ContractVersion;

export type TenantId = string;
export type BrandId = string;
export type InstanceId = string;
export type LocationId = string;
export type BookingId = string;
export type IdempotencyKey = string;

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
  | "invalid_request";

export interface ContractError {
  readonly code: ContractErrorCode;
  readonly correlationId: string;
  readonly messageKey: string;
  readonly retryable: boolean;
}

export type ContractResult<T> =
  | {
      readonly ok: true;
      readonly data: T;
      readonly contractVersion: BackendContractVersion;
    }
  | {
      readonly ok: false;
      readonly error: ContractError;
      readonly contractVersion: BackendContractVersion;
    };

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

export type RefundStatusDto =
  "eligible" | "pending" | "succeeded" | "failed" | "manual_review";
export type NotificationStatusDto =
  "queued" | "sending" | "delivered" | "bounced" | "complained" | "failed";
export type CalendarExportStatusDto = "pending" | "generated" | "stale";

export interface ResolvePublicTenantV1Request {
  readonly hostname: string;
}

export interface ResolvePublicTenantV1Response {
  readonly brandId: BrandId;
  readonly instanceId: InstanceId;
  readonly publishedBrandRevision: number;
  readonly tenantId: TenantId;
}

export interface AvailabilityV1Request {
  readonly locale: "en" | "ar";
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
  readonly locale: "en" | "ar";
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
