import { parseCreateHoldV1Request } from "@wlbp/api-contracts";
import { parseActionInput } from "@wlbp/ui-foundation/actions";

import { createHoldSchema } from "../../[locale]/book/booking-schema";

import {
  ClientBookingError,
  createClientBookingDataSource,
} from "../../_lib/booking-data-source";
import {
  contractErrorResponse,
  contractErrorStatus,
  createPublicApiContext,
} from "../../_lib/tenant-request";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const context = await createPublicApiContext();
    if (context === null) return contractErrorResponse("availability_unavailable", 503);
    // The schema the browser built this body with, then the shared contract.
    const input = parseActionInput(createHoldSchema, await request.json());
    if (!input.ok) return contractErrorResponse("invalid_request", 400);
    const hold = parseCreateHoldV1Request(input.data);
    const source = createClientBookingDataSource(context.api, context.hostname);
    const data = await source.createHold(hold);
    // The details step needs the consent text and intake questions from the
    // publication this hold read, so one round trip returns both.
    const form = await source.getHoldForm(data.holdId, hold.sessionToken, hold.locale);
    return Response.json(
      { form, hold: data },
      {
        headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
      },
    );
  } catch (error) {
    const code = error instanceof ClientBookingError ? error.code : "invalid_request";
    return contractErrorResponse(code, contractErrorStatus(code));
  }
}
