import {
  parseAvailabilityV1Request,
  parseAvailabilityV1Response,
  type AvailabilityV1Request,
  type AvailabilityV1Response,
  type ContractErrorCode,
} from "@wlbp/api-contracts";

interface RpcResult {
  readonly data: unknown;
  readonly error: { readonly code?: string; readonly message?: string } | null;
}

export interface PublicAvailabilityRpc {
  rpc(name: string, args: Readonly<Record<string, unknown>>): PromiseLike<RpcResult>;
}

export type ClientAvailabilityErrorCode = ContractErrorCode;

export class ClientAvailabilityError extends Error {
  constructor(readonly code: ClientAvailabilityErrorCode) {
    super(`Availability request failed: ${code}`);
    this.name = "ClientAvailabilityError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mapRpcError(code: string | undefined): ClientAvailabilityErrorCode {
  switch (code) {
    case "invalid_request":
    case "policy_denied":
    case "tenant_context_mismatch":
    case "not_authorized":
      return code;
    case "22023":
    case "54000":
      return "invalid_request";
    case "42501":
      return "not_authorized";
    default:
      return "availability_unavailable";
  }
}

function mapRows(value: unknown): AvailabilityV1Response {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((row) => !isRecord(row))
  ) {
    throw new ClientAvailabilityError("availability_unavailable");
  }
  const rows = value as readonly Record<string, unknown>[];
  const first = rows[0]!;
  const slotRows = rows.filter((row) => row.result_kind === "slot");
  const rawNoSlotReason = first.no_slot_code;
  const noSlotReason =
    rawNoSlotReason === "none_available" ? "no_matching_availability" : rawNoSlotReason;

  try {
    return parseAvailabilityV1Response({
      advisory: true,
      displayTimeZone: first.customer_time_zone,
      locationTimeZone: first.location_time_zone,
      noSlotReason: slotRows.length === 0 ? noSlotReason : null,
      providerHealth: first.provider_health_code,
      slots: slotRows.map((row) => ({
        allocationKind: row.allocation_kind,
        endAt: row.slot_end,
        staffId: row.staff_id,
        startAt: row.slot_start,
      })),
    });
  } catch {
    throw new ClientAvailabilityError("availability_unavailable");
  }
}

export function createClientAvailabilityDataSource(
  api: PublicAvailabilityRpc,
  trustedHostname: string,
) {
  return {
    async getAvailability(
      request: AvailabilityV1Request,
    ): Promise<AvailabilityV1Response> {
      const parsed = parseAvailabilityV1Request(request);
      const result = await api.rpc("get_availability_v1", {
        p_application: "client",
        p_customer_time_zone: parsed.timeZone,
        p_hostname: trustedHostname,
        p_location_id: parsed.locationId,
        p_party_size: parsed.partySize,
        p_service_id: parsed.serviceId,
        p_staff_preference_id: parsed.staffPreferenceId,
        p_window_end: parsed.endBefore,
        p_window_start: parsed.startAfter,
      });
      if (result.error !== null) {
        throw new ClientAvailabilityError(mapRpcError(result.error.code));
      }
      return mapRows(result.data);
    },
  };
}
