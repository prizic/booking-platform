export interface BrandTokens {
  readonly color: {
    readonly background: string;
    readonly surface: string;
    readonly text: string;
    readonly muted: string;
    readonly border: string;
    readonly primary: string;
    readonly onPrimary: string;
    readonly success: string;
    readonly onSuccess: string;
    readonly warning: string;
    readonly onWarning: string;
    readonly danger: string;
    readonly onDanger: string;
    readonly focus: string;
  };
  readonly typography: {
    readonly bodyFamily: string;
    readonly displayFamily: string;
    readonly arabicBodyFamily: string;
    readonly arabicDisplayFamily: string;
    readonly size: {
      readonly caption: string;
      readonly body: string;
      readonly label: string;
      readonly title: string;
      readonly display: string;
    };
    readonly weight: {
      readonly regular: string;
      readonly medium: string;
      readonly semibold: string;
      readonly bold: string;
    };
    readonly lineHeight: {
      readonly compact: string;
      readonly body: string;
      readonly relaxed: string;
    };
  };
  readonly radius: {
    readonly control: string;
    readonly surface: string;
    readonly pill: string;
  };
  readonly borderWidth: {
    readonly default: string;
    readonly strong: string;
  };
  readonly spacing: {
    readonly xxs: string;
    readonly xs: string;
    readonly sm: string;
    readonly md: string;
    readonly lg: string;
    readonly xl: string;
    readonly xxl: string;
  };
  readonly contentWidth: {
    readonly form: string;
    readonly reading: string;
    readonly wide: string;
  };
  readonly motion: {
    readonly fast: string;
    readonly standard: string;
    readonly slow: string;
    readonly reducedFast: string;
    readonly reduced: string;
    readonly reducedSlow: string;
    readonly easingStandard: string;
    readonly easingExit: string;
  };
}

export class BrandTokenValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Brand tokens are invalid:\n- ${issues.join("\n- ")}`);
    this.name = "BrandTokenValidationError";
    this.issues = Object.freeze([...issues]);
  }
}

const tokenKeys = [
  "color",
  "typography",
  "radius",
  "borderWidth",
  "spacing",
  "contentWidth",
  "motion",
] as const;
const colorKeys = [
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
const typographyKeys = [
  "bodyFamily",
  "displayFamily",
  "arabicBodyFamily",
  "arabicDisplayFamily",
  "size",
  "weight",
  "lineHeight",
] as const;
const typographySizeKeys = ["caption", "body", "label", "title", "display"] as const;
const typographyWeightKeys = ["regular", "medium", "semibold", "bold"] as const;
const lineHeightKeys = ["compact", "body", "relaxed"] as const;
const radiusKeys = ["control", "surface", "pill"] as const;
const borderWidthKeys = ["default", "strong"] as const;
const spacingKeys = ["xxs", "xs", "sm", "md", "lg", "xl", "xxl"] as const;
const contentWidthKeys = ["form", "reading", "wide"] as const;
const motionKeys = [
  "fast",
  "standard",
  "slow",
  "reducedFast",
  "reduced",
  "reducedSlow",
  "easingStandard",
  "easingExit",
] as const;

const hexColorPattern = /^#[0-9a-f]{6}$/iu;
const remLengthPattern = /^(?:0|(?:0|[1-9]\d*)(?:\.\d+)?rem)$/u;
const contentLengthPattern = /^(?:0|(?:0|[1-9]\d*)(?:\.\d+)?(?:ch|rem))$/u;
const durationPattern = /^(?:0|[1-9]\d*)ms$/u;
const safeEasingPattern =
  /^(?:linear|ease|ease-in|ease-out|ease-in-out|cubic-bezier\(-?\d+(?:\.\d+)?,\s*-?\d+(?:\.\d+)?,\s*-?\d+(?:\.\d+)?,\s*-?\d+(?:\.\d+)?\))$/u;
const fontFamilyPartPattern =
  /^(?:[\p{L}\p{N}][\p{L}\p{N} -]*|"[\p{L}\p{N}][\p{L}\p{N} -]*"|'[\p{L}\p{N}][\p{L}\p{N} -]*')$/u;

/**
 * Fonts shipped by the Client and Dashboard. Generic families remain valid
 * only as the final fallback; a tenant cannot make rendering depend on an
 * operating-system-installed face or a remote font host.
 */
export const shippedFontFamilies = Object.freeze({
  Inter: Object.freeze({ minWeight: 100, maxWeight: 900 }),
  "Noto Sans Arabic": Object.freeze({ minWeight: 100, maxWeight: 900 }),
  "Noto Naskh Arabic": Object.freeze({ minWeight: 400, maxWeight: 700 }),
});

const genericFontFamilies = new Set([
  "cursive",
  "fantasy",
  "monospace",
  "sans-serif",
  "serif",
  "system-ui",
]);

function unquoteFontFamily(value: string): string {
  return value.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/u, "$1$2");
}

function fontFamilyNames(value: string): string[] {
  return value
    .split(",")
    .map((part) => unquoteFontFamily(part.trim()))
    .filter((part) => !genericFontFamilies.has(part));
}

function validateShippedFontFamily(
  value: unknown,
  label: string,
  weights: readonly unknown[],
  issues: string[],
): void {
  if (typeof value !== "string" || !isFontFamily(value)) return;
  const parts = value.split(",").map((part) => part.trim());
  const genericIndex = parts.findIndex((part) =>
    genericFontFamilies.has(unquoteFontFamily(part)),
  );
  if (genericIndex !== -1 && genericIndex !== parts.length - 1) {
    issues.push(`${label} must place generic fallbacks last`);
    return;
  }
  const names = fontFamilyNames(value);
  const primary = names[0];
  const undeclared = names.filter((name) => !(name in shippedFontFamilies));
  if (undeclared.length > 0) {
    issues.push(
      `${label} contains undeclared font family fallback(s): ${undeclared.join(", ")}`,
    );
    return;
  }
  if (!primary || !(primary in shippedFontFamilies)) {
    issues.push(`${label} must begin with a shipped font family`);
    return;
  }
  const range = shippedFontFamilies[primary as keyof typeof shippedFontFamilies];
  for (const weight of weights) {
    if (typeof weight !== "string" || !/^[1-9]00$/u.test(weight)) continue;
    const numericWeight = Number(weight);
    if (numericWeight < range.minWeight || numericWeight > range.maxWeight) {
      issues.push(
        `${label} does not provide the requested ${weight} weight for ${primary}`,
      );
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateExactRecord(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
  issues: string[],
): value is Record<string, unknown> {
  if (!isRecord(value)) {
    issues.push(`${label} must be an object`);
    return false;
  }

  const actualKeys = Object.keys(value);
  const expected = new Set(expectedKeys);
  const missing = expectedKeys.filter((key) => !actualKeys.includes(key));
  const unexpected = actualKeys.filter((key) => !expected.has(key));

  if (missing.length > 0) {
    issues.push(`${label} is missing key(s): ${missing.join(", ")}`);
  }
  if (unexpected.length > 0) {
    issues.push(`${label} has unexpected key(s): ${unexpected.join(", ")}`);
  }
  return missing.length === 0 && unexpected.length === 0;
}

function validateStringValues(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
  predicate: (candidate: string) => boolean,
  expected: string,
  issues: string[],
): void {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate !== "string" || !predicate(candidate)) {
      issues.push(`${label}.${key} must be ${expected}`);
    }
  }
}

function isFontFamily(value: string): boolean {
  if (value.length === 0 || value.length > 200) return false;
  const parts = value.split(",").map((part) => part.trim());
  return parts.length >= 2 && parts.every((part) => fontFamilyPartPattern.test(part));
}

function isLineHeight(value: string): boolean {
  if (!/^(?:1(?:\.\d+)?|2(?:\.[0-5])?)$/u.test(value)) return false;
  const numeric = Number(value);
  return numeric >= 1 && numeric <= 2.5;
}

function rawContrastRatio(first: string, second: string): number {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map(
      (offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255,
    );
    const linear = channels.map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
  };

  const firstLuminance = luminance(first);
  const secondLuminance = luminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

export function contrastRatio(first: string, second: string): number {
  if (!hexColorPattern.test(first) || !hexColorPattern.test(second)) {
    throw new Error("Contrast colors must use the #RRGGBB format");
  }
  return Math.round(rawContrastRatio(first, second) * 100) / 100;
}

function validateContrast(
  colors: Record<string, unknown>,
  foreground: string,
  background: string,
  minimum: number,
  issues: string[],
): void {
  const foregroundValue = colors[foreground];
  const backgroundValue = colors[background];
  if (
    typeof foregroundValue !== "string" ||
    typeof backgroundValue !== "string" ||
    !hexColorPattern.test(foregroundValue) ||
    !hexColorPattern.test(backgroundValue)
  ) {
    return;
  }

  const ratio = rawContrastRatio(foregroundValue, backgroundValue);
  if (ratio < minimum) {
    issues.push(
      `color.${foreground} on color.${background} has contrast ${ratio.toFixed(2)}:1; minimum is ${minimum}:1`,
    );
  }
}

export function validateBrandTokens(value: unknown): readonly string[] {
  const issues: string[] = [];
  if (!validateExactRecord(value, tokenKeys, "tokens", issues)) {
    return Object.freeze(issues);
  }

  const colors = value.color;
  if (validateExactRecord(colors, colorKeys, "color", issues)) {
    validateStringValues(
      colors,
      colorKeys,
      "color",
      (candidate) => hexColorPattern.test(candidate),
      "an opaque hexadecimal color (#RRGGBB)",
      issues,
    );
    for (const [foreground, background, minimum] of [
      ["text", "background", 4.5],
      ["text", "surface", 4.5],
      ["muted", "background", 4.5],
      ["muted", "surface", 4.5],
      ["onPrimary", "primary", 4.5],
      ["onSuccess", "success", 4.5],
      ["onWarning", "warning", 4.5],
      ["onDanger", "danger", 4.5],
      ["success", "background", 4.5],
      ["success", "surface", 4.5],
      ["warning", "background", 4.5],
      ["warning", "surface", 4.5],
      ["danger", "background", 4.5],
      ["danger", "surface", 4.5],
      ["border", "background", 3],
      ["border", "surface", 3],
      ["focus", "background", 3],
      ["focus", "surface", 3],
    ] as const) {
      validateContrast(colors, foreground, background, minimum, issues);
    }
  }

  const typography = value.typography;
  if (validateExactRecord(typography, typographyKeys, "typography", issues)) {
    validateStringValues(
      typography,
      ["bodyFamily", "displayFamily", "arabicBodyFamily", "arabicDisplayFamily"],
      "typography",
      isFontFamily,
      "a comma-separated safe font-family list with a fallback",
      issues,
    );
    if (
      validateExactRecord(
        typography.size,
        typographySizeKeys,
        "typography.size",
        issues,
      )
    ) {
      validateStringValues(
        typography.size,
        typographySizeKeys,
        "typography.size",
        (candidate) => remLengthPattern.test(candidate) && candidate !== "0",
        "a positive rem length",
        issues,
      );
    }
    if (
      validateExactRecord(
        typography.weight,
        typographyWeightKeys,
        "typography.weight",
        issues,
      )
    ) {
      validateStringValues(
        typography.weight,
        typographyWeightKeys,
        "typography.weight",
        (candidate) => /^(?:[1-9]00)$/u.test(candidate),
        "a CSS weight from 100 through 900",
        issues,
      );
    }
    if (
      validateExactRecord(
        typography.lineHeight,
        lineHeightKeys,
        "typography.lineHeight",
        issues,
      )
    ) {
      validateStringValues(
        typography.lineHeight,
        lineHeightKeys,
        "typography.lineHeight",
        isLineHeight,
        "a unitless value from 1 through 2.5",
        issues,
      );
    }
    if (isRecord(typography.weight)) {
      const weights = Object.values(typography.weight);
      for (const familyKey of [
        "bodyFamily",
        "displayFamily",
        "arabicBodyFamily",
        "arabicDisplayFamily",
      ] as const) {
        validateShippedFontFamily(
          typography[familyKey],
          `typography.${familyKey}`,
          weights,
          issues,
        );
      }
    }
  }

  for (const [recordValue, keys, label, pattern, expected] of [
    [value.radius, radiusKeys, "radius", remLengthPattern, "a non-negative rem length"],
    [
      value.spacing,
      spacingKeys,
      "spacing",
      remLengthPattern,
      "a non-negative rem length",
    ],
    [
      value.contentWidth,
      contentWidthKeys,
      "contentWidth",
      contentLengthPattern,
      "a non-negative rem or ch length",
    ],
  ] as const) {
    if (validateExactRecord(recordValue, keys, label, issues)) {
      validateStringValues(
        recordValue,
        keys,
        label,
        (candidate) => pattern.test(candidate),
        expected,
        issues,
      );
    }
  }

  const borderWidth = value.borderWidth;
  if (validateExactRecord(borderWidth, borderWidthKeys, "borderWidth", issues)) {
    validateStringValues(
      borderWidth,
      borderWidthKeys,
      "borderWidth",
      (candidate) =>
        remLengthPattern.test(candidate) && Number.parseFloat(candidate) > 0,
      "a positive rem length",
      issues,
    );
  }

  const motion = value.motion;
  if (validateExactRecord(motion, motionKeys, "motion", issues)) {
    validateStringValues(
      motion,
      ["fast", "standard", "slow"],
      "motion",
      (candidate) => durationPattern.test(candidate) && candidate !== "0ms",
      "a positive duration in whole milliseconds",
      issues,
    );
    validateStringValues(
      motion,
      ["reducedFast", "reduced", "reducedSlow"],
      "motion",
      (candidate) => candidate === "0ms",
      "0ms so reduced motion never depends on animation",
      issues,
    );
    validateStringValues(
      motion,
      ["easingStandard", "easingExit"],
      "motion",
      (candidate) => safeEasingPattern.test(candidate),
      "a safe CSS easing keyword or cubic-bezier value",
      issues,
    );

    const durations = [motion.fast, motion.standard, motion.slow].map((candidate) =>
      typeof candidate === "string" && durationPattern.test(candidate)
        ? Number.parseInt(candidate, 10)
        : Number.NaN,
    );
    if (
      durations.every(Number.isFinite) &&
      !(durations[0]! <= durations[1]! && durations[1]! <= durations[2]!)
    ) {
      issues.push("motion durations must be ordered fast <= standard <= slow");
    }
  }

  return Object.freeze(issues);
}

export function parseBrandTokens(value: unknown): BrandTokens {
  const issues = validateBrandTokens(value);
  if (issues.length > 0) throw new BrandTokenValidationError(issues);

  const tokens = value as BrandTokens;
  return Object.freeze({
    color: Object.freeze({ ...tokens.color }),
    typography: Object.freeze({
      ...tokens.typography,
      size: Object.freeze({ ...tokens.typography.size }),
      weight: Object.freeze({ ...tokens.typography.weight }),
      lineHeight: Object.freeze({ ...tokens.typography.lineHeight }),
    }),
    radius: Object.freeze({ ...tokens.radius }),
    borderWidth: Object.freeze({ ...tokens.borderWidth }),
    spacing: Object.freeze({ ...tokens.spacing }),
    contentWidth: Object.freeze({ ...tokens.contentWidth }),
    motion: Object.freeze({ ...tokens.motion }),
  });
}

export const neutralBrandTokens: BrandTokens = parseBrandTokens({
  color: {
    background: "#f6f7f9",
    surface: "#ffffff",
    text: "#17202a",
    muted: "#52606d",
    border: "#747f8a",
    primary: "#174ea6",
    onPrimary: "#ffffff",
    success: "#137333",
    onSuccess: "#ffffff",
    warning: "#8a4b00",
    onWarning: "#ffffff",
    danger: "#b3261e",
    onDanger: "#ffffff",
    focus: "#0b57d0",
  },
  typography: {
    bodyFamily: 'Inter, "Noto Sans Arabic", sans-serif',
    displayFamily: 'Inter, "Noto Sans Arabic", sans-serif',
    arabicBodyFamily: '"Noto Sans Arabic", sans-serif',
    arabicDisplayFamily: '"Noto Sans Arabic", sans-serif',
    size: {
      caption: "0.75rem",
      body: "1rem",
      label: "0.875rem",
      title: "1.5rem",
      display: "2.5rem",
    },
    weight: { regular: "400", medium: "500", semibold: "600", bold: "700" },
    lineHeight: { compact: "1.2", body: "1.5", relaxed: "1.7" },
  },
  radius: { control: "0.5rem", surface: "0.75rem", pill: "999rem" },
  borderWidth: { default: "0.0625rem", strong: "0.125rem" },
  spacing: {
    xxs: "0.25rem",
    xs: "0.5rem",
    sm: "0.75rem",
    md: "1rem",
    lg: "1.5rem",
    xl: "2rem",
    xxl: "3rem",
  },
  contentWidth: { form: "40rem", reading: "70ch", wide: "90rem" },
  motion: {
    fast: "120ms",
    standard: "180ms",
    slow: "280ms",
    reducedFast: "0ms",
    reduced: "0ms",
    reducedSlow: "0ms",
    easingStandard: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    easingExit: "ease-in",
  },
});
