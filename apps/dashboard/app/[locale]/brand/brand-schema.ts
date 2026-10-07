/*
 * One schema per brand form: the browser validates with it and the server
 * action validates the same input again. Contrast pairs, fonts and asset
 * paths are then checked by the same parser the renderer uses
 * (parseBrandConfig) when the draft is built.
 */
import { z } from "zod";
import {
  EMAIL_PATTERN,
  KEY_PATTERN,
  confirmed,
  localeField,
  requiredText,
} from "../services/schema-kit";

export const brandColorKeys = [
  "background",
  "surface",
  "text",
  "muted",
  "border",
  "primary",
  "onPrimary",
  "success",
  "onSuccess",
  "warning",
  "onWarning",
  "danger",
  "onDanger",
  "focus",
] as const;
export type BrandColorKey = (typeof brandColorKeys)[number];

export const brandFontKeys = [
  "bodyFamily",
  "displayFamily",
  "arabicBodyFamily",
  "arabicDisplayFamily",
] as const;
export type BrandFontKey = (typeof brandFontKeys)[number];

/** An https:// link with no embedded credentials. */
const legalLink = z
  .string()
  .trim()
  .min(1, { error: "required" })
  .max(2048, { error: "too_long" })
  .refine(
    (value) => {
      try {
        const url = new URL(value);
        return url.protocol === "https:" && !url.username && !url.password;
      } catch {
        return false;
      }
    },
    { error: "brand_link_invalid" },
  );

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/u, { error: "brand_color_invalid" });

export const brandEditorSchema = z.object({
  locale: localeField,
  brandKey: z.string().regex(KEY_PATTERN, { error: "invalid" }),
  /** The content hash the editor was rendered from ("" for a first draft). */
  contentHash: z.union([
    z.literal(""),
    z.string().regex(/^[a-f0-9]{64}$/u, { error: "invalid" }),
  ]),
  name: requiredText(160),
  email: z
    .string()
    .trim()
    .min(1, { error: "required" })
    .regex(EMAIL_PATTERN, { error: "invalid_email" }),
  titleEn: requiredText(160),
  titleAr: requiredText(160),
  privacyUrl: legalLink,
  termsUrl: legalLink,
  colors: z.object(
    Object.fromEntries(brandColorKeys.map((key) => [key, hexColor])) as Record<
      BrandColorKey,
      typeof hexColor
    >,
  ),
  fonts: z.object(
    Object.fromEntries(brandFontKeys.map((key) => [key, requiredText(200)])) as Record<
      BrandFontKey,
      ReturnType<typeof requiredText>
    >,
  ),
});
export type BrandEditorInput = z.input<typeof brandEditorSchema>;
export type BrandEditorValues = z.output<typeof brandEditorSchema>;

const identifier = z.string().trim().min(1, { error: "invalid" }).max(200);

/** Publishing the draft revision exactly as reviewed (content hash pinned). */
export const brandPublishSchema = z.object({
  locale: localeField,
  confirm: confirmed,
  brandRevisionId: identifier,
  contentHash: identifier,
});
export type BrandPublishInput = z.input<typeof brandPublishSchema>;

/** Rolling the published presentation back to a retired revision. */
export const brandRollbackSchema = z.object({
  locale: localeField,
  confirm: confirmed,
  brandId: identifier,
  toRevision: z
    .string()
    .regex(/^\d+$/u, { error: "invalid" })
    .transform(Number)
    .refine((value) => Number.isSafeInteger(value), { error: "invalid" }),
});
export type BrandRollbackInput = z.input<typeof brandRollbackSchema>;

/** Issuing a private preview of the saved draft revision. */
export const brandPreviewSchema = z.object({
  locale: localeField,
  brandRevisionId: z.string().regex(/^[a-f0-9-]{36}$/iu, { error: "invalid" }),
});
export type BrandPreviewInput = z.input<typeof brandPreviewSchema>;
