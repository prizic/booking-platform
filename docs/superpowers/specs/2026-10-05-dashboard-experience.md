# Dashboard completion execution brief

Owner: Ahmed, with one inline implementation owner. Mode: **Operate**. Scope and acceptance are the 22 tasks in [the implementation plan](../plans/2026-10-05-dashboard-completion.md).

## Direction

Extend the existing white-label system. Semantic tokens and the validated brand definition are visual authority. Use compact page titles, contextual descriptions, labelled filters, real tables for dense records, and one consistent action vocabulary. Navigation groups are Operations, Catalog, and Administration. At narrow widths use a keyboard-operable disclosure; current section remains visible. Localized record and filter context survives language switching, while callback/preview secrets never enter locale links.

## States and acceptance

Every page covers ready, unavailable/denied, empty, pending, invalid, and stale-revision states as applicable. English/Arabic, desktop/mobile, default/warm brand, keyboard, focus, long content, and reduced motion are the acceptance matrix. Auth, provider, database, and human visual evidence are reported separately. Implementation tasks await the single final verification campaign; none are verified from source inspection alone.

## Tracking and boundaries

Issues #6–#26 are closed historical contract owners, not issues this plan closes. Their prerequisite issues are also closed. #102 owns live subscriptions. Follow-up acceptance briefs for new UI/contract work are Tasks 2–19 in the plan; remote issue publication, commits, PRs, and deployment have not been requested. Use these local briefs until publication is authorized. The current branch is `feat/dashboard-completion`.

Preserve the pre-existing automatic-port launcher, site-origin work, and root hydration fix. Retain the running local database and synthetic booking `FJ19WGGTVR`; no database reset or volume wipe. Fresh replay/concurrency require an isolated environment.

## Task status

Tasks 1–21 have implementation and authored acceptance coverage. Task 22 is active: the consolidated isolated verification campaign has passing database, concurrency, existing live, source/export/build and independent role/localization/accessibility attempts, while the complete persisted journey and affected reruns remain in progress. Ahmed authorized continuing through completion and declared EN/AR visual/screen-reader acceptance. Provider sandbox evidence remains pending. Consult the [execution checkpoint](../plans/2026-10-05-dashboard-completion-checkpoint.md) and campaign report; no release-ready claim is made.

`DESIGN.md` will describe shipped behavior after implementation; proposed values are not recorded as shipped design.
