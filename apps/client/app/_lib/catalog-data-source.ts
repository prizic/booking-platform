import { parsePublicCatalogV1, type PublicCatalogItemV1 } from "@wlbp/api-contracts";
import type { Locale } from "@wlbp/i18n";

import {
  createPublicReadContext,
  publicRpcFailure,
  reportPublicReadFailure,
  type PublicReadFailure,
  type PublicRpcClient,
} from "./public-read-context";

export type PublishedCatalog =
  | { readonly outcome: "ready"; readonly items: readonly PublicCatalogItemV1[] }
  | { readonly outcome: "empty"; readonly items: readonly PublicCatalogItemV1[] }
  | PublicReadFailure;

/** The catalog RPC returns [] for both an invalid route and a genuine empty catalog.
 * Resolve the active verified route first so those states cannot be conflated. */
export async function readPublishedCatalog(
  api: PublicRpcClient,
  hostname: string,
  locale: Locale,
): Promise<PublishedCatalog> {
  let data: unknown;
  let tenantId: string;
  try {
    const route = await api.rpc("resolve_public_tenant_v1", {
      p_hostname: hostname,
      p_application: "client",
    });
    if (route.error) return publicRpcFailure(route.error);
    if (!Array.isArray(route.data)) return { outcome: "error", reason: "parse" };
    if (route.data.length === 0) return { outcome: "error", reason: "tenant" };
    const row = route.data[0] as Record<string, unknown> | null;
    if (
      route.data.length !== 1 ||
      typeof row?.tenant_id !== "string" ||
      !/^[0-9a-f-]{36}$/iu.test(row.tenant_id)
    )
      return { outcome: "error", reason: "parse" };
    tenantId = row.tenant_id;
    const result = await api.rpc("get_public_catalog_v1", {
      p_hostname: hostname,
      p_locale: locale,
    });
    if (result.error) return publicRpcFailure(result.error);
    data = result.data;
  } catch {
    return { outcome: "error", reason: "read" };
  }
  try {
    if (!Array.isArray(data)) return { outcome: "error", reason: "parse" };
    const items = parsePublicCatalogV1(
      data.map((row) => {
        const item = row as Record<string, unknown>;
        return {
          tenantId: item.tenant_id,
          publicationId: item.publication_id,
          publicationRevision: item.publication_revision,
          locale: item.locale,
          serviceId: item.service_id,
          serviceKey: item.service_key,
          categoryKey: item.category_key,
          serviceName: item.service_name,
          serviceDescription: item.service_description,
          canonicalPath: item.canonical_path,
          durationMinutes: item.duration_minutes,
          bufferBeforeMinutes: item.buffer_before_minutes,
          bufferAfterMinutes: item.buffer_after_minutes,
          price: { currency: item.currency, minorUnits: item.price_minor },
          taxRateBps: item.tax_rate_bps,
          capacityMode: item.capacity_mode,
          bookingMode: item.booking_mode,
          approvalRequired: item.approval_required,
          paymentMode: item.payment_mode,
          locationId: item.location_id,
          locationKey: item.location_key,
          locationName: item.location_name,
          locationDescription: item.location_description,
          locationAddress: item.location_address,
          locationTimeZone: item.location_time_zone,
          locationCanonicalPath: item.location_canonical_path,
          cacheTag: item.cache_tag,
        };
      }),
    );
    if (items.some((item) => item.tenantId !== tenantId || item.locale !== locale))
      return { outcome: "error", reason: "parse" };
    return { outcome: items.length === 0 ? "empty" : "ready", items };
  } catch {
    return { outcome: "error", reason: "parse" };
  }
}

export async function loadPublishedCatalog(locale: Locale): Promise<PublishedCatalog> {
  const context = await createPublicReadContext();
  const result =
    context.outcome === "error"
      ? context
      : await readPublishedCatalog(context.api, context.hostname, locale);
  if (result.outcome === "error") reportPublicReadFailure("catalog", result);
  return result;
}
