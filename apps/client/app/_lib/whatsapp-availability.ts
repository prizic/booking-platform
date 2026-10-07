import { parsePublicWhatsAppAvailabilityV1 } from "@wlbp/api-contracts";

import { createPublicApiContext } from "./tenant-request";

interface AvailabilityRpc {
  rpc(
    name: string,
    args: Readonly<Record<string, unknown>>,
  ): PromiseLike<{ readonly data: unknown; readonly error: unknown }>;
}

/**
 * Whether this tenant offers WhatsApp updates right now (entitled, configured
 * and enabled). Anything unreadable is "no": the opt-in is an extra, and the
 * booking form must never offer a channel that cannot deliver.
 */
export async function readWhatsAppAvailability(
  api: AvailabilityRpc,
  trustedHostname: string,
): Promise<boolean> {
  try {
    const result = await api.rpc("get_public_whatsapp_availability_v1", {
      p_application: "client",
      p_hostname: trustedHostname,
    });
    if (result.error !== null) return false;
    return parsePublicWhatsAppAvailabilityV1(result.data).whatsappAvailable;
  } catch {
    return false;
  }
}

/** The same check for the tenant the current request's host resolves to. */
export async function loadWhatsAppAvailability(): Promise<boolean> {
  try {
    const context = await createPublicApiContext();
    if (context === null) return false;
    return await readWhatsAppAvailability(
      context.api as unknown as AvailabilityRpc,
      context.hostname,
    );
  } catch {
    return false;
  }
}
