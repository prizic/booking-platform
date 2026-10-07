/**
 * The tenant's published brand as an email can safely use it. Everything here
 * arrives from the database (`get_notification_brand_v2`), but it is still
 * treated as untrusted text: a colour that is not a colour, or a logo that is
 * not an absolute https URL, is dropped rather than interpolated into markup.
 */
export interface EmailBrand {
  /** Absolute https URL of the published logo. Anything else is ignored. */
  readonly logoUrl?: string;
  /** `#rgb` or `#rrggbb`. Anything else falls back to a neutral ink. */
  readonly primaryColor?: string;
  /** The brand's own text-on-primary colour; replaced when it is unreadable. */
  readonly onPrimaryColor?: string;
  /** Verified Dashboard origin, used for staff links and preferences. */
  readonly dashboardOrigin?: string;
  /** Verified Client origin. */
  readonly clientOrigin?: string;
  readonly supportEmail?: string;
}

/** Neutral, brand-free defaults: never a platform colour on a tenant's mail. */
export const neutralPrimary = "#27272a";
const lightText = "#ffffff";
const darkText = "#18181b";

/** WCAG AA for normal-size text. Button labels are 15px semibold, not large. */
export const minimumButtonContrast = 4.5;

export function normalizeHexColor(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/u.test(trimmed)) return trimmed;
  if (/^#[0-9a-f]{3}$/u.test(trimmed)) {
    const [, r = "0", g = "0", b = "0"] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return null;
}

function channel(hex: string, offset: number): number {
  const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return value <= 0.039_28 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

/** WCAG 2.x contrast ratio between two normalized `#rrggbb` colours. */
export function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

export interface ButtonColors {
  readonly background: string;
  readonly text: string;
}

/**
 * The brand's own pairing when it is readable; otherwise whichever of white
 * or near-black reads better on the brand colour. The brand colour itself is
 * never changed, so the message still looks like the tenant's.
 */
export function resolveButtonColors(brand: EmailBrand | undefined): ButtonColors {
  const background = normalizeHexColor(brand?.primaryColor) ?? neutralPrimary;
  const preferred = normalizeHexColor(brand?.onPrimaryColor);
  if (
    preferred !== null &&
    contrastRatio(background, preferred) >= minimumButtonContrast
  ) {
    return { background, text: preferred };
  }
  const text =
    contrastRatio(background, lightText) >= contrastRatio(background, darkText)
      ? lightText
      : darkText;
  return { background, text };
}

/**
 * A link the renderer may put in an `href`. Only absolute http(s) URLs without
 * embedded credentials survive, so `javascript:`, `data:`, `mailto:` and
 * relative URLs can never reach a recipient. Plain http stays allowed because
 * a local stack's own Auth URL is `http://`; production origins are https.
 */
export function safeLinkUrl(value: string | undefined): string | null {
  if (value === undefined || value.trim() === "") return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.username !== "" || url.password !== "") return null;
  return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
}

/** An image source: absolute https only, so a mail client never loads mixed content. */
export function safeImageUrl(value: string | undefined): string | null {
  const url = safeLinkUrl(value);
  return url !== null && url.startsWith("https://") ? url : null;
}

/** `https://host[:port]` only, without a path, so a path can be appended safely. */
export function safeOrigin(value: string | undefined): string | null {
  const url = safeLinkUrl(value);
  return url === null ? null : new URL(url).origin;
}

export function safeEmailAddress(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return /^[^\s@<>"']{1,64}@[^\s@<>"']{1,255}\.[a-z]{2,}$/iu.test(trimmed)
    ? trimmed
    : null;
}

/** The brand a worker or preview resolved for one tenant, in both languages. */
export interface NotificationBrand extends EmailBrand {
  readonly defaultLocale?: "ar" | "en";
  readonly nameAr?: string;
  readonly nameEn?: string;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/**
 * Reads one `get_notification_brand_v2` row. Unknown or malformed fields are
 * dropped here; whether what is left is usable is the renderer's decision.
 */
export function parseNotificationBrandRow(value: unknown): NotificationBrand | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const row = value as Readonly<Record<string, unknown>>;
  const entries: [keyof NotificationBrand, string | undefined][] = [
    ["nameEn", optionalText(row.name_en)],
    ["nameAr", optionalText(row.name_ar)],
    ["logoUrl", optionalText(row.logo_url)],
    ["primaryColor", optionalText(row.primary_color)],
    ["onPrimaryColor", optionalText(row.on_primary_color)],
    ["clientOrigin", optionalText(row.client_origin)],
    ["dashboardOrigin", optionalText(row.dashboard_origin)],
    ["supportEmail", optionalText(row.support_email)],
  ];
  const brand: Record<string, string> = {};
  for (const [key, entry] of entries) if (entry !== undefined) brand[key] = entry;
  const locale = row.default_locale;
  if (locale === "ar" || locale === "en") brand.defaultLocale = locale;
  return brand as NotificationBrand;
}

/**
 * The name that signs a message in one language, falling back to the other
 * language rather than to anything of the platform's.
 */
export function brandNameFor(
  brand: NotificationBrand,
  locale: "ar" | "en",
): string | null {
  const name =
    locale === "ar" ? (brand.nameAr ?? brand.nameEn) : (brand.nameEn ?? brand.nameAr);
  return name === undefined || name === "" ? null : name;
}
