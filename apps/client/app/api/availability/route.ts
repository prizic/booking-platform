import {
  ClientAvailabilityError,
  createClientAvailabilityDataSource,
} from "../../_lib/availability-data-source";
import { parseAvailabilitySearchParams } from "../../_lib/availability-request";
import { createPublicApiContext } from "../../_lib/tenant-request";

export const dynamic = "force-dynamic";

function errorResponse(code: string, status: number): Response {
  return Response.json(
    { error: { code, messageKey: `availability.error.${code}` } },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

export async function GET(request: Request): Promise<Response> {
  try {
    const context = await createPublicApiContext();
    if (context === null) return errorResponse("availability_unavailable", 503);
    const api = context.api as unknown as Parameters<
      typeof createClientAvailabilityDataSource
    >[0];
    const query = parseAvailabilitySearchParams(new URL(request.url).searchParams);
    const data = await createClientAvailabilityDataSource(
      api,
      context.hostname,
    ).getAvailability(query);

    return Response.json(data, {
      headers: {
        // Revision-aware cache invalidation is not yet available to this route.
        // Keep advisory reads uncached until the database cache discriminator can
        // participate in the cache key/tag contract from ADR-0017.
        "Cache-Control": "no-store",
        "X-Availability-Advisory": "true",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof ClientAvailabilityError) {
      const status = error.code === "availability_unavailable" ? 503 : 400;
      return errorResponse(error.code, status);
    }
    return errorResponse("availability_unavailable", 503);
  }
}
