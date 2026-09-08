import {
  parseConfirmBookingV1Request,
  parseConfirmBookingV1Response,
  parseCreateHoldV1Request,
  parseCreateHoldV1Response,
  parseHoldFormV1,
  type ConfirmBookingV1Request,
  type ConfirmBookingV1Response,
  type ContractErrorCode,
  type CreateHoldV1Request,
  type CreateHoldV1Response,
  type HoldFormV1,
} from "@wlbp/api-contracts";

interface RpcResult {
  readonly data: unknown;
  readonly error: { readonly code?: string; readonly message?: string } | null;
}

export interface BookingRpc {
  rpc(name: string, args: Readonly<Record<string, unknown>>): PromiseLike<RpcResult>;
}

export class ClientBookingError extends Error {
  constructor(readonly code: ContractErrorCode) {
    super(`Booking request failed: ${code}`);
    this.name = "ClientBookingError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The database raises a stable message with a stable SQLSTATE and discloses
// nothing about the conflicting row. PostgREST surfaces the SQLSTATE as `code`
// and the message as `message`, so the message decides which stable error the
// customer sees and the SQLSTATE only bounds the fallback.
export function mapBookingRpcError(
  code: string | undefined,
  message: string | undefined,
): ContractErrorCode {
  switch (message) {
    case "slot_unavailable":
    case "capacity_exhausted":
    case "policy_denied":
    case "revision_conflict":
    case "payment_pending":
    case "idempotency_conflict":
      return message;
    default:
      break;
  }
  if (
    message?.startsWith("hold_") === true ||
    message?.startsWith("booking_") === true
  ) {
    return message.endsWith("context_required") ? "not_authorized" : "invalid_request";
  }
  switch (code) {
    case "22023":
    case "54000":
      return "invalid_request";
    case "42501":
      return "not_authorized";
    case "23P01":
      return "slot_unavailable";
    default:
      return "availability_unavailable";
  }
}

function firstRow(value: unknown): Record<string, unknown> {
  const row = Array.isArray(value) ? value[0] : value;
  if (!isRecord(row)) throw new ClientBookingError("availability_unavailable");
  return row;
}

export function createClientBookingDataSource(
  api: BookingRpc,
  trustedHostname: string,
) {
  return {
    async createHold(request: CreateHoldV1Request): Promise<CreateHoldV1Response> {
      const parsed = parseCreateHoldV1Request(request);
      const result = await api.rpc("create_hold_v1", {
        p_application: "client",
        p_expected_cache_tag: parsed.expectedCacheTag,
        p_hostname: trustedHostname,
        p_idempotency_key: parsed.idempotencyKey,
        p_location_id: parsed.locationId,
        p_party_size: parsed.partySize,
        p_service_id: parsed.serviceId,
        p_session_token: parsed.sessionToken,
        p_slot_start: parsed.startAt,
        p_staff_preference_id: parsed.staffPreferenceId,
      });
      if (result.error !== null) {
        throw new ClientBookingError(
          mapBookingRpcError(result.error.code, result.error.message),
        );
      }
      const row = firstRow(result.data);
      try {
        return parseCreateHoldV1Response({
          allocationKind: row.allocation_kind,
          expiresAt: new Date(String(row.expires_at)).toISOString(),
          holdId: row.hold_id,
          price: { currency: row.currency, minorUnits: Number(row.price_minor) },
          replayed: row.replayed,
          slotEnd: new Date(String(row.slot_end)).toISOString(),
          slotStart: new Date(String(row.slot_start)).toISOString(),
          staffId: row.staff_id ?? null,
          state: row.state,
        });
      } catch {
        throw new ClientBookingError("availability_unavailable");
      }
    },

    async getHoldForm(
      holdId: string,
      sessionToken: string,
      locale: "en" | "ar",
    ): Promise<HoldFormV1> {
      const result = await api.rpc("get_hold_form_v1", {
        p_application: "client",
        p_hold_id: holdId,
        p_hostname: trustedHostname,
        p_locale: locale,
        p_session_token: sessionToken,
      });
      if (result.error !== null) {
        throw new ClientBookingError(
          mapBookingRpcError(result.error.code, result.error.message),
        );
      }
      const row = firstRow(result.data);
      const schema = isRecord(row.intake_schema) ? row.intake_schema : {};
      const declared = Array.isArray(schema.fields) ? schema.fields : [];
      try {
        return parseHoldFormV1({
          consentText: row.consent_text,
          consentVersion: row.consent_version,
          fields: declared.filter(isRecord).map((field) => ({
            key: field.key,
            label: field.label,
            maxLength: typeof field.maxLength === "number" ? field.maxLength : 2000,
            required: field.required === true,
          })),
          locationName: row.location_name,
          serviceName: row.service_name,
        });
      } catch {
        throw new ClientBookingError("availability_unavailable");
      }
    },

    async confirmBooking(
      request: ConfirmBookingV1Request,
    ): Promise<ConfirmBookingV1Response> {
      const parsed = parseConfirmBookingV1Request(request);
      const result = await api.rpc("confirm_booking_v1", {
        p_application: "client",
        p_consent_version: parsed.consentVersion,
        p_contact: {
          email: parsed.contact.email,
          fullName: parsed.contact.fullName,
          ...(parsed.contact.phone === null ? {} : { phone: parsed.contact.phone }),
        },
        p_customer_time_zone: parsed.customerTimeZone,
        p_hold_id: parsed.holdId,
        p_hostname: trustedHostname,
        p_idempotency_key: parsed.idempotencyKey,
        p_intake: parsed.intake,
        p_locale: parsed.locale,
        p_session_token: parsed.sessionToken,
      });
      if (result.error !== null) {
        throw new ClientBookingError(
          mapBookingRpcError(result.error.code, result.error.message),
        );
      }
      const row = firstRow(result.data);
      try {
        // Confirmation is read back from the committed row the database
        // returned, never from optimistic Client state.
        return parseConfirmBookingV1Response({
          approvalStatus: row.approval_status,
          bookingId: row.booking_id,
          bookingRevision: Number(row.booking_revision),
          calendarStatus: row.calendar_status,
          consentVersion: row.consent_version,
          customerTimeZone: row.customer_time_zone,
          endAt: new Date(String(row.ends_at)).toISOString(),
          locale: row.locale,
          locationName: row.location_name,
          locationTimeZone: row.location_time_zone,
          notificationStatus: row.notification_status,
          paymentStatus: row.payment_status,
          price: { currency: row.currency, minorUnits: Number(row.price_minor) },
          publicReference: row.public_reference,
          replayed: row.replayed,
          serviceName: row.service_name,
          startAt: new Date(String(row.starts_at)).toISOString(),
          status: row.status,
          taxRateBps: Number(row.tax_rate_bps),
        });
      } catch {
        throw new ClientBookingError("availability_unavailable");
      }
    },
  };
}
