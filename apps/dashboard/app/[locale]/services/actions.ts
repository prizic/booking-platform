"use server";
import { revalidatePath } from "next/cache";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { DashboardRpcError } from "../../_lib/dashboard-data-source";
import { catalogDraftDocument } from "./catalog-fields";
import type { CatalogMessageKey } from "./catalog-copy";
export interface CatalogResult {
  readonly nextRequestId?: string;
  readonly message?: CatalogMessageKey;
  readonly saved?: boolean;
  readonly destination?: string;
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
function resultError(error: unknown): CatalogResult {
  const allowed: readonly CatalogMessageKey[] = [
    "revision_conflict",
    "idempotency_conflict",
    "catalog_approval_required",
    "catalog_legal_content_required",
    "catalog_reference_invalid",
    "catalog_locales_required",
    "catalog_category_in_use",
    "catalog_assignment_invalid",
    "catalog_time_zone_invalid",
    "catalog_first_release_invalid",
  ];
  const code = error instanceof DashboardRpcError ? error.stableMessage : null;
  return {
    message: allowed.includes(code as CatalogMessageKey)
      ? (code as CatalogMessageKey)
      : "unavailable",
  };
}
export async function saveCatalogDraftAction(
  _state: CatalogResult,
  form: FormData,
): Promise<CatalogResult> {
  const locale = form.get("locale") === "ar" ? "ar" : "en";
  const kind = form.get("kind");
  const entity = form.get("entityId");
  const requestId = form.get("requestId");
  const expected = form.get("expectedRevision");
  if (
    (kind !== "service" && kind !== "category" && kind !== "location") ||
    typeof requestId !== "string" ||
    !uuid.test(requestId) ||
    typeof entity !== "string" ||
    (entity && !uuid.test(entity))
  )
    return { message: "invalid" };
  const request = await loadDashboardRequestAccess(locale);
  if (
    request.state.kind !== "ready" ||
    !request.source?.getCatalogWorkspace ||
    !request.source.saveCatalogEntity
  )
    return { message: "denied" };
  try {
    const workspace = await request.source.getCatalogWorkspace(
      request.state.context.tenantId,
    );
    const base = entity
      ? workspace.entities.find((row) => row.id === entity && row.kind === kind)
      : undefined;
    if (entity && !base) return { message: "denied" };
    const document = catalogDraftDocument(kind, form, base, workspace.canPublish);
    if (!document) return { message: "invalid" };
    if (
      entity &&
      (typeof expected !== "string" ||
        !/^\d+$/u.test(expected) ||
        !Number.isSafeInteger(Number(expected)))
    )
      return { message: "invalid" };
    const result = await request.source.saveCatalogEntity({
      tenantId: request.state.context.tenantId,
      requestId,
      kind,
      entityId: entity || null,
      expectedRevision: entity ? Number(expected) : null,
      document,
    });
    if (
      typeof result !== "object" ||
      result === null ||
      !("id" in result) ||
      typeof result.id !== "string" ||
      !uuid.test(result.id)
    )
      return { message: "unavailable" };
    for (const path of ["services", "categories", "locations"])
      revalidatePath(`/${locale}/${path}`);
    return {
      saved: true,
      nextRequestId: crypto.randomUUID(),
      message: "saved",
      destination: `/${locale}/${kind === "service" ? "services" : kind === "category" ? "categories" : "locations"}/${result.id}?result=saved`,
    };
  } catch (error) {
    return resultError(error);
  }
}
export async function publishCatalogAction(
  _state: CatalogResult,
  form: FormData,
): Promise<CatalogResult> {
  const locale = form.get("locale") === "ar" ? "ar" : "en";
  const requestId = form.get("requestId");
  const manifest = form.get("manifest");
  if (
    form.get("confirm") !== "yes" ||
    typeof requestId !== "string" ||
    !uuid.test(requestId) ||
    typeof manifest !== "string" ||
    manifest.length > 100000
  )
    return { message: "invalid" };
  const request = await loadDashboardRequestAccess(locale);
  if (request.state.kind !== "ready" || !request.source?.publishCatalogWorkspace)
    return { message: "denied" };
  try {
    const revisions: unknown = JSON.parse(manifest);
    if (
      typeof revisions !== "object" ||
      revisions === null ||
      Array.isArray(revisions) ||
      Object.entries(revisions).some(
        ([id, revision]) =>
          !uuid.test(id) ||
          typeof revision !== "number" ||
          !Number.isSafeInteger(revision) ||
          revision < 1,
      )
    )
      return { message: "invalid" };
    await request.source.publishCatalogWorkspace({
      tenantId: request.state.context.tenantId,
      requestId,
      revisions: revisions as Record<string, number>,
    });
    for (const path of [
      "services",
      "categories",
      "locations",
      "calendar",
      "availability",
    ])
      revalidatePath(`/${locale}/${path}`);
    return { saved: true, nextRequestId: crypto.randomUUID(), message: "published" };
  } catch (error) {
    return resultError(error);
  }
}
