# Instance template

This is generator input, not a deployable tenant repository. The private
distribution pipeline renders it together with only `apps/client`,
`apps/dashboard`, and the approved package dependency closure.

The generated repository receives the instance configuration, operating docs,
agent contract, and `.platform` ownership metadata represented here. Values in
this directory are deliberately synthetic and are replaced during provisioning.

`instance/manifest.template.json` contains tenant-specific generator inputs.
Provisioning stamps `whiteLabelVersion`, `configSchemaVersion`, and
`backendContract` from the one authority at root, `platform-contract.json`, to
produce the generated repository's final `instance/manifest.json`.

The template uses the complete semantic brand-token contract and fully validated
PNG brand assets. Existing schema 1 instances must apply
[`docs/config-migrations/0001-to-0002-brand-tokens.md`](../docs/config-migrations/0001-to-0002-brand-tokens.md)
before adopting schema 2. Schema 2 instances must then apply
[`docs/config-migrations/0002-to-0003-raster-brand-assets.md`](../docs/config-migrations/0002-to-0003-raster-brand-assets.md)
before adopting schema 3.

## Rebrand in one place

Everything that makes one tenant's site look and read differently from another
lives in `instance/`. Application source never contains a tenant's name, logo,
colours or marketing text.

| Change                                             | Edit                                                                                 | Notes                                                                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Business name, logo, icon, favicon, social image   | `brand.json` → `name`, `assets`; PNG files in `assets/`                              | Assets are validated PNGs (no SVG, no metadata).                                                                  |
| Colours, fonts, radius, spacing, motion            | `brand.json` → `tokens`                                                              | Every colour pair is contrast-checked at publish.                                                                 |
| Installed-app icon and theme colour                | `assets/` icon PNG; `brand.json` → `tokens.color.primary`, `tokens.color.background` | Square PNG, at least 512 × 512 px; 192/512 and maskable icons are generated at build. See `docs/pwa.md` upstream. |
| Dark theme                                         | `brand.json` → `tokens.colorDark`                                                    | Optional. Without it the theme toggle is hidden. Same contrast rules as `color`.                                  |
| Default theme                                      | `brand.json` → `appearance.defaultTheme`                                             | `"light"` (default) or `"dark"` (requires `colorDark`).                                                           |
| All site text (title, hero, sections, footer, SEO) | `content/ar.json` and `content/en.json`                                              | Flat dotted keys, identical in both files, `{placeholder}` interpolation.                                         |
| Default language and supported languages           | `manifest.template.json` → `defaultLocale`, `supportedLocales`                       | Arabic is the default; `/` opens in the visitor's last chosen language, otherwise this one.                       |
| Feature switches                                   | `features.json`                                                                      | Runtime entitlements from the control plane still override these.                                                 |
| Navigation entries                                 | `navigation.json`                                                                    |                                                                                                                   |

`theme.css` mirrors `brand.json` tokens as CSS custom properties and is checked
for exact agreement by `pnpm check:config`; regenerate it whenever tokens
change. All visual components come from the shared `@wlbp/ui-foundation`
(shadcn/ui + Tailwind) library, so a new brand never needs component CSS.
