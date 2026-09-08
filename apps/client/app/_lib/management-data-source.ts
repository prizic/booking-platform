import {
  parseManagementActionV1,
  parseManagementStepUpV1,
  parseManagementViewV1,
  type BookingChangeActionV1,
  type ManagementActionV1,
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

    /**
     * The action the link authorizes. The database decides everything that
     * matters — live link, matching intent, verified step-up, current revision,
     * snapshotted policy — and answers a refusal exactly like an unknown link.
     */
    async act(input: {
      readonly action: BookingChangeActionV1;
      readonly expectedRevision: number;
      readonly newStartAt: string | null;
      readonly token: string;
    }): Promise<ManagementActionV1> {
      const result = await api.rpc("act_on_management_link_v1", {
        p_action: input.action,
        p_application: "client",
        p_expected_revision: input.expectedRevision,
        p_hostname: trustedHostname,
        p_new_start: input.newStartAt,
        p_token: input.token,
      });
      const row = result.error === null ? firstRow(result.data) : null;
      if (row === null || row.outcome !== "applied") {
        return parseManagementActionV1({ outcome: "unavailable" });
      }
      try {
        const minor =
          row.refund_eligible_minor === null || row.refund_eligible_minor === undefined
            ? null
            : Number(row.refund_eligible_minor);
        return parseManagementActionV1({
          bookingId: row.booking_id,
          bookingRevision: Number(row.booking_revision),
          outcome: "applied",
          refund: minor === null ? null : { currency: row.currency, minorUnits: minor },
          refundPercentBps:
            row.refund_percent_bps === null || row.refund_percent_bps === undefined
              ? null
              : Number(row.refund_percent_bps),
          startAt:
            row.starts_at === null || row.starts_at === undefined
              ? null
              : new Date(String(row.starts_at)).toISOString(),
          status: row.status,
        });
      } catch {
        return parseManagementActionV1({ outcome: "unavailable" });
      }
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
