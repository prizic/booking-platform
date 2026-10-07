"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import type { Locale } from "@wlbp/i18n";
import {
  actionError,
  actionOk,
  parseActionInput,
  type ActionResult,
} from "@wlbp/ui-foundation/actions";

import { dashboardBrand } from "../../_lib/brand";
import { DashboardRpcError } from "../../_lib/dashboard-data-source";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { decisionOutcomeFor, type DecisionOutcome } from "../../_lib/request-decisions";
import { brandDraft, parseBrandEditor } from "./brand-document";
import {
  brandEditorSchema,
  brandPreviewSchema,
  brandPublishSchema,
  brandRollbackSchema,
  type BrandEditorInput,
  type BrandPreviewInput,
  type BrandPublishInput,
  type BrandRollbackInput,
} from "./brand-schema";

type BrandOutcome =
  | DecisionOutcome
  | "drafted"
  | "not-publishable"
  | "published"
  | "rolled-back"
  | "unsafe-content";

/** Where a successful brand change is reported (the page's result banner). */
function resultUrl(locale: Locale, outcome: BrandOutcome): string {
  return `/${locale}/brand?result=${outcome}`;
}

/**
 * The two refusals this surface adds. "That contained markup we will not store"
 * and "that revision cannot go live" are different problems with different
 * fixes, and an author told the wrong one edits the wrong thing.
 */
function brandOutcomeFor(error: unknown): BrandOutcome {
  const stable = error instanceof DashboardRpcError ? (error.stableMessage ?? "") : "";
  if (stable === "brand_unsafe_content") return "unsafe-content";
  if (stable === "brand_not_publishable") return "not-publishable";
  return decisionOutcomeFor(error);
}

type Destination = { readonly destination: string };

export async function publishBrandAction(
  input: BrandPublishInput,
): Promise<ActionResult<Destination>> {
  const parsed = parseActionInput(brandPublishSchema, input);
  if (!parsed.ok) return parsed.result;
  const { locale, brandRevisionId, contentHash } = parsed.data;
  const request = await loadDashboardRequestAccess(locale);
  if (
    request.source === null ||
    request.state.kind !== "ready" ||
    request.source.publishBrandRevision === undefined
  )
    return actionError("not-authorized");
  try {
    await request.source.publishBrandRevision({
      brandRevisionId,
      expectedContentHash: contentHash,
      tenantId: request.state.context.tenantId,
    });
  } catch (error) {
    return actionError(brandOutcomeFor(error));
  }
  revalidatePath(`/${locale}`, "layout");
  return actionOk({ destination: resultUrl(locale, "published") });
}

export async function rollbackBrandAction(
  input: BrandRollbackInput,
): Promise<ActionResult<Destination>> {
  const parsed = parseActionInput(brandRollbackSchema, input);
  if (!parsed.ok) return parsed.result;
  const { locale, brandId, toRevision } = parsed.data;
  const request = await loadDashboardRequestAccess(locale);
  if (
    request.source === null ||
    request.state.kind !== "ready" ||
    request.source.rollbackBrand === undefined
  )
    return actionError("not-authorized");
  try {
    await request.source.rollbackBrand({
      brandId,
      tenantId: request.state.context.tenantId,
      toRevision,
    });
  } catch (error) {
    return actionError(brandOutcomeFor(error));
  }
  revalidatePath(`/${locale}`, "layout");
  return actionOk({ destination: resultUrl(locale, "rolled-back") });
}

/**
 * Saves the structured brand editor as the draft. Tokens, contrast ratios,
 * fonts and asset paths are validated by the renderer's own parser before the
 * database is asked; shipping a brand that fails contrast is refused here.
 */
export async function saveStructuredBrandAction(
  input: BrandEditorInput,
): Promise<ActionResult> {
  const parsed = parseActionInput(brandEditorSchema, input);
  if (!parsed.ok) return parsed.result;
  const { locale, brandKey, contentHash } = parsed.data;
  const request = await loadDashboardRequestAccess(locale);
  if (
    request.state.kind !== "ready" ||
    !request.source?.getBrandEditor ||
    !request.source.saveBrandEditor
  )
    return actionError("not-authorized");
  try {
    const current = parseBrandEditor(
      await request.source.getBrandEditor(request.state.context.tenantId),
    );
    let draft;
    try {
      draft = brandDraft(
        current ?? { config: dashboardBrand, content: {} },
        parsed.data,
      );
    } catch {
      return actionError("brand_review");
    }
    await request.source.saveBrandEditor({
      tenantId: request.state.context.tenantId,
      brandKey,
      expectedHash: contentHash || null,
      ...draft,
    });
    revalidatePath(`/${locale}/brand`);
    return actionOk(undefined, "drafted");
  } catch (error) {
    return actionError(brandOutcomeFor(error));
  }
}

/** Issues a private preview of the saved draft and opens it. */
export async function previewBrandAction(
  input: BrandPreviewInput,
): Promise<ActionResult<Destination>> {
  const parsed = parseActionInput(brandPreviewSchema, input);
  if (!parsed.ok) return parsed.result;
  const { locale, brandRevisionId } = parsed.data;
  const request = await loadDashboardRequestAccess(locale);
  if (request.state.kind !== "ready" || !request.source?.issueBrandPreview)
    return actionError("not-authorized");
  let preview;
  try {
    preview = await request.source.issueBrandPreview({
      tenantId: request.state.context.tenantId,
      brandRevisionId,
    });
  } catch (error) {
    return actionError(brandOutcomeFor(error));
  }
  const store = await cookies();
  store.set("dashboard-brand-preview", preview.previewToken, {
    httpOnly: true,
    secure: process.env.WLBP_RUNTIME_ENV !== "local",
    sameSite: "lax",
    path: "/",
    expires: new Date(preview.expiresAt),
  });
  return actionOk({ destination: `/${locale}/brand-preview?mode=draft` });
}
