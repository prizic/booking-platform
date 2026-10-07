import { parseActionInput } from "@wlbp/ui-foundation/actions";

import {
  manageActionSchema,
  manageTokenSchema,
  manageViewSchema,
  requestStepUpSchema,
  verifyStepUpSchema,
} from "../../[locale]/manage/manage-schema";
import { createManagementDataSource } from "../../_lib/management-data-source";
import {
  contractErrorResponse,
  createPublicApiContext,
} from "../../_lib/tenant-request";

export const dynamic = "force-dynamic";

/**
 * One endpoint for the whole link surface. It answers with the same shape for
 * every refusal, sets no-store, and keeps the token out of the URL so it never
 * reaches a referrer header, a browser history entry, or an access log. Each
 * body is validated with the schema the page's own form or call uses.
 */
export async function POST(request: Request): Promise<Response> {
  const headers = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
  };
  const unavailable = () => Response.json({ outcome: "unavailable" }, { headers });
  try {
    const context = await createPublicApiContext();
    if (context === null) return contractErrorResponse("availability_unavailable", 503);
    const body: unknown = await request.json();
    const token = parseActionInput(manageTokenSchema, body);
    if (!token.ok) return unavailable();
    const source = createManagementDataSource(context.api, context.hostname);
    const action = (body as { action?: unknown }).action;

    if (action === "request-step-up") {
      const input = parseActionInput(requestStepUpSchema, body);
      if (!input.ok) return unavailable();
      return Response.json(await source.requestStepUp(input.data.token), { headers });
    }
    if (action === "verify-step-up") {
      // A malformed code is simply a code that did not verify.
      const input = parseActionInput(verifyStepUpSchema, body);
      const verified =
        input.ok && (await source.verifyStepUp(input.data.token, input.data.code));
      return Response.json({ verified }, { headers });
    }
    if (action === "cancel" || action === "reschedule") {
      // A move needs a time and a cancellation must not carry one, and the
      // revision the caller acted on has to be a real one.
      const input = parseActionInput(manageActionSchema, body);
      if (!input.ok) return unavailable();
      return Response.json(await source.act(input.data), { headers });
    }
    const input = parseActionInput(manageViewSchema, body);
    if (!input.ok) return unavailable();
    return Response.json(await source.redeem(input.data.token, input.data.intent), {
      headers,
    });
  } catch {
    return unavailable();
  }
}
