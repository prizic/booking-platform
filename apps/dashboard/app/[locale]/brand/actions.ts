"use server";

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
  if (outcome === "published") revalidatePath(`/${locale}/brand`);
  redirect(resultUrl(locale, outcome));
}

export async function rollbackBrandAction(formData: FormData): Promise<never> {
  const locale: Locale = formData.get("locale") === "ar" ? "ar" : "en";
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
  if (outcome === "rolled-back") revalidatePath(`/${locale}/brand`);
  redirect(resultUrl(locale, outcome));
}
