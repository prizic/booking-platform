/*
 * Reads the stored brand editor document and builds a draft from validated
 * editor values without losing anything the editor does not represent.
 * Validation of the editor's input lives in brand-schema.ts; tokens, contrast
 * pairs, fonts and asset paths are validated by parseBrandConfig, the same
 * parser the renderer uses.
 */
import { parseBrandConfig, type BrandConfig } from "@wlbp/white-label-ui";
import type { BrandEditorValues } from "./brand-schema";

export interface BrandEditor {
  readonly brandKey: string;
  readonly revisionId: string;
  readonly revision: number;
  readonly state: string;
  readonly contentHash: string;
  readonly published?: {
    config: BrandConfig;
    content: Readonly<Record<string, unknown>>;
  };
  readonly config: BrandConfig;
  readonly content: Readonly<Record<string, unknown>>;
}
export function brandObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("invalid");
  return { ...(value as Record<string, unknown>) };
}
export function parseBrandEditor(value: unknown): BrandEditor | null {
  if (value === null) return null;
  const r = brandObject(value);
  if (
    typeof r.brandKey !== "string" ||
    typeof r.revisionId !== "string" ||
    typeof r.revision !== "number" ||
    !Number.isSafeInteger(r.revision) ||
    typeof r.state !== "string" ||
    typeof r.contentHash !== "string" ||
    !/^[a-f0-9]{64}$/u.test(r.contentHash)
  )
    throw new Error("invalid");
  return {
    brandKey: r.brandKey,
    revisionId: r.revisionId,
    revision: r.revision,
    state: r.state,
    contentHash: r.contentHash,
    config: parseBrandConfig(r.config),
    content: brandObject(r.content),
    ...(r.published
      ? {
          published: {
            config: parseBrandConfig(brandObject(r.published).config),
            content: brandObject(brandObject(r.published).content),
          },
        }
      : {}),
  };
}

/**
 * Merges validated editor values into the stored brand. Throws when the
 * resulting configuration fails the renderer's own checks (for example an
 * unreadable contrast pair).
 */
export function brandDraft(
  base: { config: BrandConfig; content: Readonly<Record<string, unknown>> },
  values: BrandEditorValues,
) {
  const content = brandObject(base.content);
  const color = { ...base.config.tokens.color };
  for (const key of Object.keys(color) as (keyof typeof color)[])
    if (key in values.colors) color[key] = values.colors[key];
  const typography = { ...base.config.tokens.typography, ...values.fonts };
  content.title = {
    ...brandObject(content.title ?? {}),
    en: values.titleEn,
    ar: values.titleAr,
  };
  content.contact = { ...brandObject(content.contact ?? {}), email: values.email };
  content.legal = {
    ...brandObject(content.legal ?? {}),
    privacyUrl: values.privacyUrl,
    termsUrl: values.termsUrl,
  };
  return {
    config: parseBrandConfig({
      ...base.config,
      name: values.name,
      tokens: { ...base.config.tokens, color, typography },
    }),
    content,
  };
}

export function brandChangedSections(draft: BrandEditor): string[] {
  if (!draft.published)
    return ["identity", "colors", "typography", "assets", "content"];
  const base = draft.published;
  return [
    draft.config.name !== base.config.name ? "identity" : null,
    JSON.stringify(draft.config.tokens.color) !==
    JSON.stringify(base.config.tokens.color)
      ? "colors"
      : null,
    JSON.stringify(draft.config.tokens.typography) !==
    JSON.stringify(base.config.tokens.typography)
      ? "typography"
      : null,
    JSON.stringify(draft.config.assets) !== JSON.stringify(base.config.assets)
      ? "assets"
      : null,
    JSON.stringify(draft.content) !== JSON.stringify(base.content) ? "content" : null,
  ].filter((value): value is string => value !== null);
}
