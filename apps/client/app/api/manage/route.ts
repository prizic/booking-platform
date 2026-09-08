import type { ManagementIntentV1 } from "@wlbp/api-contracts";

import { createManagementDataSource } from "../../_lib/management-data-source";
import {
  contractErrorResponse,
  createPublicApiContext,
} from "../../_lib/tenant-request";

export const dynamic = "force-dynamic";

const intents = new Set<ManagementIntentV1>([
  "view",
  "reschedule",
  "cancel",
  "refund_request",
  "request_alternative",
  "data_export",
  "data_correction_request",
  "data_deletion_request",
  "data_restriction_request",
]);

interface ManageRequestBody {
  readonly action?: unknown;
  readonly code?: unknown;
  readonly intent?: unknown;
  readonly token?: unknown;
}

/**
 * One endpoint for the whole link surface. It answers with the same shape for
 * every refusal, sets no-store, and keeps the token out of the URL so it never
 * reaches a referrer header, a browser history entry, or an access log.
 */
export async function POST(request: Request): Promise<Response> {
  const headers = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
  };
  try {
    const context = await createPublicApiContext();
    if (context === null) return contractErrorResponse("availability_unavailable", 503);
    const body = (await request.json()) as ManageRequestBody;
    if (typeof body.token !== "string" || !/^[a-f0-9]{64}$/u.test(body.token)) {
      return Response.json({ outcome: "unavailable" }, { headers });
    }
    const source = createManagementDataSource(context.api, context.hostname);

    if (body.action === "request-step-up") {
      return Response.json(await source.requestStepUp(body.token), { headers });
    }
    if (body.action === "verify-step-up") {
      const verified =
        typeof body.code === "string" &&
        /^[0-9]{6}$/u.test(body.code) &&
        (await source.verifyStepUp(body.token, body.code));
      return Response.json({ verified }, { headers });
    }
    const intent =
      typeof body.intent === "string" && intents.has(body.intent as ManagementIntentV1)
        ? (body.intent as ManagementIntentV1)
        : "view";
    return Response.json(await source.redeem(body.token, intent), { headers });
  } catch {
    return Response.json({ outcome: "unavailable" }, { headers });
  }
}
