import { parseConfirmBookingV1Request } from "@wlbp/api-contracts";
import { parseActionInput } from "@wlbp/ui-foundation/actions";

import {
  bookingDetailsSchema,
  splitBookingDetails,
} from "../../[locale]/book/booking-schema";

import {
  ClientBookingError,
  createClientBookingDataSource,
} from "../../_lib/booking-data-source";
import {
  contractErrorResponse,
  contractErrorStatus,
  createPublicApiContext,
} from "../../_lib/tenant-request";
import { isShownWhatsAppConsent } from "../../_lib/whatsapp-consent";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const context = await createPublicApiContext();
    if (context === null) return contractErrorResponse("availability_unavailable", 503);
    // The details form schema first (consent included), then the shared contract.
    const input = parseActionInput(bookingDetailsSchema, await request.json());
    if (!input.ok) return contractErrorResponse("invalid_request", 400);
    const { request: body, whatsappOptIn } = splitBookingDetails(input.data);
    const confirmation = parseConfirmBookingV1Request(body);
    // The consent snapshot must be the words the customer was shown.
    if (
      whatsappOptIn !== null &&
      !isShownWhatsAppConsent(whatsappOptIn, confirmation.locale)
    ) {
      return contractErrorResponse("invalid_request", 400);
    }
    const data = await createClientBookingDataSource(
      context.api,
      context.hostname,
    ).confirmBooking(confirmation, whatsappOptIn);
    return Response.json(data, {
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    const code = error instanceof ClientBookingError ? error.code : "invalid_request";
    return contractErrorResponse(code, contractErrorStatus(code));
  }
}
