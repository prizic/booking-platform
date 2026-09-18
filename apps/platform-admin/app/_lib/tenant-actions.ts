"use server";

import { createPlatformAdminRequestClient } from "./platform-admin-server";

export type CreateTenantResult =
  | { kind: "success"; brandId: string; instanceId: string; tenantId: string }
  | { kind: "error"; message: string };

export async function createTenantAction(
  _previous: CreateTenantResult | null,
  formData: FormData,
): Promise<CreateTenantResult> {
  const name = String(formData.get("name") ?? "").trim();
  const brandKey = String(formData.get("brandKey") ?? "").trim();

  const client = await createPlatformAdminRequestClient();
  if (client === null) {
    return { kind: "error", message: "Supabase configuration is missing" };
  }

  const { data, error } = await client.rpc("create_tenant_v1", {
    p_brand_key: brandKey,
    p_name: name,
  });
  if (error) return { kind: "error", message: error.message };

  const row = data?.[0];
  if (!row) return { kind: "error", message: "No tenant was returned" };

  return {
    brandId: row.brand_id,
    instanceId: row.instance_id,
    kind: "success",
    tenantId: row.tenant_id,
  };
}
