"use server";
import {
  actionError,
  actionOk,
  parseActionInput,
  type ActionResult,
} from "@wlbp/ui-foundation/actions";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { createDashboardAuthClient } from "../../_lib/auth-server";
import {
  paymentOnboardingSchema,
  type PaymentOnboardingInput,
} from "./onboarding-schema";

export async function startPaymentOnboarding(
  input: PaymentOnboardingInput,
): Promise<ActionResult<{ readonly destination: string }>> {
  const parsed = parseActionInput(paymentOnboardingSchema, input);
  if (!parsed.ok) return actionError("refused");
  const { locale, requestId } = parsed.data;
  const request = await loadDashboardRequestAccess(locale);
  const client = await createDashboardAuthClient();
  if (request.state.kind !== "ready" || !client) return actionError("refused");
  try {
    const { data, error } = await client.functions.invoke("payment-onboarding", {
      body: {
        tenantId: request.state.context.tenantId,
        hostname: request.state.context.dashboardHostname,
        locale,
        requestId,
      },
    });
    if (
      error ||
      typeof data !== "object" ||
      data === null ||
      typeof data.redirectUrl !== "string"
    )
      return actionError("refused");
    const url = new URL(data.redirectUrl);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "connect.stripe.com" ||
      url.username ||
      url.password ||
      url.hash
    )
      return actionError("refused");
    return actionOk({ destination: url.href });
  } catch {
    return actionError("refused");
  }
}
