import {
  parseCreateHoldV1Request,
  parseCreateHoldV1Response,
  parseHoldFormV1,
  parseConfirmBookingV1Request,
  type CreateHoldV1Request,
  type ConfirmBookingV1Request,
} from "@wlbp/api-contracts";
interface BookingRpc {
  rpc(
    name: string,
    args: Readonly<Record<string, unknown>>,
  ): PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>;
}
function row(data: unknown): Record<string, unknown> {
  const value = Array.isArray(data) ? data[0] : data;
  if (typeof value !== "object" || value === null) throw new Error("unavailable");
  return value as Record<string, unknown>;
}
export function createOnBehalfDataSource(
  api: BookingRpc,
  hostname: string,
  tenantId: string,
) {
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await api.rpc(name, args);
    if (result.error)
      throw new Error(
        [
          "slot_unavailable",
          "capacity_exhausted",
          "policy_denied",
          "revision_conflict",
          "payment_pending",
          "idempotency_conflict",
        ].includes(result.error.message ?? "")
          ? result.error.message
          : "unavailable",
      );
    return row(result.data);
  };
  return {
    async hold(request: CreateHoldV1Request) {
      const p = parseCreateHoldV1Request(request);
      const held = await call("create_hold_v1", {
        p_hostname: hostname,
        p_application: "dashboard",
        p_service_id: p.serviceId,
        p_location_id: p.locationId,
        p_slot_start: p.startAt,
        p_session_token: p.sessionToken,
        p_idempotency_key: p.idempotencyKey,
        p_party_size: 1,
        p_staff_preference_id: p.staffPreferenceId,
        p_expected_cache_tag: p.expectedCacheTag,
      });
      const hold = parseCreateHoldV1Response({
        allocationKind: held.allocation_kind,
        expiresAt: new Date(String(held.expires_at)).toISOString(),
        holdId: held.hold_id,
        price: { currency: held.currency, minorUnits: Number(held.price_minor) },
        replayed: held.replayed,
        slotEnd: new Date(String(held.slot_end)).toISOString(),
        slotStart: new Date(String(held.slot_start)).toISOString(),
        staffId: held.staff_id ?? null,
        state: held.state,
      });
      const fields = await call("get_hold_form_v1", {
        p_hostname: hostname,
        p_application: "dashboard",
        p_hold_id: hold.holdId,
        p_session_token: p.sessionToken,
        p_locale: p.locale,
      });
      const schema = row(fields.intake_schema);
      const declared = Array.isArray(schema.fields) ? schema.fields : [];
      const form = parseHoldFormV1({
        balanceMinor: Number(fields.balance_minor ?? 0),
        consentText: fields.consent_text,
        consentVersion: fields.consent_version,
        dueMinor: Number(fields.due_minor ?? 0),
        fields: declared.map((v) => {
          const f = row(v);
          return {
            key: f.key,
            label: f.label,
            maxLength: f.maxLength ?? 2000,
            required: f.required === true,
          };
        }),
        locationName: fields.location_name,
        paymentMode: fields.payment_mode,
        serviceName: fields.service_name,
      });
      return { hold, form };
    },
    async confirm(request: ConfirmBookingV1Request) {
      const p = parseConfirmBookingV1Request(request);
      const result = await call("create_booking_on_behalf_v1", {
        p_tenant_id: tenantId,
        p_hostname: hostname,
        p_hold_id: p.holdId,
        p_session_token: p.sessionToken,
        p_idempotency_key: p.idempotencyKey,
        p_contact: {
          fullName: p.contact.fullName,
          email: p.contact.email,
          ...(p.contact.phone ? { phone: p.contact.phone } : {}),
        },
        p_consent_version: p.consentVersion,
        p_locale: p.locale,
        p_intake: p.intake,
        p_customer_time_zone: p.customerTimeZone,
        p_request_id: crypto.randomUUID(),
      });
      if (
        result.contract_version !== 1 ||
        typeof result.booking_id !== "string" ||
        !/^[a-f0-9-]{36}$/iu.test(result.booking_id) ||
        typeof result.public_reference !== "string" ||
        typeof result.replayed !== "boolean" ||
        !["confirmed", "requested"].includes(String(result.status))
      )
        throw new Error("unavailable");
      return {
        bookingId: result.booking_id,
        publicReference: result.public_reference,
        status: result.status as "confirmed" | "requested",
        revision: Number(result.booking_revision),
        replayed: result.replayed,
      };
    },
  };
}
