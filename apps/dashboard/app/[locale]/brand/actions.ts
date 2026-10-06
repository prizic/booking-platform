"use server";
import type { DashboardMessageKey } from "../../_lib/copy";

import { cookies } from "next/headers";
import { dashboardBrand } from "../../_lib/brand";
import { parseBrandEditor, brandDraftFields } from "./brand-fields";
import { brandResultKeys } from "./results";
import type { Locale } from "@wlbp/i18n";
import { parseBrandConfig } from "@wlbp/white-label-ui";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { DashboardRpcError } from "../../_lib/dashboard-data-source";
import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { decisionOutcomeFor, type DecisionOutcome } from "../../_lib/request-decisions";

type BrandOutcome =
  | DecisionOutcome
  | "drafted"
  | "not-publishable"
  | "published"
  | "rolled-back"
  | "unsafe-content";

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

function trimmed(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export async function saveBrandDraftAction(formData: FormData): Promise<never> {
  const locale: Locale = formData.get("locale") === "ar" ? "ar" : "en";
  const brandKey = trimmed(formData, "brandKey");
  const configRaw = trimmed(formData, "config");
  const contentRaw = trimmed(formData, "content");
  if (brandKey === null || configRaw === null || contentRaw === null) {
    redirect(resultUrl(locale, "invalid-request"));
  }

  let config: unknown;
  let content: unknown;
  try {
    // Tokens, contrast ratios, fonts and asset paths are validated here, by the
    // same parser the renderer uses. Shipping a brand that fails contrast is a
    // thing this refuses before the database is asked.
    config = parseBrandConfig(JSON.parse(configRaw));
    content = JSON.parse(contentRaw);
    if (typeof content !== "object" || content === null || Array.isArray(content)) {
      throw new Error("content must be an object");
    }
  } catch {
    redirect(resultUrl(locale, "invalid-request"));
  }

  const request = await loadDashboardRequestAccess(locale);
  if (
    request.source === null ||
    request.state.kind !== "ready" ||
    request.source.saveBrandDraft === undefined
  ) {
    redirect(resultUrl(locale, "not-authorized"));
  }

  let outcome: BrandOutcome;
  try {
    await request.source.saveBrandDraft({
      brandKey,
      config,
      content,
      tenantId: request.state.context.tenantId,
    });
    outcome = "drafted";
  } catch (error) {
    outcome = brandOutcomeFor(error);
  }
  if (outcome === "drafted") revalidatePath(`/${locale}/brand`);
  redirect(resultUrl(locale, outcome));
}

export async function publishBrandAction(formData: FormData): Promise<never> {
  const locale: Locale = formData.get("locale") === "ar" ? "ar" : "en";
  if (formData.get("confirm") !== "yes") redirect(resultUrl(locale, "invalid-request"));
  const brandRevisionId = trimmed(formData, "brandRevisionId");
  const expectedContentHash = trimmed(formData, "contentHash");
  if (brandRevisionId === null || expectedContentHash === null) {
    redirect(resultUrl(locale, "invalid-request"));
  }

  const request = await loadDashboardRequestAccess(locale);
  if (
    request.source === null ||
    request.state.kind !== "ready" ||
    request.source.publishBrandRevision === undefined
  ) {
    redirect(resultUrl(locale, "not-authorized"));
  }

  let outcome: BrandOutcome;
  try {
    await request.source.publishBrandRevision({
      brandRevisionId,
      expectedContentHash,
      tenantId: request.state.context.tenantId,
    });
    outcome = "published";
  } catch (error) {
    outcome = brandOutcomeFor(error);
  }
  if (outcome === "published") revalidatePath(`/${locale}`, "layout");
  redirect(resultUrl(locale, outcome));
}

export async function rollbackBrandAction(formData: FormData): Promise<never> {
  const locale: Locale = formData.get("locale") === "ar" ? "ar" : "en";
  if (formData.get("confirm") !== "yes") redirect(resultUrl(locale, "invalid-request"));
  const brandId = trimmed(formData, "brandId");
  const toRevision = Number(formData.get("toRevision"));
  if (brandId === null || !Number.isSafeInteger(toRevision)) {
    redirect(resultUrl(locale, "invalid-request"));
  }

  const request = await loadDashboardRequestAccess(locale);
  if (
    request.source === null ||
    request.state.kind !== "ready" ||
    request.source.rollbackBrand === undefined
  ) {
    redirect(resultUrl(locale, "not-authorized"));
  }

  let outcome: BrandOutcome;
  try {
    await request.source.rollbackBrand({
      brandId,
      tenantId: request.state.context.tenantId,
      toRevision,
    });
    outcome = "rolled-back";
  } catch (error) {
    outcome = brandOutcomeFor(error);
  }
  if (outcome === "rolled-back") revalidatePath(`/${locale}`, "layout");
  redirect(resultUrl(locale, outcome));
}

export interface BrandFormResult {
  readonly saved?: boolean;
  readonly message?: DashboardMessageKey;
  readonly field?: string;
}
export async function saveStructuredBrandAction(
  _state: BrandFormResult,
  form: FormData,
): Promise<BrandFormResult> {
  const locale = form.get("locale") === "ar" ? "ar" : "en";
  const request = await loadDashboardRequestAccess(locale);
  if (
    request.state.kind !== "ready" ||
    !request.source?.getBrandEditor ||
    !request.source.saveBrandEditor
  )
    return { message: "requestsResultNotAuthorized" };
  try {
    const current = parseBrandEditor(
      await request.source.getBrandEditor(request.state.context.tenantId),
    );
    let draft;
    try {
      draft = brandDraftFields(
        current ?? { config: dashboardBrand, content: {} },
        form,
      );
    } catch {
      return { message: "requestsResultInvalid", field: "brand" };
    }
    const brandKey = String(form.get("brandKey") ?? "");
    const expectedHash = String(form.get("contentHash") ?? "") || null;
    if (
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(brandKey) ||
      (expectedHash && !/^[a-f0-9]{64}$/u.test(expectedHash))
    )
      return { message: "requestsResultInvalid" };
    await request.source.saveBrandEditor({
      tenantId: request.state.context.tenantId,
      brandKey,
      expectedHash,
      ...draft,
    });
    revalidatePath(`/${locale}/brand`);
    return { saved: true, message: "brandResultDrafted" };
  } catch (error) {
    const outcome = brandOutcomeFor(error);
    return {
      message:
        outcome in brandResultKeys
          ? brandResultKeys[outcome as keyof typeof brandResultKeys]
          : "requestsResultUnavailable",
    };
  }
}
export async function previewBrandAction(form: FormData): Promise<never> {
  const locale = form.get("locale") === "ar" ? "ar" : "en";
  const request = await loadDashboardRequestAccess(locale);
  if (request.state.kind !== "ready" || !request.source?.issueBrandPreview)
    redirect(resultUrl(locale, "not-authorized"));
  const id = String(form.get("brandRevisionId") ?? "");
  if (!/^[a-f0-9-]{36}$/iu.test(id)) redirect(resultUrl(locale, "invalid-request"));
  let preview;
  try {
    preview = await request.source.issueBrandPreview({
      tenantId: request.state.context.tenantId,
      brandRevisionId: id,
    });
  } catch (error) {
    redirect(resultUrl(locale, brandOutcomeFor(error)));
  }
  const store = await cookies();
  store.set("dashboard-brand-preview", preview.previewToken, {
    httpOnly: true,
    secure: process.env.WLBP_RUNTIME_ENV !== "local",
    sameSite: "lax",
    path: "/",
    expires: new Date(preview.expiresAt),
  });
  redirect(`/${locale}/brand-preview?mode=draft`);
}
