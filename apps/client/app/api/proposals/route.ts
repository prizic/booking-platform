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

interface ProposalRequestBody {
  readonly action?: unknown;
  readonly actionToken?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const context = await createPublicApiContext();
    if (context === null) return contractErrorResponse("availability_unavailable", 503);
    const body = (await request.json()) as ProposalRequestBody;
    // The link is a bearer credential for exactly one intent, so nothing but a
    // well formed token and one of two actions is forwarded.
    if (
      typeof body.actionToken !== "string" ||
      !/^[a-f0-9]{64}$/u.test(body.actionToken) ||
      (body.action !== "accept" && body.action !== "decline")
    ) {
      return contractErrorResponse("invalid_request", 400);
    }
    const data = await createClientBookingDataSource(
      context.api,
      context.hostname,
    ).respondToProposal(body.actionToken, body.action);
    return Response.json(data, {
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    const code = error instanceof ClientBookingError ? error.code : "invalid_request";
    return contractErrorResponse(code, contractErrorStatus(code));
  }
}
