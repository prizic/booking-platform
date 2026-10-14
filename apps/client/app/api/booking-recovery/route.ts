import { parseActionInput } from "@wlbp/ui-foundation/actions";
import { recoveryRequestSchema } from "../../[locale]/find-booking/recovery-schema";
import { createPublicReadContext } from "../../_lib/public-read-context";
import { trustedClientIp } from "../../_lib/trusted-client-ip";
import { requestBookingRecovery } from "../../_lib/recovery-data-source";

export const dynamic = "force-dynamic";
const privacyHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
};
const accepted = () =>
  Response.json(
    { contractVersion: 1, outcome: "accepted" },
    { headers: privacyHeaders },
  );

/** No customer/booking lookup at ingress. All syntactically valid same-origin
 * submissions have one envelope, including suppression, limits and outages.
 * The asynchronous worker owns matching, per-booking issuance and delivery. */
export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  if (
    origin !== new URL(request.url).origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    return Response.json(
      { error: { code: "not_authorized" } },
      { status: 403, headers: privacyHeaders },
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: { code: "invalid_request" } },
      { status: 400, headers: privacyHeaders },
    );
  }
  const input = parseActionInput(recoveryRequestSchema, body);
  if (!input.ok)
    return Response.json(
      { error: { code: "invalid_request" } },
      { status: 400, headers: privacyHeaders },
    );
  try {
    const context = await createPublicReadContext();
    if (context.outcome === "ready")
      await requestBookingRecovery(
        context.api,
        context.hostname,
        input.data.email,
        input.data.requestId,
        trustedClientIp(request.headers),
      );
  } catch {
    // Never log recipient, error text, tokens or match/delivery information.
    // Delivery guidance accompanies the same privacy-safe acceptance message.
  }
  return accepted();
}
