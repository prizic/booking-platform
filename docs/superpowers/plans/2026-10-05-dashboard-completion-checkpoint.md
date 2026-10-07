# Dashboard completion — execution checkpoint

Updated 2026-10-06. Local implementation and verification are complete. The [original plan](2026-10-05-dashboard-completion.md) now awaits external release evidence; do not restart implementation or repeat passing local checks without a relevant change.

## Workspace

- Actual repository: `/Volumes/PortableSSD/Dev/E/projects/booking-platform/booking-platform`.
- Branch `feat/dashboard-completion`. The local verification below was completed before publication. On 2026-10-06, the user authorized committing and pushing all remaining source changes and opening a pull request for Sefi's review alongside the completed Platform Admin. Deployment, remote database changes and retained-stack migrations remain outside that authorization.
- One inline implementation owner. Preserve the pre-existing site-origin helpers/tests, automatic-port launcher, root-only hydration fix, app scripts and local setup edits.
- Node 22.22.0, pnpm 11.25.0; prefix every shell command with `rtk`.
- Contract: white-label 0.1.0, configuration 3, backend 1–1.

## Source progress

Tasks 1–19 have implementation across the shared shell, Auth/recovery/MFA, staff administration, bilingual catalog authoring, named scheduling, on-behalf bookings, civil-day Today/Calendar, private Realtime refetch, structured Settings/Brand and real preview, Communications, Integrations, Audit and connected record flows. Task 20’s known SQL/type/export defects are repaired. Task 21 has transaction-safe synthetic actors, consequential tests, and the consolidated campaign runner. The shipped system is recorded in `DESIGN.md`.

Task 22's local campaign is complete: all 43 local gates pass, including the complete ordered actor journey. Provider evidence and Linux CI/visual-reference confirmation remain pending; independent security review has not been performed.

## Database safety

The retained Supabase project `white-label-booking-platform` and demo booking `FJ19WGGTVR` are untouched. The retained stack is stopped. All migration replay, fixtures and contention use campaign-owned `dashboard-completion-20261005`, database port 55322. Never reset or mutate the retained stack. The runner refuses fixture/concurrency writes outside its isolated connection.

The Realtime table has a platform-managed owner. `supabase/realtime/tenant-workspace-policy.sql` is an explicit infrastructure provisioning step, separate from application migrations. The campaign installs it only on its named isolated container. It requires live tenant membership and equality between the message topic and the authorized channel topic; clients have no write policy. Hosted setup requires the table owner to apply it.

## Current evidence

Fresh replay, database lint, all 33 pgTAP files, generated types, 36 contention assertions, six existing live booking journeys, unit/type/build/bundle and export checks pass. All 19 Dashboard completion tests passed on fresh isolated fixtures on October 6, including the main persisted journey, guest/operator follow-through, real Auth recovery, role/EN-AR/default-warm/desktop-mobile cases and Realtime recovery/refetch/revocation. Final affected checks passed: all three builds, distribution, 14 component cases, 68 accessibility cases and 24 visual comparisons.

The ignored `.artifacts/dashboard-completion/report.json` and `report.md` contain individual gates, full commands, durations and attempt history. Consult them for current status; this checkpoint does not override a failed result. `docs/dashboard-completion-verification.md` holds durable scope and evidence distinctions.

Recent repairs include Auth fixture ID collisions, SVG QR URI encoding, Availability’s server/client helper boundary and mobile select width, Catalog success feedback after refresh, optional public catalog copy validation, precise denial states, Platform Admin target sizes, isolated Next caches, and export walker exclusion of generated caches. Public catalog links now lead to the actual selected booking journey.

The October 6 frontend pass adds a viewport-bounded scrolling sidebar, 44-pixel navigation targets, responsive booking fact cards, compact bilingual headings, wrapping Calendar controls, readable Settings feature labels and a styled authorized Brand draft preview. Native English and Arabic mobile inspection is recorded in the verification document. Communications now offers retry only for failed messages and retains the queued result after redirect. Recovery mail uses the campaign’s explicit Mailpit port 55324.

Current affected checks include 14 passing component cases, 68 passing accessibility cases and six passing live booking journeys. Brand rollback is verified through its new immutable revision and equivalent content. Realtime invalidations accept the UUID added by the database transport while rejecting extra private fields; failed authority reads hide content and successful reauthorization restores it. The complete 19-case acceptance run now supersedes the diagnostic subsets.

## Remaining work

- Preserve the passing 19-case real actor journey evidence; do not repeat it without an affected source change or new failure.
- Keep the completed native T3 inspection and saved screenshot paths in the final report; account setup/password screens must not be captured with secrets visible.
- Retain the completed campaign report, synthetic persisted references and historical failed attempts.
- Run Linux CI and confirm/update Linux visual references in that environment before release. Darwin references were reviewed and confirmed locally; never copy them over Linux references.
- Stripe/Resend sandbox evidence remains pending. Queued messages and adapter tests do not prove provider delivery or payment/refund success.

## Human acceptance

Ahmed declared the EN/AR visual layouts and screen-reader workflow acceptable and instructed continuation. Record this as user-declared acceptance, not an independently observed VoiceOver/NVDA result. No further approval pause is needed for authorized implementation or verification.

## Running work

Do not use saved process IDs as current ownership proof. Inspect the active session and owned listeners before stopping anything. An unrelated Next 15 application in the Maslak checkout must not be touched. The native preview uses port 41735 and `.next-completion-preview`; campaign servers use 41730/41731/41734 with distinct completion caches.
