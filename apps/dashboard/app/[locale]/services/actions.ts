"use server";
import { revalidatePath } from "next/cache";
import {
  actionError,
  actionOk,
  parseActionInput,
  type ActionResult,
} from "@wlbp/ui-foundation/actions";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { DashboardRpcError } from "../../_lib/dashboard-data-source";
import {
  catalogContentSchema,
  catalogDraftSchema,
  catalogPublicationSchema,
  type CatalogPublicationInput,
  type CatalogDraft,
  type CatalogEditorValues,
} from "./catalog-schema";
import { catalogDraftDocument } from "./catalog-document";
import { UUID_PATTERN } from "./schema-kit";

/** Catalog refusals the editor explains; everything else is "unavailable". */
const knownErrors = [
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
] as const;

function resultError(error: unknown): ActionResult<never> {
  const code = error instanceof DashboardRpcError ? error.stableMessage : null;
  return actionError(
    knownErrors.includes(code as (typeof knownErrors)[number])
      ? (code as string)
      : "unavailable",
  );
}

const section = (kind: "service" | "category" | "location") =>
  kind === "service" ? "services" : kind === "category" ? "categories" : "locations";

export async function saveCatalogDraftAction(
  input: CatalogEditorValues,
): Promise<ActionResult<{ readonly destination: string }>> {
  const parsed = parseActionInput(catalogContentSchema, input);
  if (!parsed.ok) return parsed.result;
  const { locale: language, kind, entityId, expectedRevision, requestId } = parsed.data;
  const request = await loadDashboardRequestAccess(language);
  if (
    request.state.kind !== "ready" ||
    !request.source?.getCatalogWorkspace ||
    !request.source.saveCatalogEntity
  )
    return actionError("denied");
  try {
    const workspace = await request.source.getCatalogWorkspace(
      request.state.context.tenantId,
    );
    const base = entityId
      ? workspace.entities.find((row) => row.id === entityId && row.kind === kind)
      : undefined;
    if (entityId && !base) return actionError("denied");
    // Full catalog authority is decided from the workspace, never from input.
    let full: CatalogDraft | null = null;
    if (workspace.canPublish) {
      const draft = parseActionInput(catalogDraftSchema, input);
      if (!draft.ok) return draft.result;
      full = draft.data;
    }
    const document = catalogDraftDocument(kind, parsed.data, full, base);
    if (!document) return actionError("invalid");
    const result = await request.source.saveCatalogEntity({
      tenantId: request.state.context.tenantId,
      requestId,
      kind,
      entityId: entityId || null,
      expectedRevision: entityId ? expectedRevision : null,
      document,
    });
    if (
      typeof result !== "object" ||
      result === null ||
      !("id" in result) ||
      typeof result.id !== "string" ||
      !UUID_PATTERN.test(result.id)
    )
      return actionError("unavailable");
    for (const path of ["services", "categories", "locations"])
      revalidatePath(`/${language}/${path}`);
    return actionOk(
      { destination: `/${language}/${section(kind)}/${result.id}?result=saved` },
      "saved",
    );
  } catch (error) {
    return resultError(error);
  }
}

export async function publishCatalogAction(
  input: CatalogPublicationInput,
): Promise<ActionResult> {
  const parsed = parseActionInput(catalogPublicationSchema, input);
  if (!parsed.ok) return parsed.result;
  const language = parsed.data.locale;
  const request = await loadDashboardRequestAccess(language);
  if (request.state.kind !== "ready" || !request.source?.publishCatalogWorkspace)
    return actionError("denied");
  try {
    await request.source.publishCatalogWorkspace({
      tenantId: request.state.context.tenantId,
      requestId: parsed.data.requestId,
      revisions: parsed.data.revisions,
    });
    for (const path of [
      "services",
      "categories",
      "locations",
      "calendar",
      "availability",
    ])
      revalidatePath(`/${language}/${path}`);
    return actionOk(undefined, "published");
  } catch (error) {
    return resultError(error);
  }
}
