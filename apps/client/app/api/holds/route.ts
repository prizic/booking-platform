import { parseCreateHoldV1Request } from "@wlbp/api-contracts";

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
    const hold = parseCreateHoldV1Request(await request.json());
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
