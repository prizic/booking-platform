import { parsePublicCatalogV1, type PublicCatalogItemV1 } from "@wlbp/api-contracts";
import { parsePublicRuntimeConfig } from "@wlbp/config";
import { createRequestScopedSupabaseClient } from "@wlbp/supabase-client/server";
import {
  extractRequestHostname,
  type RuntimeEnvironment,
} from "@wlbp/tenant-resolution";
import { cookies, headers } from "next/headers";
import type { Locale } from "@wlbp/i18n";

function runtimeEnvironment(): RuntimeEnvironment {
  const value = process.env.WLBP_RUNTIME_ENV;
  if (
    value === "local" ||
    value === "test" ||
    value === "development" ||
    value === "preview" ||
    value === "production"
  )
    return value;
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

export async function loadPublishedCatalog(
  locale: Locale,
): Promise<readonly PublicCatalogItemV1[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return [];
  try {
    const configuration = parsePublicRuntimeConfig({
      environment: runtimeEnvironment(),
      supabaseUrl: url,
      supabasePublishableKey: key,
    });
    const hostname = extractRequestHostname(await headers(), {
      ...(process.env.LOCAL_TENANT_HOST
        ? { localFallback: process.env.LOCAL_TENANT_HOST }
        : {}),
      runtimeEnvironment: runtimeEnvironment(),
    });
    const cookieStore = await cookies();
    const client = createRequestScopedSupabaseClient(
      {
        url: configuration.supabaseUrl,
        publishableKey: configuration.supabasePublishableKey,
      },
      {
        getAll: () => cookieStore.getAll(),
      },
    );
    const { data, error } = await client.schema("api_v1").rpc("get_public_catalog_v1", {
      p_hostname: hostname,
      p_locale: locale,
      p_service_key: null,
    });
    if (error || !Array.isArray(data)) return [];
    return parsePublicCatalogV1(
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
  } catch {
    return [];
  }
}
