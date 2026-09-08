import {
  parseManagementStepUpV1,
  parseManagementViewV1,
  type ManagementIntentV1,
  type ManagementStepUpV1,
  type ManagementViewV1,
} from "@wlbp/api-contracts";

import { ClientBookingError, type BookingRpc } from "./booking-data-source";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstRow(value: unknown): Record<string, unknown> | null {
  const row = Array.isArray(value) ? value[0] : value;
  return isRecord(row) ? row : null;
}

/**
 * The guest management surface. Every refusal is the same `unavailable`
 * result, including a transport failure, so nothing about a booking's or a
 * token's existence can be inferred from this client either.
 */
export function createManagementDataSource(api: BookingRpc, trustedHostname: string) {
  return {
    async redeem(token: string, intent: ManagementIntentV1): Promise<ManagementViewV1> {
      const result = await api.rpc("redeem_management_token_v1", {
        p_application: "client",
        p_hostname: trustedHostname,
        p_intent: intent,
        p_token: token,
      });
      const row = result.error === null ? firstRow(result.data) : null;
      if (row === null || row.outcome !== "granted") {
        return parseManagementViewV1({ outcome: "unavailable" });
      }
      try {
        return parseManagementViewV1({
          booking: {
            approvalStatus: row.approval_status,
            bookingId: row.booking_id,
            bookingRevision: Number(row.booking_revision),
            consentVersion: row.consent_version,
            customerTimeZone: row.customer_time_zone,
            endAt: new Date(String(row.ends_at)).toISOString(),
            locale: row.locale,
            locationName: row.location_name,
            locationTimeZone: row.location_time_zone,
            paymentStatus: row.payment_status,
            price: { currency: row.currency, minorUnits: Number(row.price_minor) },
            publicReference: row.public_reference,
            serviceName: row.service_name,
            startAt: new Date(String(row.starts_at)).toISOString(),
            status: row.status,
          },
          canCancel: row.can_cancel === true,
          canReschedule: row.can_reschedule === true,
          intent: row.intent,
          outcome: "granted",
          stepUpRequired: row.step_up_required === true,
          stepUpVerified: row.step_up_verified === true,
          tokenExpiresAt: new Date(String(row.token_expires_at)).toISOString(),
        });
      } catch {
        throw new ClientBookingError("availability_unavailable");
      }
    },

    async requestStepUp(token: string): Promise<ManagementStepUpV1> {
      const result = await api.rpc("request_management_otp_v1", {
        p_application: "client",
        p_hostname: trustedHostname,
        p_token: token,
      });
      const row = result.error === null ? firstRow(result.data) : null;
      if (row === null || row.outcome !== "sent") {
        return parseManagementStepUpV1({ expiresAt: null, outcome: "unavailable" });
      }
      return parseManagementStepUpV1({
        expiresAt: new Date(String(row.expires_at)).toISOString(),
        outcome: "sent",
      });
    },

    async verifyStepUp(token: string, code: string): Promise<boolean> {
      const result = await api.rpc("verify_management_otp_v1", {
        p_application: "client",
        p_code: code,
        p_hostname: trustedHostname,
        p_token: token,
      });
      const row = result.error === null ? firstRow(result.data) : null;
      return row !== null && row.verified === true;
    },
  };
}
