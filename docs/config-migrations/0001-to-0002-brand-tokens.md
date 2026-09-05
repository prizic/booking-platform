# Config schema 1 → 2: complete semantic brand tokens

Schema 2 completes the brand contract required by issue #5. It adds paired
status foregrounds, Arabic typography, type scales, borders, spacing, content
widths, and a one-to-one reduced-motion value for every duration. Asset keys and
existing semantic token values are preserved.

## Before (schema 1)

```json
{
  "color": {
    "background": "#fffaf4",
    "surface": "#ffffff",
    "text": "#17211b",
    "muted": "#526158",
    "border": "#cad4cc",
    "primary": "#155c3f",
    "onPrimary": "#ffffff",
    "success": "#137333",
    "warning": "#8a4b00",
    "danger": "#b3261e",
    "focus": "#8a3ffc"
  },
  "radius": { "control": "0.5rem", "surface": "1rem" },
  "motion": { "standard": "180ms", "reduced": "0ms" },
  "typography": {
    "bodyFamily": "system-ui, sans-serif",
    "displayFamily": "system-ui, sans-serif"
  }
}
```

## After (schema 2)

Keep every existing value above except `border`: schema 1's bootstrap border
can fail the new 3:1 non-text check, so replace it with the accessible value
shown below. Add the remaining keys exactly as shown; a tenant may then choose
different values only if `pnpm check:config` accepts them.

```json
{
  "color": {
    "background": "#fffaf4",
    "surface": "#ffffff",
    "text": "#17211b",
    "muted": "#526158",
    "border": "#747d78",
    "primary": "#155c3f",
    "onPrimary": "#ffffff",
    "success": "#137333",
    "onSuccess": "#ffffff",
    "warning": "#8a4b00",
    "onWarning": "#ffffff",
    "danger": "#b3261e",
    "onDanger": "#ffffff",
    "focus": "#8a3ffc"
  },
  "typography": {
    "bodyFamily": "system-ui, sans-serif",
    "displayFamily": "system-ui, sans-serif",
    "arabicBodyFamily": "\"Noto Sans Arabic\", Tahoma, sans-serif",
    "arabicDisplayFamily": "\"Noto Naskh Arabic\", Tahoma, serif",
    "size": {
      "caption": "0.75rem",
      "body": "1rem",
      "label": "0.875rem",
      "title": "1.5rem",
      "display": "4.5rem"
    },
    "weight": {
      "regular": "400",
      "medium": "500",
      "semibold": "600",
      "bold": "700"
    },
    "lineHeight": { "compact": "1.2", "body": "1.55", "relaxed": "1.7" }
  },
  "radius": { "control": "0.5rem", "surface": "1rem", "pill": "999rem" },
  "borderWidth": { "default": "0.0625rem", "strong": "0.125rem" },
  "spacing": {
    "xxs": "0.25rem",
    "xs": "0.5rem",
    "sm": "0.75rem",
    "md": "1rem",
    "lg": "1.5rem",
    "xl": "2rem",
    "xxl": "3rem"
  },
  "contentWidth": { "form": "40rem", "reading": "70ch", "wide": "78rem" },
  "motion": {
    "fast": "120ms",
    "standard": "180ms",
    "slow": "300ms",
    "reducedFast": "0ms",
    "reduced": "0ms",
    "reducedSlow": "0ms",
    "easingStandard": "cubic-bezier(0.16, 1, 0.3, 1)",
    "easingExit": "ease-in"
  }
}
```

After changing `brand.json`, regenerate `theme.css` from the validated token
map, stamp `configSchemaVersion` from the repository-root
`platform-contract.json`, and run `pnpm check:config`. Never paste selectors or
arbitrary CSS into a token value.
