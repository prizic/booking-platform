import {
  parseAvailabilityV1Request,
  type AvailabilityV1Request,
} from "@wlbp/api-contracts";
import { parseActionInput } from "@wlbp/ui-foundation/actions";

import { availabilityQuerySchema } from "../[locale]/availability-schema";
import { ClientAvailabilityError } from "./availability-data-source";

/**
 * The route's query boundary: the availability search schema the browser
 * builds its request with, then the shared contract parser (bounded window,
 * no tenant identity). Any refusal is the same `invalid_request`.
 */
export function parseAvailabilitySearchParams(
  params: URLSearchParams,
): AvailabilityV1Request {
  const parsed = parseActionInput(availabilityQuerySchema, Object.fromEntries(params));
  if (!parsed.ok) throw new ClientAvailabilityError("invalid_request");
  try {
    return parseAvailabilityV1Request(parsed.data);
  } catch {
    throw new ClientAvailabilityError("invalid_request");
  }
}
