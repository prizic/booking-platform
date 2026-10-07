# Dashboard completion verification

The Dashboard implementation and UI polish were verified locally on `feat/dashboard-completion` on 2026-10-06. All 43 local campaign gates pass. The user subsequently authorized publishing the source branch and opening a pull request for Sefi's review alongside the completed Platform Admin. No deployment or remote migration is included. Release acceptance still requires the external evidence listed below; local results do not establish GitHub CI results.

## Environment and evidence

- Node 22.22.0 and pnpm 11.25.0; contract white-label 0.1.0, configuration 3, backend range 1–1.
- Retained Supabase project `white-label-booking-platform` and booking `FJ19WGGTVR` are untouched. Fresh replay, synthetic fixtures and contention tests use `dashboard-completion-20261005` on port 55322.
- Run `rtk node scripts/verify-dashboard-completion.mjs` with the pinned Node directory and libpq directory on PATH. The ignored `.artifacts/dashboard-completion/report.json` and `report.md` record gate commands, exit codes, durations, diff identity, and affected-check reruns.
- Actual passwords are generated at runtime and stored in an ignored mode-0600 file. Live Auth/MFA tests disable screenshots, videos and traces. Persisted evidence queries are read-only.

## Human acceptance

Ahmed stated that the EN/AR visual layouts and screen-reader workflow are acceptable and instructed continuation on 2026-10-05. This is user-declared acceptance. Automated accessibility checks do not establish a VoiceOver or NVDA result.

## UI audit

The audit distinguishes measured checks from visual judgment.

- Accessibility: all 68 automated accessibility/reduced-motion checks passed on 2026-10-06, including the repaired Platform Admin targets. Keyboard focus, mobile disclosure/Escape/focus restoration, account and action errors are covered separately by component and live workflow tests.
- Performance: all three production builds and bundle leakage checks passed. No production latency benchmark or performance score is claimed. Browser acceptance limits account for local cold Next route compilation across several app processes.
- Theming: inspected the default English desktop and Arabic mobile shell, plus the warm Arabic shell. Bundled fonts, palette tokens and logical layout properties follow `DESIGN.md`. Default/warm live-page coverage is part of the dedicated acceptance project.
- Responsive behavior: native measurements found no horizontal overflow at 390 and 640 CSS pixels; Escape closed the mobile menu and returned focus to its trigger. The 640-pixel layout is a 200% zoom equivalent for a 1280-pixel window. Native browser zoom shortcuts did not alter zoom, so those shortcuts are not claimed as zoom evidence. Long-content and reduced-motion cases are recorded separately by the browser tests.
- Integrity: server-only account helpers inherit the reviewed Supabase server entry’s poison marker. Tenant membership, scoped authority, revisions, replay, immutable audit and redacted projections are checked by SQL and browser evidence; independent security review has not been performed.

Mechanical detector output is preserved in `ui-detector.log`. The decorative calendar side border was removed. The remaining Inter font heuristic is an acknowledged taste warning: Inter/Noto Sans Arabic are the existing approved, bundled typography contract. No unsupported “human-made” score is assigned.

The October 6 polish pass bounds the desktop sidebar to the viewport with independent scrolling, 44-pixel links and focus padding. Mobile navigation retains normal page scrolling. Live-update controls now share a bordered status row, and the authorized draft Brand preview reuses the established header, typography and card styles. Native T3 inspection confirmed the sidebar changed from 901 pixels tall in an 800-pixel viewport to 800 pixels with internal scrolling; Arabic mobile reflow was visually inspected at 390 pixels.

Representative native screenshots were saved under `/Users/ahmed/.t3/userdata/browser-artifacts/` and visually inspected. This local evidence is not bundled into the product:

| Surface | Screenshot filename |
| --- | --- |
| Services / editor | `browser-screenshot-localhost-muvsl0oy-4a3d46d8.png`, `browser-screenshot-localhost-muvsl200-23e20918.png` |
| Availability | `browser-screenshot-localhost-muvswjx1-8d162e9c.png` |
| Booking detail, responsive facts | `browser-screenshot-localhost-muwdgjvk-ca30c104.png` |
| Final booking detail, English desktop / Arabic mobile | `browser-screenshot-localhost-muwedpmg-1521f6eb.png`, `browser-screenshot-localhost-muweeby8-1a1d4de2.png` |
| New booking | `browser-screenshot-localhost-muwdlk08-1d33c03b.png` |
| Arabic mobile Calendar | `browser-screenshot-localhost-muwdnqwm-1ce85b32.png` |
| Arabic mobile Settings | `browser-screenshot-localhost-muwduel5-a4a00827.png` |
| Authorized saved draft preview | `browser-screenshot-localhost-muwdjm9i-41c4bace.png` |
| Communications / Integrations / Audit | `browser-screenshot-localhost-muvsl2pf-3411f7f0.png`, `browser-screenshot-localhost-muvsm0fs-a21b7145.png`, `browser-screenshot-localhost-muvsm15l-74d7e48d.png` |

The communication recovery fixture injects `synthetic_acceptance_failure` through the production attempt recorder before exercising the real retry UI. This demonstrates failed-message recovery and persisted queue state; it does not establish a Resend outcome. Queued messages no longer offer a retry that the backend would refuse.

The Realtime journey passed after correcting the invalidation validator to accept the transport UUID added by `realtime.send`. Extra customer fields remain rejected. The same journey demonstrates temporary permission-read failure hiding content, successful manual reauthorization restoring it, offline/reconnect behavior, another actor’s persisted update refreshing the specific Calendar event, and membership revocation removing protected content. The full 19-case project subsequently passed on fresh isolated fixtures in 248 seconds.

## External acceptance

Stripe onboarding/payment/refund and Resend delivery evidence require configured sandbox providers. No sandbox result is claimed from an adapter test, a queued intent, or a redirect. Provider evidence remains pending.

This campaign runs on macOS. Its intentional Dashboard screenshot changes update the Darwin references. Eight stale Client references also required replacement after inspecting the current English/Arabic desktop/mobile output: the old images predated the validated brand icon, bundled font rendering, and existing availability/catalog sections. This reference repair does not redesign the Client. Linux references are not replaced with macOS images. Linux CI and its visual-reference confirmation remain a release step. Passing local CI fixture tests does not claim a remote CI run. Independent security review has not been performed.

## Local acceptance

Fresh migration replay, all 33 pgTAP files, generated API types, unit checks, documentation, secrets, localization, the existing semantic browser suite, all three app production builds, Edge, bundle and distribution checks passed. The 36 contention assertions, six existing live booking journeys, all 19 Dashboard completion cases, 14 component cases, 68 accessibility/reduced-motion cases and all 24 visual comparisons passed. The mechanical UI audit has no blocking finding; its approved-font heuristic is recorded above.

The ignored campaign report retains failed attempts and their passing affected reruns. `persisted-references.json` records the synthetic catalog publication, invitation, Brand revisions and nine booking identifiers observed after the successful full journey. Native screenshots and user-declared acceptance are recorded separately. The runner intentionally returns nonzero while provider evidence remains pending, even though every local gate passes.
