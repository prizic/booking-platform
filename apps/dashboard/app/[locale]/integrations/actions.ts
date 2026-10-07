"use server";
import { revalidatePath } from "next/cache";
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
import {
  hasDirectCapability,
  isOwnWhatsAppTokenReference,
  stableRpcMessage,
} from "../../_lib/notification-access";
import { whatsAppConfigSchema, type WhatsAppConfigInput } from "./whatsapp-schema";

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

/**
 * Saves the tenant's WhatsApp channel. Needs `integration.manage` and an MFA
 * verification from the last five minutes (checked by the database). The
 * token reference is write-only: omitted, the stored one is kept; it must name
 * this tenant's own secret.
 */
export async function saveWhatsAppConfigAction(
  input: WhatsAppConfigInput,
): Promise<ActionResult<{ readonly revision: number }>> {
  const parsed = parseActionInput(whatsAppConfigSchema, input);
  if (!parsed.ok) return parsed.result;
  const value = parsed.data;
  const request = await loadDashboardRequestAccess(value.locale);
  if (
    request.state.kind !== "ready" ||
    !request.source?.saveWhatsAppConfig ||
    !hasDirectCapability(request.state.context, "integration.manage")
  )
    return actionError("waDenied");
  const tenantId = request.state.context.tenantId;
  if (
    value.accessTokenSecretRef !== "" &&
    !isOwnWhatsAppTokenReference(value.accessTokenSecretRef, tenantId)
  )
    return actionError("waInvalid", {
      accessTokenSecretRef: ["wa_secret_ref_foreign"],
    });
  try {
    const saved = await request.source.saveWhatsAppConfig({
      tenantId,
      enabled: value.enabled,
      phoneNumberId: value.phoneNumberId === "" ? null : value.phoneNumberId,
      businessAccountId:
        value.businessAccountId === "" ? null : value.businessAccountId,
      ...(value.accessTokenSecretRef === ""
        ? {}
        : { accessTokenSecretRef: value.accessTokenSecretRef }),
      templateMap: Object.fromEntries(
        value.templates
          .filter((row) => row.name !== "")
          .map((row) => [row.templateKey, { name: row.name, language: row.language }]),
      ),
      expectedRevision: value.expectedRevision,
      requestId: value.requestId,
    });
    revalidatePath(`/${value.locale}/integrations`);
    revalidatePath(`/${value.locale}/communications/settings`);
    return actionOk({ revision: saved.revision });
  } catch (error) {
    const stable = stableRpcMessage(error);
    return actionError(
      stable === "integration_step_up_required"
        ? "waStepUpRequired"
        : stable === "not_entitled"
          ? "waNotEntitledError"
          : stable === "revision_conflict"
            ? "waConflict"
            : stable === "whatsapp_config_invalid"
              ? "waInvalid"
              : stable === "policy_denied"
                ? "waDenied"
                : "unavailable",
    );
  }
}
