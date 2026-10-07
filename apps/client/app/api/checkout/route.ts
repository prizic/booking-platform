import { parseBeginCheckoutV1Request } from "@wlbp/api-contracts";
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

/**
 * Issue #22. Prices the booking and opens a payment attempt, then asks the
 * checkout Edge Function for a provider redirect.
 *
 * The redirect is optional on purpose. If the provider or its function is
 * unreachable the customer still has a priced, resumable attempt and a
 * recoverable message, rather than a dead end — which is exactly the
 * provider-outage behaviour this journey is required to have.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const context = await createPublicApiContext();
    if (context === null) return contractErrorResponse("availability_unavailable", 503);
    // The details form schema first (consent included), then the shared contract.
    const input = parseActionInput(bookingDetailsSchema, await request.json());
    if (!input.ok) return contractErrorResponse("invalid_request", 400);
    const { request: body, whatsappOptIn } = splitBookingDetails(input.data);
    const checkout = parseBeginCheckoutV1Request(body);
    // The consent snapshot must be the words the customer was shown.
    if (
      whatsappOptIn !== null &&
      !isShownWhatsAppConsent(whatsappOptIn, checkout.locale)
    ) {
      return contractErrorResponse("invalid_request", 400);
    }
    const source = createClientBookingDataSource(context.api, context.hostname);
    const opened = await source.beginCheckout(checkout, whatsappOptIn);

    const redirectUrl = await requestProviderRedirect(
      opened.paymentAttemptId,
      checkout.locale,
      checkout.holdId,
    );
    return Response.json(
      { checkout: opened, redirectUrl },
      {
        headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
      },
    );
  } catch (error) {
    const code = error instanceof ClientBookingError ? error.code : "invalid_request";
    return contractErrorResponse(code, contractErrorStatus(code));
  }
}

async function requestProviderRedirect(
  paymentAttemptId: string,
  locale: string,
  holdId: string,
): Promise<string | null> {
  const endpoint = process.env.STRIPE_CHECKOUT_FUNCTION_URL ?? "";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  // No configured function is a missing redirect, never a failed booking.
  if (endpoint === "" || siteUrl === "") return null;
  try {
    const response = await fetch(endpoint, {
      body: JSON.stringify({
        cancelUrl: `${siteUrl}/${locale}/book?checkout=cancelled&hold=${holdId}`,
        paymentAttemptId,
        successUrl: `${siteUrl}/${locale}/book?checkout=return&hold=${holdId}`,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { redirectUrl?: unknown };
    return typeof body.redirectUrl === "string" ? body.redirectUrl : null;
  } catch {
    // A provider outage leaves a visible, resumable pending payment.
    return null;
  }
}
