import {
  ClientBookingError,
  createClientBookingDataSource,
} from "../../../_lib/booking-data-source";
import {
  contractErrorResponse,
  contractErrorStatus,
  createPublicApiContext,
} from "../../../_lib/tenant-request";

export const dynamic = "force-dynamic";

/**
 * What actually happened to a checkout, from our own records. The customer
 * returns from the provider with a URL that proves nothing, so this is the only
 * thing the return screen believes.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const context = await createPublicApiContext();
    if (context === null) return contractErrorResponse("availability_unavailable", 503);
    const body = (await request.json()) as { holdId?: unknown; sessionToken?: unknown };
    if (typeof body.holdId !== "string" || typeof body.sessionToken !== "string") {
      return contractErrorResponse("invalid_request", 400);
    }
    const status = await createClientBookingDataSource(
      context.api,
      context.hostname,
    ).getCheckoutStatus(body.holdId, body.sessionToken);
    return Response.json(status, {
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    const code = error instanceof ClientBookingError ? error.code : "invalid_request";
    return contractErrorResponse(code, contractErrorStatus(code));
  }
}
