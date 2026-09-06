import { describe, expect, it } from "vitest";

import {
  BrandTokenValidationError,
  contrastRatio,
  createBrandStyle,
  neutralBrandTokens,
  parseBrandTokens,
  validateBrandTokens,
  type BrandTokens,
} from "./index.js";

const validTokens: BrandTokens = {
  color: {
    background: "#f7f8fa",
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
    weight: {
      regular: "400",
      medium: "500",
      semibold: "600",
      bold: "700",
    },
    lineHeight: {
      compact: "1.2",
      body: "1.5",
      relaxed: "1.7",
    },
  },
  radius: {
    control: "0.5rem",
    surface: "0.75rem",
    pill: "999rem",
  },
  borderWidth: {
    default: "0.0625rem",
    strong: "0.125rem",
  },
  spacing: {
    xxs: "0.25rem",
    xs: "0.5rem",
    sm: "0.75rem",
    md: "1rem",
    lg: "1.5rem",
    xl: "2rem",
    xxl: "3rem",
  },
  contentWidth: {
    form: "40rem",
    reading: "70ch",
    wide: "90rem",
  },
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
};

describe("semantic brand tokens", () => {
  it("accepts the complete safe semantic token contract", () => {
    expect(parseBrandTokens(validTokens)).toEqual(validTokens);
    expect(validateBrandTokens(validTokens)).toEqual([]);
    expect(validateBrandTokens(neutralBrandTokens)).toEqual([]);
  });

  it("rejects extra keys and arbitrary tenant-authored CSS", () => {
    const withSelector = {
      ...validTokens,
      color: {
        ...validTokens.color,
        "body > button": "display: none",
      },
    };
    const withCssFunction = {
      ...validTokens,
      spacing: {
        ...validTokens.spacing,
        md: "calc(100vh - 1rem)",
      },
    };

    expect(validateBrandTokens(withSelector).join("\n")).toContain(
      "color has unexpected key",
    );
    expect(validateBrandTokens(withCssFunction).join("\n")).toContain("spacing.md");
    expect(() => parseBrandTokens(withSelector)).toThrow(BrandTokenValidationError);
  });

  it("rejects unshipped font families and weights outside a face's range", () => {
    const unshipped = {
      ...validTokens,
      typography: {
        ...validTokens.typography,
        displayFamily: 'Georgia, "Noto Naskh Arabic", serif',
      },
    };
    const unsupportedWeight = {
      ...validTokens,
      typography: {
        ...validTokens.typography,
        arabicDisplayFamily: '"Noto Naskh Arabic", sans-serif',
        weight: { ...validTokens.typography.weight, bold: "800" },
      },
    };

    expect(validateBrandTokens(unshipped).join("\n")).toContain(
      "typography.displayFamily contains undeclared font family fallback(s): Georgia",
    );
    expect(validateBrandTokens(unsupportedWeight).join("\n")).toContain(
      "typography.arabicDisplayFamily does not provide the requested 800 weight",
    );
  });

  it("rejects unreadable text and non-text contrast pairs deterministically", () => {
    const inaccessible = {
      ...validTokens,
      color: {
        ...validTokens.color,
        muted: "#999999",
        onPrimary: "#777777",
        border: "#eeeeee",
        focus: "#dddddd",
      },
    };

    const issues = validateBrandTokens(inaccessible).join("\n");
    expect(issues).toContain("color.muted on color.background");
    expect(issues).toContain("color.onPrimary on color.primary");
    expect(issues).toContain("color.border on color.background");
    expect(issues).toContain("color.border on color.surface");
    expect(issues).toContain("color.focus on color.background");
  });

  it("rejects zero-width borders that would hide focus and component boundaries", () => {
    const invisibleBorders = {
      ...validTokens,
      borderWidth: {
        default: "0",
        strong: "0rem",
      },
    };

    const issues = validateBrandTokens(invisibleBorders).join("\n");
    expect(issues).toContain("borderWidth.default");
    expect(issues).toContain("borderWidth.strong");
  });

  it("validates status foregrounds on both page and raised surfaces", () => {
    const inaccessibleStatuses = {
      ...validTokens,
      color: {
        ...validTokens.color,
        success: "#999999",
        warning: "#aaaaaa",
        danger: "#bbbbbb",
      },
    };

    const issues = validateBrandTokens(inaccessibleStatuses).join("\n");
    for (const status of ["success", "warning", "danger"]) {
      expect(issues).toContain(`color.${status} on color.background`);
      expect(issues).toContain(`color.${status} on color.surface`);
    }
  });

  it("calculates WCAG sRGB contrast with stable rounding", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBe(21);
    expect(contrastRatio("#777777", "#ffffff")).toBe(4.48);
  });

  it("maps every semantic value to an approved CSS custom property", () => {
    expect(createBrandStyle(validTokens)).toMatchObject({
      "--brand-color-on-success": "#ffffff",
      "--brand-font-arabic-body": '"Noto Sans Arabic", sans-serif',
      "--brand-font-size-display": "2.5rem",
      "--brand-font-weight-semibold": "600",
      "--brand-line-height-body": "1.5",
      "--brand-radius-pill": "999rem",
      "--brand-border-width-strong": "0.125rem",
      "--brand-space-xxl": "3rem",
      "--brand-content-width-reading": "70ch",
      "--brand-motion-slow": "280ms",
      "--brand-motion-reduced-slow": "0ms",
      "--brand-motion-easing-standard": "cubic-bezier(0.2, 0.8, 0.2, 1)",
    });
  });
});
