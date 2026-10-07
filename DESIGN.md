---
name: White-Label Booking Platform
description: Sadu Band, an Arabic-first booking workspace where the working day is woven, not listed.
colors:
  primary: "#8f1d22"
  on-primary: "#ffffff"
  primary-soft: "#f2e4e4"
  primary-ink: "#6f1c1f"
  focus: "#c2410c"
  background: "#fafaf9"
  surface: "#ffffff"
  text: "#1c1917"
  muted: "#57534e"
  border-strong: "#78716c"
  neutral-1: "#f3f3f2"
  neutral-2: "#edeceb"
  neutral-3: "#e2e1e0"
  neutral-4: "#d2d2d0"
  rail: "#1c1917"
  rail-muted: "#bcbbba"
  rail-accent: "#373432"
  success: "#15803d"
  warning: "#a16207"
  danger: "#b91c1c"
  dye-indigo: "oklch(0.42 0.1 262)"
  dye-green: "oklch(0.45 0.08 152)"
  dye-ochre: "oklch(0.47 0.1 58)"
  dye-teal: "oklch(0.44 0.07 205)"
  dye-plum: "oklch(0.42 0.11 335)"
  dark-background: "#0c0a09"
  dark-surface: "#1c1917"
  dark-text: "#f5f5f4"
  dark-muted: "#a8a29e"
  dark-primary: "#f26b6b"
  dark-on-primary: "#1c0a0a"
  dark-focus: "#fb923c"
typography:
  display:
    fontFamily: 'Inter, "Noto Sans Arabic", sans-serif'
    fontSize: "2.25rem (md 3rem, lg 3.75rem)"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.025em"
  headline:
    fontFamily: 'Inter, "Noto Sans Arabic", sans-serif'
    fontSize: "1.5rem (md 1.75rem)"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: 'Inter, "Noto Sans Arabic", sans-serif'
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.375
  body:
    fontFamily: 'Inter, "Noto Sans Arabic", sans-serif'
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.625
  label:
    fontFamily: 'Inter, "Noto Sans Arabic", sans-serif'
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.25
  reference:
    fontFamily: "Inter, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    letterSpacing: "0.06em"
    fontFeature: "tnum"
rounded:
  sm: "1.375rem"
  md: "1.5rem"
  lg: "1.75rem"
  xl: "2rem"
  full: "9999px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  card: "1.25rem"
  dialog: "1.5rem"
  section: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    padding: "0 1rem"
    height: "2.75rem"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0 1rem"
    height: "2.75rem"
  button-secondary:
    backgroundColor: "{colors.neutral-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0 1rem"
    height: "2.75rem"
  button-ghost:
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0 1rem"
    height: "2.75rem"
  button-sm:
    rounded: "{rounded.md}"
    padding: "0 0.75rem"
    height: "2.25rem"
  rail-nav-item:
    textColor: "{colors.rail-muted}"
    rounded: "{rounded.md}"
    padding: "0 0.75rem"
    height: "2.75rem"
  rail-nav-item-current:
    backgroundColor: "{colors.rail-accent}"
    textColor: "{colors.background}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0 0.75rem"
    height: "2.75rem"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "{spacing.card}"
  badge-primary:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary-ink}"
    rounded: "{rounded.full}"
    padding: "0.125rem 0.625rem"
  status-stamp:
    rounded: "{rounded.md}"
    padding: "0.125rem 0.5rem"
    typography: "{typography.label}"
  band-segment-confirmed:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    padding: "0 0.5rem"
  dialog:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "{spacing.dialog}"
---

# Design System: White-Label Booking Platform

## Overview

**Creative North Star: "The Sadu Band"**

The working day is woven, not listed. Staff and resources are lanes of a Sadu weave; each booking is a dyed segment laid along the lane in reading direction (right to left in Arabic). Around that signature sits a quiet merchant console: a deep charcoal rail on the inline-start edge, a translucent top bar carrying the Gregorian and Umm al-Qura Hijri date together, and flat warm-stone surfaces where the tenant's primary acts as madder dye rather than decoration.

The system is Arabic-first and white-label. Every value in this file is the **template palette** shipped in `instance-template/instance/brand.json`; a tenant's validated brand tokens (`--brand-*`, set on `<html>`) override it at runtime, in both the light `color` and the optional `colorDark` palette. Rules here are therefore written in terms of roles (primary, rail, neutral ramp, ink), never in terms of the template's red. The neutral ramp, soft fills, inks and rail tints are derived by `color-mix` from the tenant's own text, ground and primary, so they follow any brand.

All three applications (Client, Dashboard, Platform Admin) render through one shared library on shadcn/ui patterns, Radix primitives and Tailwind CSS v4. Applications compose components and utilities; they never author component CSS and never render raw form controls. Density is operational: 44px targets, compact headings, generous rounded geometry.

**Key Characteristics:**

- Tenant brand tokens override the template palette; derived tones follow the brand automatically.
- Charcoal rail on the inline-start edge; active destination marked by fill alone.
- Schedule as woven bands: dyed segments, woven requests, struck-through cancellations.
- Triangle-tooth edge on band edges only.
- One stepped neutral ramp; flat fields with hairline lift.
- Words plus colour for every state; references as typographic anchors.
- Semantic RTL, Arabic default locale, light theme default with an optional dark palette.

## Colors

A warm-stone neutral world with one dyed accent and a small, contrast-checked dye set; the tenant supplies the actual hues.

### Primary

- **Madder** (`primary`): the tenant primary. Primary buttons, the "now" thread across the bands, the tooth edge, nav count badges, selected dates, caret and selection tint. Index 0 of the dye set, so the tenant's own colour leads the schedule.
- **Madder Wash** (`primary-soft`, 12% primary over surface): selected table rows, selected slots, `active` stamps and primary badges.
- **Madder Ink** (`primary-ink`, primary deepened 28% toward text): words set on Madder Wash.
- **Kiln Orange** (`focus`): the keyboard focus outline only.

### Secondary

- **Service Dyes** (`dye-indigo`, `dye-green`, `dye-ochre`, `dye-teal`, `dye-plum`): deep OKLCH dyes, each holding at least 4.5:1 against white text in both themes. A service keeps one dye everywhere (bands, lists, catalogue) via a deterministic hash of its id; the `ServiceDyeDot` is decorative and always sits beside the service name.

### Neutral

- **Stone Ground** (`background`): page ground.
- **Paper** (`surface`): cards, inputs, tables, popovers.
- **Charcoal Thread** (`text`): body text; in the light theme also the rail field (`rail`).
- **Ash** (`muted`): secondary text, table heads, fact labels, hour axis.
- **Selvedge** (`border-strong`): input and outline-button strokes.
- **Neutral ramp** (`neutral-1` to `neutral-4`, 3/6/11/18% text over ground): table head and hover (1), secondary buttons, tabs track, blocked segments (2), hairline borders and active presses (3), skeleton-adjacent and scrollbar thumb (4).
- **Rail Ash / Rail Weft** (`rail-muted`, `rail-accent`): resting nav text and the current/hover nav fill on the rail.
- **Status** (`success`, `warning`, `danger`): each has a soft fill (12–14%) and an ink for words on it.

The dark theme (`dark-*`) is a parallel validated palette; there the rail takes the surface colour rather than the text colour.

### Named Rules

**The Brand Overrides Rule.** The template hexes are fallbacks. Never hard-code them in a surface; reference the role token so a tenant's validated brand replaces them.

**The Derived Tone Rule.** Tints, washes, inks and rail tones are `color-mix` derivations of the tenant's text, ground and primary. Do not add a fixed grey or a second accent.

**The Ink-On-Wash Rule.** Text on a soft status fill uses that status's ink, never the raw status colour.

## Typography

**Body Font:** Inter, with Noto Sans Arabic (Arabic switches the active family to Noto Sans Arabic under `dir="rtl"`)
**Label/Mono Font:** Inter with tabular numerals for references, money, times and counts

**Character:** One humanist sans across both scripts, weighted rather than sized for hierarchy. Arabic keeps normal letter spacing; references are isolated LTR Latin.

### Hierarchy

- **Display** (700, 2.25rem rising to 3rem at md and 3.75rem at lg, 1.08–1.25): the Client landing headline only.
- **Headline** (700, 1.5rem, 1.75rem at md, tight tracking): the one `h1` per page, from `PageHeader`.
- **Title** (600, 1.125rem for section `h2`; 1rem for card and `h3` titles, 1.375): section and card headings.
- **Body** (400, 1rem, relaxed 1.625; controls drop to 0.875rem at md): running text and descriptions, page descriptions at 0.9375rem.
- **Label** (600, 0.75rem): fact labels, table heads, nav group labels, badges and stamps (stamps at 700).
- **Reference** (600, 0.875rem or 1.25rem, 0.06em tracking, tabular): booking references via `ReferenceCode`.

### Named Rules

**The No Kicker Rule.** A heading carries its own weight. No eyebrow or kicker labels above headings.

**The Isolated Reference Rule.** Booking codes, technical identifiers and Latin values inside Arabic text are bidi-isolated, LTR and tabular.

## Layout

Workspace apps (Dashboard, Platform Admin) use `AppShell`: from 64rem a two-column grid with a 16.5rem sticky rail on the inline-start edge (right in Arabic) and a flexible column; the main area is capped at 92rem with 1rem gutters (2rem from md) and a 2rem vertical rhythm between page blocks. Below 64rem the rail becomes a sheet menu opened from a ghost icon button in the 4rem sticky top bar.

Today pairs the bands with a 21rem "needs decision" column from 80rem (xl); below that they stack. Bands always render, even with no bookings; the list alternative is rendered beneath them. Band lanes have a 7.5rem label column (10rem at md) and scroll horizontally inside their own labelled region (minimum 36rem, 44rem at md). Wide tables render from md up and become stacked record cards below md, each card stating every column as label and value.

The Client app uses a top header with locale and theme controls and a single centred content column; forms cap at 40rem, reading at 70ch. All layout uses logical properties so RTL mirrors without overrides. Spacing follows a 0.25rem step: 0.5–0.75rem inside controls, 1–1.25rem inside cards, 1.5rem in dialogs, 2rem between page sections.

## Elevation & Depth

Near-flat. Depth comes from tonal layering (stone ground, paper surfaces, the charcoal rail) and hairline `neutral-3` borders. Shadows are hairline at rest and grow only for things that float.

### Shadow Vocabulary

- **Hairline** (`box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.04)`): cards.
- **Control** (`box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05)`): primary, outline, destructive and success buttons; inputs and select triggers.
- **Lift** (`box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)`): the active tab and switch thumbs. Band segments stay flat dyed fields.
- **Float** (`box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`): menus and popovers.
- **Overlay** (`box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25)`): dialogs, alert dialogs and the menu sheet.

### Named Rules

**The No Card-In-Card Rule.** A card never sits inside another card; nest with dividers, facts or lists instead.

## Shapes

Generously rounded, driven by two brand tokens: control radius (`rounded.md`, buttons, inputs, nav items, stamps, band segments, calendar days) and surface radius (`rounded.lg`, cards, tables, toolbars, empty states, the band frame). Dialogs take surface plus 0.25rem (`rounded.xl`); badges, count pills and dye dots are full pills. A tenant's radius tokens re-shape the whole system.

The Sadu signature has two textures. The **tooth edge** is a 0.375rem row of triangle teeth (0.75rem period) drawn in the primary, sitting on the top edge of the band frame. The **weave** is a −45° stripe of 22% current colour at 0.3rem, used only for not-yet-committed things: requested segments and stamps, blocked time.

### Named Rules

**The Band Edge Rule.** The tooth edge appears only on schedule band edges. Not on the rail, the header, page dividers or cards.

**The Weave Means Uncommitted Rule.** The weave texture marks requests awaiting a decision and blocked time. Committed work is a solid dye.

## Components

### Buttons

Tactile pills with firm weight.

- **Shape:** control radius (1.5rem), 2.75rem tall (2.25rem small, 3rem large; 2.75rem square icon buttons).
- **Primary:** primary fill, on-primary text, 600 weight, 0.875rem, 1rem inline padding, control shadow.
- **Hover / Focus:** hover 90% fill, active 85%; 150ms ease-out colour transitions; focus shows the 2px focus outline (offset 2px) plus a 3px half-strength ring.
- **Secondary / Outline / Ghost:** `neutral-2` fill stepping to 3 and 4; paper with a Selvedge stroke; transparent with `neutral-2` hover. Destructive, destructive-outline and success variants follow the same geometry. `loading` shows a spinner, sets `aria-busy` and blocks repeat submission. Directional icons mirror in RTL.

### Chips (Badges and Status Stamps)

- **Badge:** full pill, 0.75rem 600, tones neutral, primary, positive, warning, danger (wash plus ink), solid and outline.
- **StatusStamp:** control-radius stamp in 700 weight with a stroke. Confirmed (success wash), requested (woven, dashed warning stroke), pending (dashed), completed (neutral-2), cancelled (struck through, kept visible), failed, active. Always a word plus colour.

### Cards / Containers

- **Corner Style:** surface radius (1.75rem).
- **Background:** paper on stone ground.
- **Shadow Strategy:** Hairline (see Elevation).
- **Border:** 1px `neutral-3`.
- **Internal Padding:** 1.25rem, with 1.25rem gaps between header, content and footer. Actions sit at the card end.

### Inputs / Fields

- **Style:** paper fill, 1px Selvedge stroke, control radius, 2.75rem tall, 0.75rem padding, 1rem text (0.875rem at md), caret in primary.
- **Focus:** border shifts to the focus colour with a 3px 40% ring, plus the global focus outline.
- **Error / Disabled:** `aria-invalid` turns the stroke danger with a 25% danger ring; disabled takes the muted fill at 60% opacity.
- **Date and time:** `DatePicker` and `TimeSelect` replace native pickers; the trigger shares the input geometry and the calendar marks the selected day with a primary fill.

### Navigation

- **Rail:** charcoal field, 0.875rem 500 items at 2.75rem, `rail-muted` at rest. Hover and current share the `rail-accent` fill; current adds 600 weight and full rail-foreground text. No stripe or indicator bar. Group labels are 0.75rem 600 `rail-muted`. Count badges are primary pills at the item end. On the rail, the focus outline uses the rail's own ink.
- **Top bar:** 4rem, sticky, ground at 75–90% with a small backdrop blur, holding the dual date, live status, locale switch and theme toggle.
- **Mobile:** the rail opens as a 20rem sheet from the inline-start edge with the same list.

### Tables and Record Cards

Tables live in a surface-radius frame that scrolls inside its own labelled region; heads are 0.75rem 600 Ash on `neutral-1`; cells are tabular. Below md, the same records render as stacked cards.

### Schedule Bands (signature)

One lane per staff member or resource on a paper frame with the tooth edge on top, an hour axis on `neutral-1`, and hourly hairline gridlines that run in reading direction. Segments sit 0.5rem inside the lane at control radius: **confirmed** solid dye with white text and Lift; **completed** the same at 70% opacity; **requested** woven, dashed dye stroke, dye text; **cancelled** paper with a 40% danger stroke and struck-through text; **blocked** woven `neutral-2`. The "now" thread is a 2px primary line with a labelled legend. Linked segments rise 1px on hover. Every segment carries a full accessible description, and an ordered list alternative always renders beneath.

### Dual Date and Reference Code

`DualDate` shows the Gregorian date (600) and the Umm al-Qura Hijri date (Ash) separated by a mid-dot, with Arabic-Indic digits in Arabic. `ReferenceCode` makes the booking code the record's typographic anchor.

## Do's and Don'ts

### Do:

- **Do** reference role tokens (`primary`, `neutral-2`, `primary-ink`) so a tenant's validated brand overrides the template palette in light and dark.
- **Do** keep every interactive target at least 2.75rem (44px).
- **Do** state every status in words as well as colour; keep cancelled records visible and struck through.
- **Do** give a service one dye everywhere via its id, and pair the dye dot with the service name.
- **Do** use logical properties and mirror directional icons so Arabic RTL is the native layout.
- **Do** render wide tables as stacked record cards below md, and always render the list alternative beneath the bands.
- **Do** use `DatePicker`, `TimeSelect` and the shared controls instead of native inputs.

### Don't:

- **Don't** hard-code the template hexes in a surface; they are fallbacks for the tenant brand.
- **Don't** place the tooth edge anywhere but the band edges.
- **Don't** mark the active nav item with a stripe or bar; the fill alone marks it.
- **Don't** put eyebrows or kicker labels above headings.
- **Don't** nest a card inside a card.
- **Don't** use the weave texture for committed work.
- **Don't** author component CSS in an app or render raw `button`, `input`, `select`, `textarea`, `table`, `dialog` or native date/time pickers.
