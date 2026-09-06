import {
  parseAvailabilityV1Request,
  type AvailabilityV1Request,
} from "@wlbp/api-contracts";

import { ClientAvailabilityError } from "./availability-data-source";

function required(params: URLSearchParams, key: string): string {
  const value = params.get(key);
  if (value === null || value.trim() === "") {
    throw new ClientAvailabilityError("invalid_request");
  }
  return value;
}

export function parseAvailabilitySearchParams(
  params: URLSearchParams,
): AvailabilityV1Request {
  try {
    const staffPreferenceId = params.get("staffPreferenceId");
    return parseAvailabilityV1Request({
      endBefore: required(params, "endBefore"),
      locale: required(params, "locale"),
      locationId: required(params, "locationId"),
      partySize: Number(params.get("partySize")),
      serviceId: required(params, "serviceId"),
      staffPreferenceId:
        staffPreferenceId === null || staffPreferenceId.trim() === ""
          ? null
          : staffPreferenceId,
      startAfter: required(params, "startAfter"),
      timeZone: required(params, "timeZone"),
    });
  } catch (error) {
    if (error instanceof ClientAvailabilityError) throw error;
    throw new ClientAvailabilityError("invalid_request");
  }
}
