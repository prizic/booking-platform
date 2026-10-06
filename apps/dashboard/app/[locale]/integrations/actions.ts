"use server";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { createDashboardAuthClient } from "../../_lib/auth-server";
export interface IntegrationResult {
  readonly destination?: string;
  readonly refused?: boolean;
}
export async function startPaymentOnboarding(
  _state: IntegrationResult,
  form: FormData,
): Promise<IntegrationResult> {
  const locale = form.get("locale") === "ar" ? "ar" : "en";
  const requestId = form.get("requestId");
  if (typeof requestId !== "string" || !/^[a-f0-9-]{36}$/iu.test(requestId))
    return { refused: true };
  const request = await loadDashboardRequestAccess(locale);
  const client = await createDashboardAuthClient();
  if (request.state.kind !== "ready" || !client) return { refused: true };
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
      return { refused: true };
    const url = new URL(data.redirectUrl);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "connect.stripe.com" ||
      url.username ||
      url.password ||
      url.hash
    )
      return { refused: true };
    return { destination: url.href };
  } catch {
    return { refused: true };
  }
}
