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
must be safe root-relative paths below `/assets/`. Tenant-authored SVG and every
non-PNG format are not accepted. Each declared asset must be a non-symlink
regular file under the canonical `instance/assets/` root. Publishing validates
PNG structure and checksums, bounded dimensions, decompressed pixel rows, and
role-specific file-size limits before copying a validated in-memory snapshot
into either app. EXIF, text, and other metadata chunks are rejected so private
image metadata cannot enter the public asset tree.

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
| Assets | Light logo, optional dark logo, icon, favicon, and social-share PNG present and optimized; structure, checksums, dimensions, decompressed rows, and size limits verified; no symlinks, active content, PII, or credentials in `assets/`. |
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
- Empty availability uses a privacy-safe recovery state (`outside booking window`,
  `policy restricted`, `no matching availability`, or `capacity unavailable`)
  in both languages. Copy must never expose another customer, a private schedule
  reason, staff fairness inputs, or provider details.
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

---

## 7. Component system: shadcn/ui + Tailwind

All three applications (Client, Dashboard, Platform Admin) render through one
component library, `@wlbp/ui-foundation`, built on shadcn/ui patterns, Radix
primitives and Tailwind CSS v4. One `Button`, one `Input`, one `Select`, and so
on, with variants; applications never author component CSS and never render
raw form controls (`button`, `input` other than hidden, `select`, `textarea`,
`table`, `dialog`, native date/time pickers).

- **Token bridge.** `packages/ui-foundation/src/theme.css` maps the validated
  `--brand-*` custom properties (set on `<html>` by `createBrandStyle`) onto the
  semantic roles the components use (`background`, `foreground`, `card`,
  `primary`, `muted-foreground`, `border`, `ring`, status colours, a derived
  stepped neutral ramp `neutral-1..4`, and "ink" variants for text on soft
  fills). Each app's `globals.css` contains only the Tailwind entry, this theme
  and the three local font faces.
- **Dark theme.** `brand.json` may declare `tokens.colorDark`, validated with
  the same contrast floor as `color`. Without it the theme toggle is hidden.
  `appearance.defaultTheme` selects the first-visit theme (light by default);
  the visitor's choice is remembered in the `wlbp-theme` cookie and applied on
  the server, so there is no flash.
- **Default language.** The instance manifest's `defaultLocale` is Arabic. `/`
  opens in the visitor's last chosen language (`wlbp-locale` cookie), otherwise
  the default; Accept-Language is no longer used for the first redirect.
- **Visual direction (Sadu Band).** Operate surfaces follow an Arabic-first
  merchant-console layout: a semantic rail on the inline-start edge (a light
  surface in light mode, the dark surface in dark mode), a top bar
  with the Hijri/Gregorian date, and the working day drawn as woven bands
  (`ScheduleBands`: one lane per staff member or resource, bookings as dyed
  segments, requests woven, cancellations struck through and never removed).
  The triangle-tooth edge appears only on band edges. Booking references use
  `ReferenceCode`; record states use `StatusStamp` (always words plus colour).
- **Forms and data.** Every form uses React Hook Form with one Zod schema
  that the browser form and the server action (or API route) both apply:
  `parseActionInput` re-validates untrusted input before any existing
  authorization, idempotency and RPC logic, and the database functions remain
  the final authority for booking, capacity, price and permissions. Schemas
  emit stable error codes rendered in Arabic or English by `FormMessage`.
  Every create/update/delete runs as a React Query mutation
  (`useActionMutation` for server actions); server-rendered pages keep
  server-side reads and refresh after a mutation, while reads that happen in
  the browser use `useQuery`. Mutations are never retried automatically.
  Platform Admin schemas stay inside the private app.
- **Dependencies.** `radix-ui`, `class-variance-authority`, `clsx`,
  `tailwind-merge`, `lucide-react`, `tw-animate-css`, `react-day-picker`,
  `date-fns`, `react-hook-form`, `@hookform/resolvers`, `zod`,
  `@tanstack/react-query`, `sonner` (promise toasts: one `<AppToaster>` per app
  outside `<main>`, `useActionMutation({ toast })`; additive to on-page status
  messages, toast content never takes `role="status"`) (all MIT/ISC/Apache-2.0)
  in the distributed `ui-foundation` package; `tailwindcss` and `@tailwindcss/postcss` as app build tooling.
  Versions are pinned in the pnpm catalog and respect the release-age policy.

## 8. Shared workspace navigation and data pages

Dashboard and Platform Admin share presentation through `@wlbp/ui-foundation`.
Their authorization, schemas, lifecycle mappings, reasons, audit and mutations
remain inside their application boundaries. No private control-plane types or
SDKs belong in these components.

### AppShell link adapter and persisted desktop collapse

`AppShell` retains every existing prop and defaults to ordinary anchors and an
expanded rail. Apps enable client navigation with the optional `renderLink:
LinkRenderer` prop. A renderer receives `NavigationLinkProps` (anchor props with
a required string `href`, including `ref`, `children`, `className`, `onClick`,
and ARIA attributes) and returns one anchor-compatible element. Forward **all**
props, especially the ref used by tooltips and the click handler that closes the
mobile sheet. The package adapter imports no Next API.

In a Next app, define the renderer in an **app-owned client wrapper**, not in a
Server Component passed across the client boundary:

```tsx
"use client";
import Link from "next/link";
import { AppShell, type LinkRenderer } from "@wlbp/ui-foundation";

const renderWorkspaceLink: LinkRenderer = ({
  onClick,
  onMouseEnter,
  onTouchStart,
  ...props
}) => (
  <Link
    {...props}
    {...(onClick !== undefined ? { onClick } : {})}
    {...(onMouseEnter !== undefined ? { onMouseEnter } : {})}
    {...(onTouchStart !== undefined ? { onTouchStart } : {})}
  />
);
// The wrapper composes <AppShell {...props} renderLink={renderWorkspaceLink} />.
```

With `exactOptionalPropertyTypes`, the installed Next Link types require absent
`onClick`, `onMouseEnter` and `onTouchStart` handlers to be omitted, whereas native
React anchor props permit explicit `undefined`. The adapter above preserves
every supplied handler, all other anchor props and the ref without casts or
weakening either component's types. Shared wrappers likewise omit their optional
`renderLink`, `titleId` and `className` props when absent.

`NavigationLink` exposes the same adapter for app-owned links. `DataTable` and
`DataPagination` also accept `renderLink`; server-rendered users can supply a
server-local renderer, while client users define it in their client wrapper.
Use the app's existing loading boundaries for dynamic pages. Link composition
does not cache authorization or change a read's request scope.

Desktop collapse is opt-in through `sidebar: AppShellSidebarOptions`:

- `collapseLabel` and `expandLabel` are required localized accessible names.
- `initialCollapsed?: boolean` defaults to false. Server layouts read
  `SIDEBAR_COOKIE` (`wlbp-sidebar`) and call `resolveSidebarCollapsed(value)`.
  Pass this same resolved value through first hydration. Do not read storage
  during rendering, suppress hydration warnings, or patch the initial DOM.
- `cookieName?: string` lets each workspace use a separate preference cookie.
  Its server layout must read the identical name. Invalid names fall back to
  `SIDEBAR_COOKIE`. The app may use `wlbp-dashboard-sidebar` and
  `wlbp-admin-sidebar` to keep choices independent on a shared origin.
- `persist?: boolean` defaults to true. Explicit toggles write `collapsed` or
  `expanded` using the existing path-wide, SameSite=Lax, one-year preference
  cookie. It contains no identity or authority. Cookie writes that are blocked
  do not disable the shell. With `persist: false`, state lasts only for that
  mounted shell. `onCollapsedChange?` is available for app-owned persistence.
- `collapsedBrand?: ReactNode` and `collapsedFooter?: ReactNode` provide
  compact content. Expanded brand/footer nodes are **unmounted** when
  collapsed, preventing hidden focusable controls. Keep account actions
  available in the topbar or a compact footer. Supply a theme-appropriate logo
  for the light rail; do not assume the rail is always a dark logo ground.

The collapse button has `aria-expanded` and `aria-controls`. Navigation keeps
`aria-current="page"`, readable screen-reader names and count text, visible
focus and a non-color current-item edge/weight. Icon-only items have tooltips;
items without supplied icons use a visual initial while keeping the full
accessible name. Desktop collapse never collapses the mobile Sheet; its brand,
labels and footer remain complete. The Sheet closes on navigation and when the
viewport enters the desktop breakpoint. Logical edges and one component tree
serve Arabic and English. Collapse changes have no layout animation, and the
global reduced-motion override still applies to tooltips and the Sheet.

### Rail token compatibility

The existing `rail`, `rail-foreground`, `rail-muted`, `rail-accent` and
`rail-ring` CSS roles keep their names. Both themes now derive them directly
from `card`, `foreground`, `muted-foreground`, `background` and `foreground`,
respectively. Light mode therefore uses the brand's validated light surface;
dark mode keeps its dark surface. Text/muted pairs are already validated at
4.5:1 on both surface and background; the focus edge uses the validated text
contrast rather than translucent ink. Rail ink is no longer a color mix whose
contrast can diverge from the publish checks. These are derived roles, not new
tenant JSON fields. `BrandTokens`, existing brand config and backend contracts
remain compatible with N/N-1; no config migration is needed. Apps use semantic
classes rather than adding hardcoded rail palettes.

### Data component contract

| Component | Props and responsibility |
| --- | --- |
| `DataPage` | Existing `PageHeader` props (`title`, optional `description`, `actions`, `meta`, `titleId`, `className`), required `children`, optional `toolbar`, `feedback`, `pagination`, `busy`. Renders header → toolbar → feedback → body → pagination; `busy` marks the body. Supply a unique `titleId` to name the section. |
| `FilterBar` | Form props, required `label`, optional `actions`; defaults to GET. Apps supply named controls, submit/reset buttons and retained hidden query fields. It does not own router or URL state. |
| `FilterField` | Required `label`, `htmlFor`, `children`; optional `className`. Compose with existing `Input`, `Select` or other labelled controls using a matching id. |
| `DataTable` | Required `id`, `caption`, `columns: readonly DataColumn[]`, `rows: readonly DataRow[]`; optional `sort`, `sortHref`, `sortLabel`, `renderLink`, `className`. Columns have `key`, `label`, optional `kind: data/actions`, `sort`, `className`. Rows have `key`, ordered `cells`. Provide a nonempty localized label for action columns. |
| `DataPagination` | Required `label`, `summary`, `pageLabel`, `page`, `pageCount`, `previousLabel`, `nextLabel`; optional `previousHref`, `nextHref`, `renderLink`, `className`. Apps format full page/count text. First/last boundaries are disabled buttons without hrefs. |
| `LoadingState` | Required `label`; optional `rows` (default four, bounded to twelve), `className`. Live text plus decorative skeletons. |
| `EmptyState` | Reuse the existing `title`, optional `description`, `action`, `icon`, `className`. Successful empty reads only. |
| `ErrorState` | Required `title`, explicit `retry: ReactElement`; optional `description`, `className`. An alert with a sanitized message and app-owned read retry. No automatic retry. |
| `SuccessState` | Required `title`; optional `description`, `className`. Inline polite status after a confirmed result, additive to toasts. |
| `StatusBadge` | Required localized `label`; optional existing `BadgeTone`, `icon` and span props. Mapping private lifecycle values to tones remains app-owned. Use existing `StatusStamp` where its Sadu record states are appropriate. |
| `ActionDialog` | Existing Dialog root props plus required `title`, `description`, `closeLabel`, `children`; optional `trigger: ReactElement`, `footer`, `contentProps`. Generic accessible dialog shell only. Apps own RHF/Zod, errors, reasons, step-up and `useActionMutation`; close only on success, and block dismissal through controlled `onOpenChange` while pending if required. |

`DataTable` renders one set of cells as a semantic desktop table with caption,
column scopes and `aria-sort`, and as a mobile record list with explicit label/
value pairs. Sorting links also appear on mobile. Supply `sortLabel(column,
nextDirection)` as a complete localized action name. `sortHref` and pagination
hrefs must preserve relevant filters and use app-validated URL state. Do not
place customer PII in query parameters. An empty table does not choose a read
state: the page branches explicitly to `EmptyState` or `ErrorState` according
to its DAL outcome. Use `LoadingState` in app loading boundaries.

Migration: Dashboard data screens should compose `DataPage`, `FilterBar`,
`DataTable`/existing table or list primitives, explicit states and pagination.
Platform Admin's private table/filter/pagination/states/status-badge modules can
become adapters over these components. Convert private columns to keyed,
labelled `DataColumn` values (including `kind: "actions"`); keep private status
maps and href construction in the app. Its action-dialog may reuse
`ActionDialog` or the existing `Dialog`/`AlertDialog` primitives while retaining
all schemas and privileged actions in the private app. Confirmation for a
simple irreversible choice can use the existing `AlertDialog` family; do not
force forms into a shared mutation abstraction.

`@wlbp/i18n` exports `workspaceMessages`, a complete English/Arabic message-key
catalog for shell labels, filtering, loading/read states, sorting and
pagination. Use `createTranslator(locale, workspaceMessages[locale])`; format
number interpolation with `formatNumber` before translating the full message.
Application-specific record counts, lifecycle copy and reasons stay local.
