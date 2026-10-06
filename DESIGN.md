# Dashboard workspace design

The shipped Dashboard uses an operational workspace: grouped navigation, a compact account/locale toolbar, named record tables, contextual forms and linked booking detail. Today is the entry point. Daily work, catalog/team configuration and administration are separate navigation groups. Unsupported functionality is explained at the action where it matters.

## Layout and typography

The desktop shell has a 15.5rem sticky sidebar and a flexible content column capped at 92rem. The sidebar scrolls within the viewport, with 44-pixel navigation targets and space around focused links. At 52rem the navigation becomes an explicit disclosure with normal page scrolling; at 42rem paired form columns become a single column. Logical CSS properties mirror the shell in Arabic. Long names and references wrap; wide timetables scroll inside their own labeled region and have a list alternative.

Bundled Inter, Noto Sans Arabic and Noto Naskh Arabic supply reproducible typography. Arabic headings retain normal letter spacing. Operational headings use the shared compact override; the separate brand preview keeps display typography. Dates retain explicit timezone labels, money uses locale formatting from stored minor units, and technical identifiers use bidirectional isolation.

## Tokens and components

Workspace content derives colors, fonts, spacing, borders, radii and motion from the validated brand token contract. The sidebar uses the surface token, with an accent pill identifying the active destination. Buttons, fields, badges, surfaces and live status use the shared foundation package. Status meaning is expressed in words as well as color. Operational text fields, selects, textareas and buttons have a minimum 44-pixel height; paired fields reflow without imposing a minimum page width.

Forms group related fields in labeled fieldsets. Inputs have named labels and bounded values; server results use status or alert semantics. Pending actions disable repeat interaction. Dangerous publication, rollback, access revocation and communication retry require an explicit confirmation. Revision conflicts preserve unsaved input and ask for a fresh authoritative read.

Booking details use a responsive facts panel and a wrapping row of related links. Operational headings retain compact line heights in both locales. Calendar view choices wrap as labeled radio controls; plan features and booking filters use readable bilingual labels. Communication retry is offered only for failed messages, with durable queue feedback after the action.

## Interaction and access

The menu exposes expanded state, supports Escape, and restores focus. Locale navigation preserves supported filters and record identity while removing credentials. Calendar day/week/resource/list modes share authoritative records. Realtime carries only invalidation and causes protected refetches; connection health and manual refresh remain visible.

Draft and published states are distinct. Brand preview renders the selected authorized draft, never a fallback showcase. Sensitive data is absent when the current member lacks authority. Empty results, failed reads, unavailable providers and denied access have separate messages. Human EN/AR visual and screen-reader acceptance was stated by Ahmed; automated gate and preview findings are recorded in the completion report.
