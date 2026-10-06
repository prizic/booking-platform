import { parseBrandConfig, type BrandConfig } from "@wlbp/white-label-ui";
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
export function brandDraftFields(
  base: { config: BrandConfig; content: Readonly<Record<string, unknown>> },
  form: FormData,
) {
  const content = brandObject(base.content);
  const text = (key: string) => String(form.get(key) ?? "").trim();
  const color = { ...base.config.tokens.color };
  for (const key of Object.keys(color) as (keyof typeof color)[])
    if (form.has(`color-${key}`)) color[key] = text(`color-${key}`);
  const typography = { ...base.config.tokens.typography };
  for (const key of [
    "bodyFamily",
    "displayFamily",
    "arabicBodyFamily",
    "arabicDisplayFamily",
  ] as const)
    if (form.has(`font-${key}`)) typography[key] = text(`font-${key}`);
  const title = brandObject(content.title ?? {});
  for (const locale of ["en", "ar"]) title[locale] = text(`title-${locale}`);
  if (
    !title.en ||
    !title.ar ||
    String(title.en).length > 160 ||
    String(title.ar).length > 160
  )
    throw new Error("title");
  content.title = title;
  const contact = brandObject(content.contact ?? {});
  contact.email = text("email");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(String(contact.email)))
    throw new Error("email");
  content.contact = contact;
  const legal = brandObject(content.legal ?? {});
  for (const key of ["privacyUrl", "termsUrl"]) {
    const value = text(key);
    try {
      const url = new URL(value);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        value.length > 2048
      )
        throw new Error();
    } catch {
      throw new Error(key);
    }
    legal[key] = value;
  }
  content.legal = legal;
  return {
    config: parseBrandConfig({
      ...base.config,
      name: text("name"),
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
