# Design System

Purpose: define the token model, brand publishing validation, bilingual parity, and accessibility floor that every tenant surface must meet.

Authoritative source: §11.2, §13.6, §5.1 and §5.2 of [the architecture spec](../WHITE_LABEL_BOOKING_PLATFORM_PRODUCT_ARCHITECTURE.md).

Related: [docs/README.md](./README.md) · [architecture](./architecture.md) · [glossary](./glossary.md) · [engineering rules](./engineering-rules.md) · [customization boundaries](./customization-boundaries.md) · [security and privacy](./security-and-privacy.md) · [release scope](./release-scope.md) · [local setup](./local-setup.md) · [runbooks](./runbooks.md) · [references](./references.md) · [ADRs](./adr/README.md)

---

## 1. Rules that do not bend

1. Tenants theme through **semantic tokens**, never through tenant-authored component CSS.
2. Arabic and RTL are a **first-sprint foundation**, never a late skin. See §5.
3. WCAG 2.2 AA is a release gate, not a backlog item. See §6.
4. Accessible primitives live in `ui-foundation` and carry no tenant opinion; `white-label-ui` maps brand tokens onto them.
5. One component tree renders both LTR and RTL. Duplicated directional pages are a defect.

---

## 2. Token categories

| Category | Tokens | Notes |
| --- | --- | --- |
| Color | `background`, `surface`, `text`, `muted`, `border`, `primary`, `on-primary`, `success`, `warning`, `danger`, `focus` | Semantic roles only. No `blue-500`-style names in the tenant surface. |
| Typography | Body family, display family, scale, weight, line height | Must include an Arabic-capable family; see §5. |
| Shape | Radius scale, border widths | |
| Space | Spacing scale, content widths | Logical, direction-neutral. |
| Motion | Duration, easing, reduced-motion overrides | Every motion token needs its reduced-motion counterpart. |
| Assets | Light logo, dark logo, icon, favicon, social-share image | Declared in `brand.json`, files under `instance/assets/`. |

The executable schema is `BrandTokens` in `packages/white-label-ui`. Its
configuration groups are `color`, `typography`, `radius`, `borderWidth`,
`spacing`, `contentWidth`, and `motion`. Typography declares explicit Arabic
body and display families; every normal motion duration has a zero-duration
reduced-motion partner. Asset paths are a separate `BrandAssets` contract and
must be safe root-relative paths below `/assets/`.

Client and Dashboard load the same complete brand definition at Next startup.
A generated repository reads `instance/brand.json`; this source monorepo uses
the synthetic `instance-template/instance/brand.json`. Startup materializes
only the five validated asset roles into each app's public `/assets/` tree, and
runtime parsing fails closed before a page renders. The browser brand matrix
boots a second, complete config and asset set; it does not rewrite CSS variables
after render.

### Naming

- Name by **role**, not by appearance or by where it is used today: `color.text.muted`, not `color.grey` and not `color.footer-text`.
- Pairs stay paired: any background token that carries text has a matching `on-*` foreground token, and the pair is contrast-validated together.
- `theme.css` may only set approved CSS custom properties. Global selectors that break component semantics are rejected — see [customization boundaries](./customization-boundaries.md).

---

## 3. Brand publishing validation

Publishing a brand runs the full validation set. Any failure blocks publish.

| Check | Requirement |
| --- | --- |
| Contrast | Every declared color combination is validated at publish time, not sampled by hand. |
| Metadata | Tenant-specific title/description, canonical URL, Open Graph assets, robots rules, sitemap. |
| Assets | Light and dark logo, icon, favicon, social-share image present and optimized; no PII, no credentials in `assets/`. |
| Locale | Every supported locale in `manifest.json` has complete `content/*.json`; no missing keys, no fallback-to-English gaps in the Client surface. |
| Typography | Declared families render all supported locales, including Arabic glyph coverage. |
| Motion | Reduced-motion overrides present for every motion token. |

The publish validator accepts opaque `#RRGGBB` colors only. It enforces 4.5:1
for body/muted text, semantic status foregrounds, and each `on-*` pair, plus
3:1 for borders and focus indicators against both page and surface contexts.
Unknown keys, CSS functions, selectors, remote assets, data URLs, and path
traversal fail closed. Browser checks still cover the rendered state matrix;
token arithmetic does not replace an automated accessibility scan.

### The preview must cover more than a hero

Generated brand preview must render, at minimum:

- Buttons in all states (default, hover, focus-visible, active, disabled, loading)
- Forms including validation and error states
- Calendar states: available, held, unavailable, selected, past, over-capacity
- Error and empty states
- The full surface in RTL
- Mobile breakpoints
- Email templates

A landing-page hero alone is not a valid brand preview.

---

## 4. Surfaces

### 4.1 Client (public booking website)

The token model must survive the whole booking path, not just marketing pages: home, services and categories, service detail, staff selection, location selection, availability calendar and slots, intake form, checkout, confirmation, manage/reschedule/cancel, and tenant-authored policy, terms, privacy, contact, and accessibility pages.

Client-specific design obligations:

- Show availability in the customer's selected timezone while clearly displaying the service/location timezone near every bookable time.
- Make price, taxes, deposits, cancellation terms, and approval status legible before confirmation — legibility here is a design requirement, not copy alone.
- Preserve in-progress checkout with a visible expiring hold; the countdown must be perceivable non-visually too.
- Guest checkout must be a first-class path; account creation is never a visual dead end.
- Generate tenant-specific metadata, canonical URLs, Open Graph assets, robots rules, and sitemap.

### 4.2 Dashboard (tenant staff workspace)

Dense, operational, and used all day. Modules include Today, Calendar, Bookings, Customers, Services, Team, Resources, Availability, Payments, Communications, Reports, Brand & site, Integrations, Settings, and Audit.

Dashboard-specific design obligations:

- Dense calendar grids always have an accessible list alternative.
- Drag-to-reschedule must have a keyboard-operable equivalent with the same validation.
- Hidden controls are never a security boundary — the server enforces scope regardless of what the UI renders. See [engineering rules](./engineering-rules.md).
- State is never conveyed by color alone (booking status, payment status, conflict warnings).

---

## 5. English/Arabic parity and semantic RTL

**Arabic/RTL is a first-sprint foundation, never a late skin.** Building LTR first and "adding Arabic later" produces mirrored hacks, duplicated components, and permanent parity debt. Both locales ship together from the first UI sprint.

### Parity contract

- English and Arabic must be **functionally equivalent**: same features, same flows, same validation, same emails, same downloadable files.
- Source copy is stored by **message key**. Never concatenate translated fragments to build a sentence.
- URLs and metadata are locale-aware.
- Localize digits, dates, times, currency, plural rules, validation messages, emails, and generated documents — not just page copy.

### Semantic RTL, not mirroring

- Set `dir="rtl"` at the document/locale level and let components respond.
- Use **CSS logical properties** exclusively in shared components: `margin-inline-start`, `padding-inline-end`, `inset-inline-start`, `border-inline-*`, `text-align: start/end`.
- Forbidden: `margin-left`/`margin-right` in shared components, `[dir="rtl"] .foo { … }` override blocks, `transform: scaleX(-1)` on layouts, and duplicated `*-rtl` component variants.
- Icons that encode direction (back, next, progress arrows) flip via logical mirroring; icons that do not (logos, clocks, brand marks, checkmarks) must not flip.
- Time and calendar layouts follow the locale's reading order without inverting chronological meaning.

### Time and locale data

- Store instants in UTC; store zones as IANA identifiers.
- Show the selected timezone near every bookable time in both locales.

---

## 6. Accessibility target: WCAG 2.2 AA

WCAG 2.2 AA is the floor for both Client and Dashboard. Concrete checks:

| Check | Requirement |
| --- | --- |
| Keyboard | Every interactive path is fully operable by keyboard alone, including calendar navigation, slot selection, drag-to-reschedule equivalents, and dialogs. No keyboard traps. |
| Focus visible | A persistent, clearly visible focus indicator using the `focus` token; never removed by brand CSS. Focus is managed across route changes, dialogs, and async updates. |
| Target size | Interactive targets meet the AA minimum target size — checked specifically on dense calendar grids and mobile slot pickers. |
| Labels | Every control has a programmatic name; labels are not placeholder-only; the visible label matches the accessible name. |
| Error identification | Errors are identified in text, associated with their field, described with a fix, and announced — not signaled by color or border alone. |
| Screen reader | Status changes (hold started, hold expiring, slot taken, booking confirmed, payment result) are announced via live regions; dense grids have a list alternative. |
| Contrast | Text and non-text contrast validated per brand at publish time, not per developer eyeball. |
| Reduced motion | `prefers-reduced-motion` honored via motion token overrides. |
| Non-color state | No status conveyed by color alone anywhere in either surface. |

### Release gates

- Automated accessibility checks run in CI for both apps.
- Manual keyboard and screen-reader passes are part of the release checklist, in **both** English and Arabic.
- Removing RTL, keyboard, focus, contrast, mobile, or error-state behavior is never an accepted customization at any support tier.

Verification commands and the human acceptance pass live in [local setup](./local-setup.md) and [runbooks](./runbooks.md). Scope per release is tracked in [release scope](./release-scope.md); external standards are listed in [references](./references.md).
