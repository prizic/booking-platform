# Dashboard Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Session override:** Execute inline with one implementation owner. This is a planning-only request. Do not start implementation, spawn agents, commit, publish issues, or deploy as part of writing this plan. The user's instruction to verify once after all tasks overrides per-task test runs and repeated review loops in the skills. Author consequential behavioral tests during implementation, then execute them in Task 22. Mark earlier tasks “implemented, awaiting final verification,” never “verified.”

**Goal:** Finish the tenant Dashboard's first-release workflows, connect every supported page through a consistent workspace, and deliver a carefully designed English/Arabic interface backed by real, authorized Supabase data.

**Execution status (2026-10-06):** Tasks 1–21 are implemented and verified locally. Task 22's local campaign is complete: all 43 local gates pass, including 19 Dashboard acceptance cases, 68 accessibility cases, 24 visual comparisons and all three production builds. The [checkpoint](2026-10-05-dashboard-completion-checkpoint.md) and [verification report](../../dashboard-completion-verification.md) are the execution record for the original checklists below. Human EN/AR and screen-reader acceptance is user-declared. Release acceptance remains pending for Stripe/Resend sandbox evidence and Linux CI/visual references; independent security review has not been performed. Changes remain uncommitted, with no deployment or remote migration.

**Architecture:** Retain Next.js Server Components, request-scoped Supabase clients, `api_v1` contracts, database-owned booking rules, and the existing white-label component/token packages. Add small client components only for forms, mobile navigation, calendar interaction, and live-update subscriptions. Extend the current visual system instead of installing another component library or inventing a separate authorization system.

**Tech Stack:** Node 22.22.0; pnpm 11.25.0; Next.js 16.3.4; React 19.2.8; TypeScript 6.0.3; Supabase CLI 2.116.0; PostgreSQL/pgTAP; Vitest; Playwright; the existing CSS and `@wlbp/ui-foundation`/`@wlbp/white-label-ui` packages.

## Global Constraints

- Root engine requirement: `>=22.13.0 <23`. Use the committed `.nvmrc`, not the currently observed Node 26 runtime.
- “Never use a Supabase service-role key, provider secret, or admin credential in Client or Dashboard code.”
- “Never implement booking, capacity, price, or eligibility correctness in the browser. It belongs in atomic database functions.”
- “Never ship an English-only user-facing string.”
- “English and Arabic are functionally equivalent; RTL is a semantic layout foundation, not a late skin.”
- “Existing bookings keep their snapshotted policy, price, tax, duration, buffers, consent text, intake schema, locale, and timezone. Later tenant edits never rewrite a booking that already exists.”
- “Runtime entitlements from the control plane override local feature configuration.”
- “WCAG 2.2 AA is a release gate, not a backlog item.”
- Prefix every shell command with `rtk`. Quote file paths containing `[locale]` or `[bookingId]` in shell commands.
- Preserve the existing automatic-port launcher and the root-only Dashboard hydration-warning fix. Do not kill Takatof or another process to obtain a port.
- Preserve the current local database and synthetic booking `FJ19WGGTVR`. No reset or volume wipe of the user's running stack.
- Run one consolidated final verification campaign. A failed check must be repaired and its affected checks repeated; this exception does not authorize routine full-suite reruns.
- Do not add dependencies unless existing packages cannot meet the need and license, maintenance, security, and bundle impact have been assessed.
- Current `platform-contract.json`: white-label `0.1.0`, config schema `3`, backend range `1–1`. Read it again at handoff; do not bump versions automatically.

---

## Scope, evidence, and delivery order

This spans several subsystems. Keep the workstreams below independently reviewable; split them into child plans when a contract-discovery task exposes a larger backend change. This master plan remains the ordered checklist, with one final verification campaign after all implementation tasks.

| Workstream | Tasks | Working deliverable | Dependencies |
| --- | --- | --- | --- |
| Product/design and navigation | 1–4 | An agreed workspace system and connected existing pages | Existing white-label foundations |
| Authentication and staff administration | 5–7 | Normal sign-in, recovery, MFA, and scoped membership administration | Tasks 1–4; confirmed Auth/role contracts |
| Catalog, scheduling, and booking operations | 8–13 | Editable catalog, usable schedules, staff-created bookings, reliable daily operations | Authentication; catalog/hold/lifecycle contracts |
| Administration and missing modules | 14–18 | Usable Settings/Brand, Communications, Integrations, Audit | Confirmed configuration/provider/audit contracts |
| Cross-surface completion | 19–21 | Consistent related-page flows, regression repairs, complete acceptance fixtures | All preceding workstreams |
| Final verification | 22 | One evidence-backed acceptance report | Every implementation task |

### Confirmed before writing this plan

- Source and live preview confirmed that the Dashboard home links Today, Calendar, Bookings, and Customers to `#nav…` anchors even though their real routes exist.
- The shared shell already has real links for Today, Calendar, Bookings, Customers, Payments, Reports, Brand, Settings, Requests, Team & Resources, and Availability.
- Team & Resources uses separate navigation; Availability lacks the shared workspace shell.
- Dashboard sign-in/recovery/MFA screens and Services/Categories/Locations editing routes are absent.
- `api_v1.create_booking_on_behalf_v1` exists; the Dashboard does not call it.
- Settings and Brand use JSON editing. Calendar/Availability contain identifier-oriented controls.
- Calendar has day/week/resource/list choices but currently renders grouped lists. Its date range starts at UTC midnight; grouping depends on a formatted string split. These need explicit civil-time and visual-view work.
- A real Client booking was persisted and appeared in the authenticated Dashboard in both locales. This proves that narrow tracer, not every staff workflow.
- Earlier database verification had failures in four pgTAP files and generated-type drift. Their causes have not all been established.
- GitHub issues #6–#26 relevant to the core features are closed. Closed status is not proof that each remaining Dashboard UI exists. New UI gaps/repairs need follow-up issue tracking before implementation; do not silently reopen or expand closed issues.
- Issue #102, Dashboard Realtime subscription, is open. Issue #101, notification Edge-function deployment, is now closed; do not repeat the older blanket claim that those entry points are unimplemented.

### First-release boundaries

Include one-to-one, exclusive-resource, and request-to-book operations; built-in roles; optional payments; Resend communications; one-way `.ics`; basic reports and CSV. Do not add two-way Google/Microsoft calendars, waitlists, recurring bookings, group-capacity UI, custom roles, SMS/WhatsApp, tenant API keys, advanced analytics, attachments, or a general page builder. Their Phase 2/separate-module issues remain outside this plan.

## Skill selection and how to use it

These paths were confirmed in the local AI Hub. A suitability judgment is not a benchmark or a claim that a skill guarantees attractive output.

| Skill | Judgment for this project | Exact use |
| --- | --- | --- |
| `writing-plans` (`/Volumes/PortableSSD/AI-Hub/skills/writing-plans/SKILL.md`) | Selected for planning | Keep file ownership, dependency order, concrete acceptance cases, and checkbox steps. Use this document; do not restart planning at every feature. |
| `ai-hub` (`/Volumes/PortableSSD/AI-Hub/skills/ai-hub/SKILL.md`) | Selected for capability discovery | Verify local catalog entries and skill files before choosing capabilities. Do not assume similarly named Supabase MCPs connect to this repository. No installation is required for this plan. |
| `executing-plans` (`/Volumes/PortableSSD/AI-Hub/skills/executing-plans/SKILL.md`) | Selected for later inline execution | Load once when implementation is authorized; maintain task status. Apply the session override above rather than automatic delegation, repeated checks, or a branch-finishing approval flow. |
| `ahmed-frontend` (`/Volumes/PortableSSD/AI-Hub/skills/ahmed-frontend/SKILL.md`) | Primary frontend workflow | Read the shared workflow once. For every feature trace interaction → validation → mutation → persisted result → refreshed dependent pages. Reuse existing components; ship EN/AR together. |
| `impeccable` (`/Volumes/PortableSSD/AI-Hub/skills/impeccable/SKILL.md`) | Primary UI/UX craft guidance | Use **Operate** mode. Read `reference/operate.md`; use incumbent tokens/components as visual authority. Load `reference/craft-floor.md` immediately before UI editing, not during planning. In Task 22 use `reference/audit.md` and run its detector once over changed markup. |
| `ahmed-supabase` (`/Volumes/PortableSSD/AI-Hub/skills/ahmed-supabase/SKILL.md`) | Required for data/auth/RPC changes | Confirm the local project identity, trace caller/grants/RLS/transaction/DTO, retain live authorization, and generate types from local `api_v1`. Use narrow central migrations only when a missing contract is demonstrated. |
| `diagnosing-bugs` (`/Volumes/PortableSSD/AI-Hub/skills/diagnosing-bugs/SKILL.md`) | Conditional repair skill | Use for the known SQL/type/fixture failures or new final-campaign failures. Reproduce the smallest failing boundary, inspect its owner, repair the cause, then rerun affected checks. Do not relax tests to hide a bug. |
| `next-best-practices` (`/Volumes/PortableSSD/AI-Hub/skills/nextjs/upstream/SKILL.md`) | Targeted framework reference | Load only the relevant routing, server/client-boundary, and data-mutation guidance. Installed Next.js docs win for this pinned version. Avoid a framework/library migration. |
| `verification-before-completion` (`/Volumes/PortableSSD/AI-Hub/skills/verification-before-completion/SKILL.md`) | Final evidence discipline | In Task 22 read complete results and exit statuses before making completion claims. Earlier tasks stay awaiting verification. Do not claim an unobserved screen-reader pass or provider delivery. |
| `design-taste-frontend` | Rejected as the Dashboard's primary guide | Its own scope excludes dashboards, dense product UI, tables, and multi-step forms. Do not apply marketing hero layouts or its decorative rules to operational screens. |
| `impeccable critique` / generic `code-review` delegation | Not scheduled | Their shipped workflows add separate assessments/agents. This plan uses one final technical/UI audit with a single implementation owner. A later explicitly authorized independent security review is separate evidence, not an invented review. |

### Impeccable context and product authority

The context command was run during planning:

```bash
rtk /Volumes/PortableSSD/AI-Hub/skills/impeccable/scripts/impeccable context --target apps/dashboard
```

It found an incumbent implementation but no `PRODUCT.md`, `DESIGN.md`, or surface brief. Existing authority is `docs/product-vision.md`, `docs/design-system.md`, tenant brand configuration, shared packages, CSS, and committed visual baselines. Missing design documents are a documentation gap, not permission to invent a new brand. For new-surface implementation, Task 1 captures the product context and direction required by Impeccable before code. This planning request does not start its `shape` interview, produce mock images, or invoke its multi-agent critique.

## Proposed visual and UX direction

**Audience and job:** tenant schedulers, location managers, staff, and administrators operating real appointments throughout the day. The first visible information should answer what needs attention, when it happens, and which action the current person can take.

**Direction:** refine the current dark-green navigation and quiet light workspace, with tenant-approved accent colors and the committed English/Arabic fonts. Typography, alignment, useful density, and reliable state changes carry the quality. Do not add purple gradients, glass panels, ornamental charts, oversized marketing headlines, navigation numbering, placeholder business claims, stock portraits, or repeated equal-sized metric cards.

| Surface | Composition and behavior |
| --- | --- |
| Workspace | Stable side navigation on desktop, compact header with page title/context, accessible mobile menu, one clear primary action where the actor can use it. Group navigation into Operations, Catalog, and Administration; labels remain bilingual. |
| Today | Operational agenda first; a compact summary of real counts only when the data source supports them. Separate arrivals, requests, payment problems, and communication problems with actionable links. |
| Calendar | Visible date range and timezone, day/week/resource/list switch, named location/staff/service filters, clear event status. Narrow screens default to useful agenda/list layouts. |
| Bookings/Customers/Catalog | Real table semantics, aligned columns, useful search/filter context, restrained row actions. Mobile shows the most important fields first with an accessible detail path. |
| Editors | Logical field groups, persistent labels, short help where a rule is unfamiliar, contextual errors, an explicit save state. Prefer inline editors or a dedicated page; use a dialog only for a contained decision. |
| Settings/Brand | Task-oriented sections instead of JSON-first editing. Explain draft versus published state and show meaningful changes before publish. Preserve advanced data that a simple editor cannot yet represent. |
| Feedback | Distinguish empty, forbidden, unconfigured, unavailable, stale, saving, and saved. Status text accompanies color. A failed read must never say there is no work. |

Use the current typography assets; do not replace Inter merely because a general anti-template checklist dislikes it. Set a disciplined rem-based UI hierarchy, logical spacing, consistent control radii, tabular numerals for money/time, and `<bdi>` for identifiers/technical text. Aim for 44px comfortable mobile controls while meeting the exact WCAG minimum everywhere. Keep motion brief and state-driven; reduced motion preserves feedback without movement.

**Visual acceptance rubric:** record evidence for hierarchy, task specificity, density, typography, consistency, bilingual layout, responsive behavior, state clarity, and keyboard access. The interface fails acceptance if any primary task is confusing, a status is misleading, a form requires a UUID from the operator, a relevant page is unreachable, Arabic loses behavior, or an important control clips at a narrow width. Screenshots and detector scores support this judgment; they do not prove that a UI looks human-made or replace Ahmed's visual acceptance.

## File ownership and interfaces

Paths below are relative to the repository root. New paths are proposed files to create, not claims that code already exists. Keep feature modules beside their route. Do not split the large existing data source simply for cleanup; add focused modules for new features and preserve its callers.

| Files | Responsibility |
| --- | --- |
| `apps/dashboard/app/_lib/workspace-shell.tsx`, new `workspace-navigation.ts`, `workspace-navigation.test.ts`, `workspace-locale-links.ts`, `workspace-locale-links.test.ts`, `workspace-mobile-menu.tsx` | Shared shell, route registry, locale-safe related links, mobile navigation |
| `apps/dashboard/app/_lib/copy.ts`, `copy.test.ts`, `app/globals.css` | Bilingual message keys and workspace presentation |
| `packages/ui-foundation/src/index.tsx`, `packages/white-label-ui/src/index.tsx`, `brand-tokens.ts` | Reusable neutral primitives and brand-token mapping, only where a missing shared primitive is demonstrated |
| `apps/dashboard/app/_lib/dashboard-server.ts`, `dashboard-access.ts`, `dashboard-data-source.ts` and existing tests | Verified request context and existing RPC integration |
| New `apps/dashboard/app/[locale]/auth/` routes and adjacent `_lib` modules | Sign-in, recovery, callback, MFA, sign-out, safe return destinations |
| Existing `apps/dashboard/app/[locale]/team-resources/`; new `staff-access.ts` beside it | Membership/invitation administration alongside existing staff/resource operations |
| New `apps/dashboard/app/[locale]/services/`, `categories/`, `locations/` | Catalog lists/editors and feature-specific data adapters |
| Existing `apps/dashboard/app/[locale]/availability/` | Named scheduling controls and authoritative schedule mutations |
| New `apps/dashboard/app/[locale]/bookings/new/` | Staff-created booking journey using existing hold/on-behalf contracts |
| Existing `today/`, `calendar/`, `bookings/`, `customers/`, `requests/`, `payments/`, `reports/` | Existing operational routes, presentation and related-page connections |
| Existing `settings/`, `brand/`, `brand-preview/` | Usable configuration editing, real preview, publish/history/rollback |
| New `communications/`, `integrations/`, `audit/` under `app/[locale]/` | Missing tenant-scoped administration modules |
| `packages/api-contracts/src/index.ts`, `index.test.ts`; `packages/supabase-client/src/database.types.ts` | DTO validation and generated `api_v1` types |
| New central migrations under `supabase/migrations/`; corresponding pgTAP tests | Only confirmed missing mutation/read contracts; never instance-owned SQL |
| New `tests/e2e/dashboard-completion.spec.ts`, `dashboard-completion-fixtures.ts`, `fixtures/dashboard-completion.sql`; `playwright.config.ts` | Synthetic role/tenant fixture and end-to-end acceptance coverage |
| New `scripts/verify-dashboard-completion.mjs`; `docs/local-setup.md`, `docs/journeys.md` | One final campaign entry point and durable operating instructions |
| New `PRODUCT.md`, `DESIGN.md`, `docs/superpowers/specs/2026-10-05-dashboard-experience.md` | Product truth and agreed Dashboard direction; preserve other applications' authority |

The following contracts are **proposed UI-local interfaces**. They do not authorize a backend operation or introduce an RPC. Backend contract discovery is explicit in Tasks 7–9, 17–18.

```ts
// apps/dashboard/app/_lib/workspace-navigation.ts
import type { Locale } from "@wlbp/i18n";

export type WorkspaceSection =
  | "today" | "calendar" | "bookings" | "customers" | "requests"
  | "services" | "categories" | "locations" | "team-resources" | "availability"
  | "payments" | "communications" | "reports" | "brand" | "integrations"
  | "settings" | "audit";

export type WorkspaceGroup = "operations" | "catalog" | "administration";

export interface WorkspaceNavigationItem {
  readonly section: WorkspaceSection;
  readonly group: WorkspaceGroup;
  readonly href: string;
  readonly label: string;
  readonly active: boolean;
}

export interface WorkspaceNavigationInput {
  readonly locale: Locale;
  readonly current: WorkspaceSection;
  readonly enabledSections: readonly WorkspaceSection[];
}
```

`enabledSections` is computed from the confirmed routes, effective configuration/entitlements, and current verified context. It is presentation input. Every route and mutation independently checks authorization. New module links enter this list only when their route actually exists.

## Task 1: Lock the execution scope, product truth, and UI direction

**Files:** Read `AGENTS.md`, `apps/dashboard/AGENTS.md`, the relevant complete knowledge packs and accepted ADRs. Create `PRODUCT.md`, `DESIGN.md`, `docs/superpowers/specs/2026-10-05-dashboard-experience.md` at execution time.

**Skills:** `executing-plans`, `ahmed-frontend`, `impeccable` Operate guidance, `ai-hub` only for unresolved capability discovery.

**Interfaces:** Consumes this plan and incumbent source/baselines. Produces one confirmed product/design brief and an issue-to-task mapping; no runtime API.

- [ ] Read the mandatory knowledge packs from `docs/README.md`; include product/release, security, architecture, design, customization, and the relevant ADRs for the task being started.
- [ ] Inspect the current branch and all existing edits with `rtk git status --short`; preserve the launcher, site-origin, and hydration changes already present.
- [ ] Read linked GitHub issue bodies and blockers. Associate new gaps with follow-up issues before implementation; prepare local acceptance briefs when publishing is not authorized. Never report this plan as closing an already-closed issue.
- [ ] Read Impeccable's `reference/init.md` and `reference/new-work.md` for the new surfaces. Capture product truth from the authoritative docs; present only unresolved product/direction choices for Ahmed's input. Preserve this plan's concrete brief rather than repeating a broad interview.
- [ ] Record Operate mode, navigation groups, page/state matrix, token authority, bilingual requirements, and the acceptance rubric in the experience spec. Record the shipped system in `DESIGN.md` after implementation; label proposed values as proposed until then.
- [ ] Load `reference/craft-floor.md` immediately before the first UI edit. Do not run a detector or visual-polish loop now.

**Acceptance evidence queued for Task 22:** every remaining requirement maps to a task; no Phase 2 feature slipped in; new surfaces have a product/direction owner.

## Task 2: Define one real route registry and safe locale links

**Files:** Create `apps/dashboard/app/_lib/workspace-navigation.ts`, `workspace-navigation.test.ts`, `workspace-locale-links.ts`, `workspace-locale-links.test.ts`; modify `copy.ts` and `copy.test.ts`.

**Skills:** `ahmed-frontend`; installed Next `link.md` and `page.md` for actual route behavior.

**Interfaces:** Consumes `WorkspaceNavigationInput` above. Produces `getWorkspaceNavigation(input): readonly WorkspaceNavigationItem[]` and `workspaceLocaleHref(locale: Locale, pathname: string, search: string): string`.

- [ ] Add bilingual navigation/group labels for the complete first-release modules; keep Team and Resources connected through the existing combined route.
- [ ] Implement registry entries from the explicit `WorkspaceSection` union. Filter against `enabledSections`; set `active` only for `current`; produce `/${locale}/${section}` destinations using localized labels.
- [ ] Implement the locale helper below. Supply only the current app pathname and supported non-secret filter query; never pass recovery codes, preview tokens, arbitrary return URLs, or another origin.

```ts
// apps/dashboard/app/_lib/workspace-locale-links.ts
import type { Locale } from "@wlbp/i18n";

export function workspaceLocaleHref(
  locale: Locale,
  pathname: string,
  search: string,
): string {
  const path = pathname.startsWith("/") && !pathname.startsWith("//")
    ? pathname
    : "/en/today";
  const withoutLocale = path.replace(/^\/(?:en|ar)(?=\/|$)/u, "");
  const query = search.startsWith("?") ? search : search === "" ? "" : `?${search}`;
  return `/${locale}${withoutLocale === "" ? "/today" : withoutLocale}${query}`;
}
```

- [ ] Author this regression test and registry cases for missing/disabled modules, active state, real routes, and Arabic labels. Queue them for Task 22.

```ts
import { describe, expect, it } from "vitest";
import { workspaceLocaleHref } from "./workspace-locale-links";

describe("workspaceLocaleHref", () => {
  it("preserves a booking detail identifier", () => {
    expect(workspaceLocaleHref("ar", "/en/bookings/booking-1", ""))
      .toBe("/ar/bookings/booking-1");
  });
  it("preserves supported calendar filters", () => {
    expect(workspaceLocaleHref("ar", "/en/calendar", "?date=2035-09-24&view=week"))
      .toBe("/ar/calendar?date=2035-09-24&view=week");
  });
  it("does not turn a protocol-relative input into an external destination", () => {
    expect(workspaceLocaleHref("en", "//example.invalid", ""))
      .toBe("/en/today");
  });
});
```

**Acceptance:** no home placeholder anchors; no advertised nonexistent modules; switching a detail page's locale retains its record identity.

## Task 3: Connect Home, Team & Resources, and Availability to the shared shell

**Files:** Modify `apps/dashboard/app/[locale]/page.tsx`, `today/page.tsx`, `team-resources/page.tsx`, `availability/page.tsx`, `apps/dashboard/app/_lib/workspace-shell.tsx`, `app/route.ts`, `tests/e2e/apps.ts` as needed for the intentional home behavior.

**Skills:** `ahmed-frontend`, `impeccable` Operate; read installed Next `redirect.md` before using redirects.

**Interfaces:** Consumes Task 2 navigation. Extends the existing `WorkspaceShell` to accept `WorkspaceSection` and supported current-path/filter context; produces one shared workspace chrome.

- [ ] Make the locale home resolve to the real Today workspace; keep `/{locale}/today` canonical. Remove the old home-only placeholder composition rather than retaining two competing operating centers.
- [ ] Use this complete home route implementation, retaining locale validation in the existing locale layout:

```tsx
// apps/dashboard/app/[locale]/page.tsx
import type { Locale } from "@wlbp/i18n";
import { redirect } from "next/navigation";

export default async function DashboardHome({
  params,
}: {
  readonly params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/today`);
}
```

- [ ] Replace Team & Resources' separate sidebar with `WorkspaceShell current="team-resources"`; preserve its access state, action forms, validation, metadata, and authorization.
- [ ] Wrap Availability in `WorkspaceShell current="availability"`; preserve the schedule workspace and its mutation owner.
- [ ] Point the brand/home and toolbar Today links to `/${locale}/today`; use Task 2's locale helper on supported routes, including booking/customer details.
- [ ] Update smoke/foundation fixture expectations for the intentional home redirect and operational heading. Queue route assertions for Home → Today, Calendar, Bookings, Customers, Team & Resources, Availability, Payments, Reports, Brand, Settings, Requests.

**Acceptance:** every existing module has the same navigation; Home reaches the real queue; active state and back/home behavior are consistent.

## Task 4: Implement the shared workspace's visual foundation and responsive behavior

**Files:** Modify `app/globals.css`, `_lib/workspace-shell.tsx`, `packages/ui-foundation/src/index.tsx` only for missing neutral primitives; create `_lib/workspace-mobile-menu.tsx` and focused tests if behavior warrants them.

**Skills:** `impeccable` Operate/craft floor; `ahmed-frontend` for semantic controls and state.

**Interfaces:** Consumes existing brand tokens and Task 2 registry. Produces shared page-header, table/form/state styling and a keyboard-operable mobile menu; no domain mutations.

- [ ] Remove ornamental `01`, `02` navigation prefixes. Add clear Operations/Catalog/Administration group headings and a single active-row treatment.
- [ ] Map Dashboard canvas/sidebar/control presentation to approved semantic tokens. Preserve tenant asset rendering and default/warm brand behavior; do not hardcode a second tenant palette.
- [ ] Establish page title, short contextual description, filter toolbar, result area, and primary-action placement. Use genuine table semantics for dense lists instead of a grid of identical cards.
- [ ] Build the mobile menu with an accessible disclosure or native dialog; include its name, expanded/open state, Escape dismissal where applicable, focus return, and navigable links. Keep the current section visible when closed.
- [ ] Apply logical layout properties and responsive structure. Keep unrelated horizontal page overflow out; allow a labelled table scroller only when the data requires it.
- [ ] Preserve visible focus and implement default/hover/focus/disabled/saving/error states consistently. Queue the mobile-menu keyboard and reflow acceptance cases for Task 22.

**Acceptance:** 390px and desktop have usable navigation, readable operational density, consistent controls, and no decorative dashboard scaffolding.

## Task 5: Add normal staff sign-in and sign-out

**Files:** Create `apps/dashboard/app/[locale]/auth/sign-in/page.tsx`, `auth/sign-in/actions.ts`, `auth/sign-out/route.ts`, `apps/dashboard/app/_lib/auth-server.ts`, `auth-return-path.ts`, `auth-return-path.test.ts`; modify existing access-state presentation and `workspace-shell.tsx`.

**Skills:** `ahmed-frontend`, `ahmed-supabase`, relevant Next auth/cookies/server-actions docs. Read current official Supabase Auth guidance if the installed API is uncertain.

**Interfaces:** Existing `createRequestScopedSupabaseClient` has writable `setAll` support. A new auth-only writable helper uses that client; read-only workspace loaders remain read-only. Protected requests still use `getClaims`/verified identity and current database context.

- [ ] Define a local return-path allowlist for Dashboard workspace paths. Reject external URLs, `//`, Auth callback destinations, encoded path traversal, and malformed locale; default to `/${locale}/today`.
- [ ] Add EN/AR labelled email/password controls, password-manager autocomplete, field errors, pending state, and a generic invalid-credentials message. Do not add public tenant registration.
- [ ] Use the user's request-scoped publishable client with `auth.signInWithPassword({ email, password })`; apply returned cookies through the supported writable adapter. Never place an admin key in this path.
- [ ] Redirect only to the normalized local return path after successful sign-in. Verified identity without an active membership must enter the existing denied/selection state rather than gaining access.
- [ ] Implement POST sign-out using `auth.signOut`; clear/update session cookies and private cache headers, then return to localized sign-in. Add a real sign-in link to unauthenticated workspace states.
- [ ] Queue tests for correct/incorrect credentials, no membership, revoked membership, open redirects, cross-tenant hosts, logout, and refreshing after logout.

**Acceptance:** staff can enter and leave the Dashboard through the website without the temporary local session bootstrap.

## Task 6: Add account recovery and MFA/step-up UX

**Files:** Create localized `auth/recover/page.tsx`, `auth/recover/actions.ts`, `auth/update-password/page.tsx`, `auth/update-password/actions.ts`, `auth/mfa/page.tsx`, `auth/mfa/mfa-form.tsx`; create `apps/dashboard/app/auth/callback/route.ts`; extend Auth copy and tests.

**Skills:** `ahmed-supabase`, `ahmed-frontend`; Impeccable form/state guidance.

**Interfaces:** Supabase owns recovery, code exchange, and factors. Existing `packages/auth/src/index.ts` owns `hasRecentAal2`; backend-sensitive actions retain their own step-up checks.

- [ ] Trace the installed Supabase recovery callback contract and committed Auth redirect settings; select one supported flow and document its exact callback inputs in the task brief before code.
- [ ] Use `auth.resetPasswordForEmail` with a trusted same-app callback origin; return the same localized confirmation for registered and unknown addresses.
- [ ] Exchange the supported callback code/token through Supabase; consume it once; strip it before navigating to the password-update screen. Do not retain secrets in locale links, analytics, screenshots, or browser history beyond the provider-required callback.
- [ ] Update the password through `auth.updateUser` only for a valid recovery session; handle expired/used links with a clear restart action.
- [ ] Implement enrollment, challenge/verification, and safe factor removal using installed `auth.mfa` APIs. Show the QR/secret only to the authenticated owner of the factor; never log it.
- [ ] Route sensitive-action step-up refusals to the MFA/re-authentication screen and return to the safe original task. Reattempt the authoritative action after verification; do not infer authority from the visible success message.
- [ ] Queue recovery replay/expiry, wrong OTP, AAL1 refusal, successful AAL2, stale step-up, and callback-return abuse cases.

**Acceptance:** recovery and MFA are real provider flows; account existence and secret material are not exposed; sensitive operations still refuse insufficient assurance.

## Task 7: Confirm and implement staff invitation, built-in role, and location administration

**Files:** Inspect `supabase/migrations/20260905043355_tenant_identity_and_isolation.sql`, `20260906090000_staff_and_resources.sql`, `20260919120000_reminders_alerts_and_auth_mail.sql`, `docs/adr/0007-roles-and-capabilities.md`. Modify `team-resources/page.tsx` and adjacent `actions.ts`; create `team-resources/staff-access.ts`, `staff-access.test.ts`. Add a central migration and pgTAP file only if the narrow contract is absent.

**Skills:** `ahmed-supabase` first; `ahmed-frontend` for forms; `diagnosing-bugs` only for reproduced failures.

**Interfaces:** Membership and staff profile are distinct. Auth invitation delivery is a controlled platform operation; Dashboard never calls a service-role Admin API.

- [ ] Inventory the existing invitation lifecycle, role rows, membership/location mutators, Auth mail hooks, grants, and audit events. Record which are actually callable with the member's client. Do not infer invitation administration from the existence of an invitation table.
- [ ] Refine any missing contract into an exact central implementation subtask before changing SQL: authenticated caller, existing role/capability owner, allowed location scope, request shape, idempotency/revision rule, returned DTO, audit fields, and denial cases. Do not invent a `membership.manage` capability outside the accepted role contract.
- [ ] Add an invitation panel showing email, a built-in role, assigned named locations, pending/accepted/expired/revoked status, and explicit resend/revoke actions if the confirmed contract permits them.
- [ ] Add membership role/location editing and revocation using the confirmed server contract. Recheck caller and target scope at mutation time; preserve the owner-transfer/last-owner safety rule from the authoritative model.
- [ ] Keep staff-profile/resource deactivation's future-allocation resolution separate from removing login access. Explain their different consequences in both locales.
- [ ] Queue tenant admin success, location-manager scope, staff denial, revoked caller, cross-tenant target, invitation replay/expiry, and future-allocation behavior.

**Acceptance:** an authorized administrator can grant/revoke real built-in access safely; staff identities are selected by name rather than typed membership UUIDs.

## Task 8: Establish the missing catalog authoring contract

**Files:** Inspect `supabase/migrations/20260905200306_catalog_publication_and_management.sql`, `catalog_test.sql`, `tenant_rls_matrix_test.sql`, `packages/api-contracts/src/index.ts`. Add focused catalog DTO/parser code and tests; add a central catalog-authoring migration only after discovery demonstrates the gap.

**Skills:** `ahmed-supabase`; `ahmed-frontend` for consuming DTO requirements.

**Interfaces:** Existing `get_public_catalog_v1` and `publish_catalog_v1` are confirmed. A public catalog read is not a Dashboard draft read. Missing draft/read/save/retire operations require narrow authorized contracts.

- [ ] Trace how the existing revision tables, service/location links, drafts, publication hashes, and `catalog.edit`/location restrictions work. Inventory actual CRUD entry points and identify missing ones.
- [ ] Define an explicit draft DTO containing bilingual identity/content, service/location/category identifiers, revision, editable fields, and publishing state. Reuse domain enums and money/time types; do not introduce a second booking-type system.
- [ ] For each absent operation, write its precise actor/input/output/transaction/grant specification and positive/negative cases, then refine into a concrete SQL subtask. Harden helper search paths and keep privileged helpers unexposed.
- [ ] Make save/publish/retire return authoritative revision/state. Publish validates complete locale content, policy/intake references, assignment requirements, capacity-one first-release restrictions, currency/minor units, and required legal references.
- [ ] Add pgTAP coverage for draft invisibility to anonymous users, cross-tenant/location refusal, stale revisions, invalid reference links, publication visibility, and unchanged historical booking snapshots.
- [ ] Regenerate only local `api_v1` types after the contract changes; queue type-drift verification for Task 22.

**Acceptance:** the UI has a real, narrow draft-management contract; publication and snapshots remain database-owned.

## Task 9: Build Services, Categories, and Locations editing pages

**Files:** Create `apps/dashboard/app/[locale]/services/page.tsx`, `services/[serviceId]/page.tsx`, `services/actions.ts`, `services/catalog-data-source.ts`, `services/catalog-forms.tsx`; create equivalent focused `categories/page.tsx`, `categories/actions.ts`, `locations/page.tsx`, `locations/[locationId]/page.tsx`, `locations/actions.ts`. Extend copy/navigation and Task 8 tests.

**Skills:** `ahmed-frontend`, `impeccable` Operate form/table guidance; `ahmed-supabase` for contract consumption.

**Interfaces:** Consumes the confirmed Task 8 catalog DTOs and mutations. Produces real route destinations and published offerings for Client/booking/scheduling consumers.

- [ ] Build scoped catalog lists with search, draft/published/retired status, named category/location filters, and explicit edit/create destinations.
- [ ] Build service identity/content fields for EN/AR; group duration/buffers, money/tax/payment mode, approval/assignment mode, eligibility/resource requirements, intake, and policy references by operator task.
- [ ] Parse displayed decimal money into integer minor units using the existing currency contract; reject ambiguous/excess precision rather than silently rounding. Display the database-returned authoritative amount after save.
- [ ] Provide category editing/reordering and location name/address/IANA timezone editing. Use named selectors for all relations; show timezone next to schedule consequences.
- [ ] Add save-draft, preview, publish, and retire controls with current permission/revision requirements. Show validation per field and the publication result; expose no draft data through the public Client.
- [ ] Connect Services/Categories/Locations in the shared navigation only after their routes exist. Preserve old booking snapshots when changing a published service.

**Acceptance:** an authorized operator can create/localize/publish a service and location, and a guest can subsequently book only the published result.

## Task 10: Replace identifier-based Availability forms with usable scheduling tools

**Files:** Modify `apps/dashboard/app/[locale]/availability/page.tsx`, `apps/dashboard/app/[locale]/actions.ts` (the existing `saveSchedule` owner), `apps/dashboard/app/_lib/dashboard-data-source.ts`, and `apps/dashboard/app/_lib/copy.ts`; create `apps/dashboard/app/[locale]/availability/schedule-form.tsx`, `apps/dashboard/app/[locale]/availability/schedule-fields.ts`, `apps/dashboard/app/[locale]/availability/schedule-fields.test.ts`.

**Skills:** `ahmed-frontend`, `impeccable` Operate; `ahmed-supabase` for existing schedule contracts. Read ADRs 0016/0017.

**Interfaces:** Consumes the existing schedule workspace/save contract and Task 9 choices. Produces the same authorized schedule operations and revisions; adds no browser-owned availability algorithm.

- [ ] Replace raw scope/location/staff/resource/service UUID inputs with permitted named selections from real workspace data.
- [ ] Separate weekly hours/breaks, date overrides/time off, blackouts/resource maintenance, and policy settings into recognizable sections. Ask only for fields relevant to the chosen operation/scope.
- [ ] Use human time controls and show the IANA timezone. Convert civil-time inputs through the existing i18n/time helpers; reject impossible DST times and require a supported disambiguation for repeated times.
- [ ] Display existing schedules and revisions with edit/remove controls. Explain whether a change affects future availability; never imply that it rewrites a booked appointment.
- [ ] Map stale-revision responses to reload/review recovery, preserving unsaved values. Refetch the workspace after a committed change and refresh dependent choices/availability.
- [ ] Queue weekly/break/exception/time-off/blackout/maintenance cases, DST gap/overlap, boundary values, scope denial, and conflict recovery.

**Acceptance:** operators can configure schedules without looking up identifiers; Client slots reflect the persisted schedule.

## Task 11: Add the staff-created booking journey

**Files:** Create `apps/dashboard/app/[locale]/bookings/new/page.tsx`, `new/booking-form.tsx`, `new/actions.ts`, `new/on-behalf-data-source.ts`, `new/on-behalf-data-source.test.ts`; modify Bookings/Calendar/Today primary-action links and copy.

**Skills:** `ahmed-frontend`, `ahmed-supabase`, `impeccable` multi-step form/state guidance.

**Interfaces:** Consumes real catalog choices, `get_availability_v1`, `create_hold_v1`, the authoritative held form, and the confirmed `create_booking_on_behalf_v1` below.

```sql
api_v1.create_booking_on_behalf_v1(
  p_tenant_id uuid, p_hostname text, p_hold_id uuid,
  p_session_token text, p_idempotency_key text, p_contact jsonb,
  p_consent_version text, p_locale text default 'en',
  p_intake jsonb default '{}'::jsonb,
  p_customer_time_zone text default null, p_request_id uuid default null
)
-- Returns contract_version, booking_id, public_reference, status,
-- approval_status, starts_at, ends_at, booking_revision, replayed.
```

- [ ] Read the private on-behalf implementation and existing Client hold/form flow; confirm staff capability, routing hostname, session binding, consent evidence, and current handling of paid/request services.
- [ ] Build the ordered flow: customer/contact → service/location/assignment → date/available time → hold → intake/policy/price review → confirm. Let the database choose eligibility, price, and actual allocation.
- [ ] Keep the hold-session token and idempotency key stable across a retry; keep secret tokens out of URLs/logs. Show hold expiry and a recovery action instead of confirming an expired selection.
- [ ] Call the confirmed RPC through the member's request-scoped client. Parse its actual returned contract, then navigate to the saved booking detail using `booking_id`.
- [ ] Support only modes proven by the on-behalf contract. For a paid/request mode requiring an additional authoritative path, refine that specific gap into a contract subtask; do not fake payment success or silently bypass approval.
- [ ] Queue normal creation, duplicate submit/replay, lost slot, expired hold, revoked permission, cross-location denial, incomplete intake/consent, and provider-degraded outcomes.

**Acceptance:** staff-created booking appears in Today/Calendar/Bookings/Customer history with one allocation, one immutable event sequence, and correct outbox/snapshot behavior.

## Task 12: Complete the Today and Calendar operating experience

**Files:** Modify `today/page.tsx`, `calendar/page.tsx`, their copy; create `calendar/calendar-range.ts`, `calendar-range.test.ts`, `calendar-view.tsx`, `calendar-filters.tsx`; extend existing DTO/read contracts only for confirmed missing safe fields.

**Skills:** `ahmed-frontend`, `impeccable` Operate; `ahmed-supabase` if range/query contracts change.

**Interfaces:** Existing `get_today_workspace_v1` and `list_calendar_v1` remain authoritative reads. New `calendarRange` resolves selected civil dates and IANA timezone using existing time utilities; it does not allocate bookings.

- [ ] Replace UTC-midnight and fixed-24-hour day assumptions with civil-day boundaries in the selected location/workspace timezone. Define the Today window and visible date explicitly; do not call a rolling next-24-hours queue “today” without explanation.
- [ ] Group dates using a stable civil-date key, not `formatDateTime(...).split(",")`. Keep formatting solely for display.
- [ ] Replace identifier filters with named scoped choices. Retain filters across view and locale changes; normalize malformed date/view/identifier input without throwing a page error.
- [ ] Implement distinct day/week/resource visual presentations with the same authoritative rows and an always-available list alternative. Confirm whether resource allocation fields exist; never relabel a staff-only grouping as a room/resource calendar.
- [ ] Link event actions to their existing owner screens: detail/lifecycle, request decision, payment exception, communication retry, and Availability block editing.
- [ ] If drag-reschedule is included by the accepted issue scope, make it a progressive enhancement calling the existing reschedule action with revision/policy review. The keyboard form remains complete and uses the same contract.
- [ ] Queue DST boundaries, invalid dates, long Arabic names, overlapping event display, denied location filters, list/grid parity, stale edits, and no-data versus failed-read states.

**Acceptance:** Today represents an understood date/window; each calendar mode earns its label; all daily actions remain operable without dragging or color interpretation.

## Task 13: Add trustworthy live updates under issue #102

**Files:** Create `apps/dashboard/app/_lib/workspace-live-updates.tsx`, `workspace-live-events.ts`, `workspace-live-events.test.ts`; connect authorized Today/Calendar/booking views; inspect the existing broadcast migration/policies and `supabase/config.toml`.

**Skills:** `ahmed-frontend`, `ahmed-supabase`.

**Interfaces:** Existing private `tenant:<id>` broadcast and the member's own browser session. Events trigger authoritative server refetch; event payloads never become displayed booking data.

- [ ] Read #102 and the existing topic policy/trigger. Use `createBrowserSupabaseClient` with public configuration and the current user session; never substitute a worker identity.
- [ ] Subscribe once per current tenant; remove the channel on tenant change/unmount. Coalesce burst notifications, and use `router.refresh()` to obtain fresh authorized server data.
- [ ] Treat duplicate/out-of-order events as invalidation hints; do not decrement revisions or patch booking state directly from messages.
- [ ] Display connected/disconnected/reconnecting/refused state with a manual refresh option. On reconnection refresh once; on denied subscription discard protected state and recheck access.
- [ ] Make Realtime-disabled/unavailable local configuration a visible degraded state. Enabling its container is a diagnosed local infrastructure task, not an unconditional change to the running database.
- [ ] Queue connected, duplicate, delayed/out-of-order, reconnect, and revoked/unauthorized-topic cases. If an end-to-end connection cannot be established, report #102 unverified rather than passing mock tests as proof.

**Acceptance:** another permitted staff change refetches the current page; loss of Realtime never presents a false confirmation or blocks manual operation.

## Task 14: Replace Settings JSON editing with structured, lossless forms

**Files:** Modify `apps/dashboard/app/[locale]/settings/page.tsx`, `apps/dashboard/app/[locale]/settings/actions.ts`, `apps/dashboard/app/[locale]/settings/results.ts`; create `apps/dashboard/app/[locale]/settings/settings-fields.ts`, `apps/dashboard/app/[locale]/settings/settings-fields.test.ts`, `apps/dashboard/app/[locale]/settings/settings-form.tsx`; reuse `packages/config/src/index.ts` validators.

**Skills:** `ahmed-frontend`, `impeccable` forms/clarity; `ahmed-supabase` for current settings/entitlement contract.

**Interfaces:** Existing `getTenantConfiguration`, `saveTenantSettings` and their RPCs. The save request carries `expectedRevision`; runtime entitlements remain read-only authority.

- [ ] Inventory accepted settings keys and bounds in SQL/config. Map only supported keys into sections for booking rules, locale/timezone, money/tax where editable, communications, navigation, and enabled features.
- [ ] Replace default JSON textareas with labelled controls, named selections, clear units, and server-derived entitlement status. Show an unavailable entitlement as unavailable, not as a toggle that appears to unlock it.
- [ ] Preserve unknown/unrepresented values from the loaded document during section edits. Reject malformed documents rather than overwriting them with an empty object.
- [ ] Pass the full merged document and expected revision to the existing mutation. Show changed sections and saved revision, and retain values on stale-revision errors.
- [ ] Validate navigation against approved, implemented routes and complete EN/AR labels. Preserve required recovery/auth paths and effective entitlement restrictions.
- [ ] Queue lossless round-trip, invalid bounds, stale revision, unsupported version, unsafe link, missing locale, entitlement escalation, and cross-tenant cases.

**Acceptance:** ordinary configuration requires no JSON editing; edits cannot grant authority or discard unrelated saved configuration.

## Task 15: Turn Brand into a real editing, preview, and publishing workflow

**Files:** Modify `apps/dashboard/app/[locale]/brand/page.tsx`, `apps/dashboard/app/[locale]/brand/actions.ts`, `apps/dashboard/app/[locale]/brand/results.ts`, `apps/dashboard/app/[locale]/brand-preview/page.tsx`; create `apps/dashboard/app/[locale]/brand/brand-form.tsx`, `apps/dashboard/app/[locale]/brand/brand-fields.ts`, `apps/dashboard/app/[locale]/brand/brand-fields.test.ts`; reuse existing brand validators/asset contracts.

**Skills:** `ahmed-frontend`, `impeccable` Operate; `ahmed-supabase` and existing white-label validators.

**Interfaces:** Existing draft-save, revision history, content hash, publish, rollback, preview-token, and presentation methods. Static foundation showcase and real draft preview are distinct modes.

- [ ] Build structured identity/contact, semantic colors, supported fonts, content/locale/legal links, and supported asset controls. Do not add arbitrary CSS, scripts, executable markup, or unsupported image types.
- [ ] Confirm the platform-owned validated PNG upload/materialization contract. If no upload endpoint exists, refine that gap before adding upload UI; never expose privileged Storage or write unsafe browser files.
- [ ] Provide visible draft/published states and a meaningful diff for content/token changes. Preserve advanced fields during simple editor saves.
- [ ] Wire preview to the issued, scoped, expiring preview context; ensure it actually loads the draft revision instead of merely reopening the static `brand-preview` showcase.
- [ ] Block publish for invalid contrast, assets, incomplete locales/legal identity, stale content hash, or unsafe content. Show actionable bilingual errors.
- [ ] Keep history and explicit rollback; refetch the authoritative revision after publish/rollback. Verify Client/Dashboard/email presentation consumers receive the intended revision; document any startup materialization/redeploy requirement honestly.
- [ ] Queue preview expiry/cross-tenant misuse, invalid tokens/assets/content, stale-hash publish, rollback, and historical booking snapshot retention.

**Acceptance:** Brand navigation reaches the editor; preview reflects the saved draft; publication produces the recorded revision without promising unsupported instant asset deployment.

## Task 16: Build Communications around actual delivery health and retry behavior

**Files:** Create `communications/page.tsx`, `communications/actions.ts`, `communications/communications-data-source.ts`; modify Payments' delivery-health placement and related booking links; reuse notification/reminder migrations and email contracts.

**Skills:** `ahmed-frontend`, `impeccable` status/recovery; `ahmed-supabase` for safe DTOs and retry authority.

**Interfaces:** Confirmed `get_delivery_health_v1`, existing `getDeliveryHealth` and `resendBookingNotification` methods. Any per-message list/template/preferences contract must be inventoried before adding a screen control.

- [ ] Move the operational delivery-health presentation into Communications; retain a relevant cross-link from Payments instead of duplicating state logic.
- [ ] Show real queued/delivered/failed/suppressed health supported by the returned DTO, last-known freshness, and related booking destinations. Do not claim delivery from a queued job.
- [ ] Add permitted booking-email retry through the existing action, with confirmation/pending/result states. Respect suppression, event uniqueness, provider classification, and actor scope.
- [ ] Add template/settings links only where their preview/edit contracts exist. For absent per-message data, define a privacy-minimized read subtask rather than exposing outbox/provider payload tables.
- [ ] Verify current #101 implementation boundaries from source. Separate local inbucket observation, unit-tested adapter behavior, and a real Resend delivery test requiring sandbox credentials.
- [ ] Queue failed retry, duplicated retry, suppressed customer, cross-tenant reference, delayed worker, and no-provider-credentials states.

**Acceptance:** operators can distinguish a booking problem from an email problem and use an authorized recovery path without seeing raw provider data.

## Task 17: Build Integrations without exposing credentials or Phase 2 controls

**Files:** Create `integrations/page.tsx`, `integrations/actions.ts`, `integrations/integration-data-source.ts`; inspect `20260905213000_commerce_provider_contract.sql`, `packages/integrations/src/index.ts`, `stripe.ts`, related protected worker endpoints.

**Skills:** `ahmed-supabase`, `ahmed-frontend`, `impeccable` high-stakes state/clarity.

**Interfaces:** Confirmed `api_v1.get_payment_account_status_v1(p_tenant_id uuid)`. The server/worker provider adapter owns onboarding and credentials; the Dashboard consumes safe status and authorized redirect results.

- [ ] Inventory callable payment account status/onboarding/resume endpoints, communication readiness, domain-readiness ownership, and required recent AAL2. Do not assume an adapter method is already a public Dashboard endpoint.
- [ ] Refine any missing onboarding/resume endpoint into a specific platform-side subtask with tenant/account mapping, `integration.manage`, step-up, safe return origin, provider failure handling, and redacted audit evidence.
- [ ] Show actual connected/requirements-due/restricted/suspended/disconnected/error states and their supported next actions. Display only safe requirements and references.
- [ ] Use authorized provider-hosted onboarding; verify the provider result through the authoritative status read on return. A successful redirect alone is not a connected account.
- [ ] Show Resend readiness and one-way `.ics` behavior accurately. Omit two-way calendar connect buttons and secret-key fields; custom-domain management links must point to its actual owning interface.
- [ ] Queue insufficient MFA, cross-tenant account mapping, unsafe return URLs, restricted account, retryable provider failure, and credential/bundle leakage cases.

**Acceptance:** integrations show trustworthy readiness and recovery; no private provider SDK/secret enters distributable app code.

## Task 18: Build a tenant-safe Audit page

**Files:** Create `audit/page.tsx`, `audit/audit-data-source.ts`, `audit/audit-filters.ts`; inspect `list_settings_events_v1`, booking events, staff/resource audit records, brand history, security/privacy ADRs. Add a narrow central read migration and tests only for missing event streams.

**Skills:** `ahmed-supabase`, `ahmed-frontend`, `impeccable` data-table guidance.

**Interfaces:** Existing `audit.read` capability and immutable event owners. Audit is a read-only projection, not another editable log or a public raw-event endpoint.

- [ ] Inventory accessible event sources and their permission/redaction rules. Define a normalized safe display DTO containing time, actor/effective actor, action, target reference, outcome, correlation reference, and redacted change summary where permitted.
- [ ] For unavailable streams, define the exact narrow read contract, bounded date/action/actor filters, pagination, tenant/location restriction, and audit-redaction cases before SQL changes.
- [ ] Build a table with named filters, chronological ordering, clear outcomes, and links to permitted subject details. Use stable cursor/pagination semantics for long histories.
- [ ] Exclude secrets, raw note/intake text, authorization headers, provider payloads, and hidden customer fields from all cells, downloaded data, and errors.
- [ ] Queue allowed admin read, no-capability denial, cross-tenant/location refusal, immutable events, redacted sensitive changes, and stable pagination.

**Acceptance:** permitted operators can understand who changed what and its outcome without receiving sensitive source data or editing history.

## Task 19: Complete related-page flows and refresh behavior on existing modules

**Files:** Modify existing `bookings/page.tsx`, `bookings/[bookingId]/page.tsx`, `customers/page.tsx`, `customers/[customerId]/page.tsx`, `requests/page.tsx`, `payments/page.tsx`, `reports/page.tsx` and their adjacent action modules; extend safe DTOs only where a real detail identifier is missing.

**Skills:** `ahmed-frontend`, `impeccable` Operate; `ahmed-supabase` for permitted related identifiers and refresh semantics.

**Interfaces:** Existing booking/customer/request/refund/report actions remain owners. Related links require returned, permitted IDs; never infer a customer identity from a visible name/email.

- [ ] Connect Customer history → booking detail; booking detail → permitted Customer, Payments, Communications, and history; Requests → saved decision/booking; Calendar/Today → the appropriate action owner.
- [ ] Retain current locale, supported filters, and back-to-list context. Ensure unavailable related data is a clear text state rather than a broken link.
- [ ] Replace remaining routine UUID entry controls in Payments/Reports/Requests with named, scoped choices when the current contract supports them. Keep reference entry only when it is an intentional search function.
- [ ] Refetch affected Today/Calendar/Bookings/Customer/Payments/Reports state after committed lifecycle, request, refund, note, privacy, or configuration actions. Keep idempotency/revision/step-up logic in the existing owners.
- [ ] Localize raw machine statuses and errors through message keys. Maintain separate booking/payment/refund/notification states; do not collapse them into a misleading “complete” badge.
- [ ] Queue lifecycle check-in/complete/no-show/correction, reschedule/cancel, request decision/proposal, refund exception, customer privacy/PII restrictions, and CSV formula-injection/authorization behavior.

**Acceptance:** the operator completes the journey through connected screens; records and visible dependent pages agree after each committed action.

## Task 20: Prepare bounded repairs for known database/type/fixture failures

**Files:** Inspect/conditionally modify `supabase/tests/database/control_plane_test.sql`, `provisioning_test.sql`, `tenant_schema_contract_test.sql`, `reschedule_cancel_test.sql`; inspect relevant September 30 operator/worker migrations and `20260911120000_reschedule_and_cancel.sql`; modify `database.types.ts` through the generator only. Inspect `scripts/check-ci-fixtures.mjs` and exported test dependencies for the known fixture-resolution failure.

**Skills:** `diagnosing-bugs`, `ahmed-supabase`; `verification-before-completion` in the final campaign.

**Interfaces:** Existing security/mutation contracts are rule owners. Historical failures are evidence for investigation, not established root causes.

- [ ] Read the retained local verification reports and exact failing assertions. Inspect source/grants/security contexts without rerunning the whole suite during implementation.
- [ ] For the three blanket routine/grant/security-definer assertions, reconcile the accepted exposure policy with actual hardened operator/worker wrappers. Replace an obsolete blanket assertion only with precise permitted-inventory and forbidden-caller tests; never blanket-allow exposed definer routines.
- [ ] For guest cancellation near the cutoff and subsequent revision conflict, inspect snapshotted policy, statement/transaction clock semantics, fixture timestamps, and revision transitions. Prepare a minimal boundary reproduction for Task 22; do not assume that changing the expected exception is the fix.
- [ ] When the cause is demonstrated, refine that repair into a concrete task containing the failing input, actual/expected result, owning function, bounded source change, and regression assertion before applying it.
- [ ] Regenerate `database.types.ts` from the current migrated local `api_v1`; retain generator formatting and inspect the semantic diff. Do not hand-edit generated types or dismiss drift as formatting.
- [ ] Inspect the exported fixture's workspace/dependency closure and fix its Playwright-resolution cause in the correct export/test owner. Do not remove the fixture gate to make the campaign green.

**Acceptance:** Task 22 must resolve each known failure or identify its exact remaining blocker; an old failure is never silently excused from completion.

## Task 21: Author one complete acceptance matrix and campaign entry point

**Files:** Create `tests/e2e/dashboard-completion.spec.ts`, `dashboard-completion-fixtures.ts`, `fixtures/dashboard-completion.sql`, `scripts/verify-dashboard-completion.mjs`; modify `playwright.config.ts`, `tests/e2e/accessibility.spec.ts`, `localization.spec.ts`, `visual.spec.ts`, `docs/journeys.md`, `docs/local-setup.md`.

**Skills:** `ahmed-frontend`, `ahmed-supabase`, `verification-before-completion`; Impeccable's audit dimensions inform coverage.

**Interfaces:** Synthetic tenant/role fixtures and real Auth sessions → browser → route/action/RPC → persisted SQL state → dependent page. Existing stub journeys remain unit/component evidence; they do not substitute for the live path.

- [ ] Add transaction-safe pgTAP fixtures for new contracts and a separate synthetic browser fixture with admin, scheduler, staff, location manager, revoked member, second tenant, named catalog, schedules, and exclusive resource. Generate local passwords at runtime; store only in ignored mode-0600 files.
- [ ] Use normal Auth sign-in in browser tests. Setup may use local test infrastructure authority, but all acceptance operations run as the actual actor with the public client.
- [ ] Register a dedicated `dashboard-completion` Playwright project matching `dashboard-completion.spec.ts`; do not rely on the existing regex that only includes booking/smoke/foundation files. Keep live screenshot/trace policy explicit because Auth/MFA can expose secrets.
- [ ] Write each acceptance case using the journey table below: unique synthetic reference, actual UI fields, authoritative result identifier, persisted-state assertion, and a related-page assertion. Reuse a retry's idempotency key; use fresh fixture entities for an independent journey.
- [ ] Extend EN/AR, default/warm brand, mobile/desktop, reduced motion, keyboard, field-error, and overflow coverage across representative new and existing pages. Update baselines only for an intentional, reviewed visual change.
- [ ] Create a campaign runner that invokes the ordered gates below, records each exit status and duration, continues independent gates after a failure, skips dependent gates with an explicit reason, and returns nonzero for failure or a required unverified gate. Use child-process argument arrays and existing scripts; do not shell-interpolate credentials.
- [ ] Record one report under ignored `.artifacts/dashboard-completion/` with environment identity, revision/diff identity, contract versions, commands/results, actor journeys, screenshot references, detector findings/false positives, provider limits, and pending human evidence. Redact credentials, Auth callback material, customer data, and provider payloads.

**Acceptance:** the single campaign command covers the finished feature and cannot report green while omitting a required failing/unsupported gate.

### Ordered live acceptance journey

| Step | Actor / actual screen | Input and action | Persisted result / observable evidence |
| --- | --- | --- | --- |
| 1 | Anonymous → `/{locale}/auth/sign-in` | Sign in as a synthetic active administrator | Valid session; current tenant context; unauthorized tenant still denied |
| 2 | Admin → `services`, `categories`, `locations` | Create bilingual category/service/location; save draft; publish | Revision/publication recorded; draft hidden from anonymous; Client sees only published content |
| 3 | Admin → `team-resources` | Invite staff; assign built-in role/location; edit eligibility; create capacity-one resource | Invitation/membership/eligibility/resource rows and redacted audit; staff scope enforced |
| 4 | Scheduler/admin → `availability` | Add weekly hours, break, exception, blackout/maintenance | Schedule revision committed; availability excludes blocked times |
| 5 | Guest → Client booking route | Book an available no-payment service with synthetic contact/intake/consent | One confirmed booking/allocation/event/outbox; matching Dashboard reference |
| 6 | Scheduler → `bookings/new` | Book on behalf; double-submit the same attempt | One booking and replay result; Today/Calendar/list/customer history agree |
| 7 | Staff/scheduler → `calendar` and booking detail | Open permitted appointment; check in; complete; use separate fixture for no-show/cancel/reschedule | Valid status/revision/event transitions; stale/forbidden transitions refused |
| 8 | Scheduler → `requests` | Approve/decline/propose using separate request fixtures | Authoritative decision and correct related booking/customer outcome |
| 9 | Admin with recent MFA → `payments`, `integrations` | Inspect sandbox account status; recover permitted payment/refund exception | Canonical account/payment/refund state; duplicate/unauthorized action refusal |
| 10 | Permitted operator → `communications` | Inspect queued/failed health; retry permitted booking email | Correct outbox/job state; no claim of real delivery without provider evidence |
| 11 | Authorized admin → `customers`, `reports` | Correct allowed customer field; run a scoped report/CSV; exercise privacy fixture | Revision/audit/rights-job result; forbidden PII absent; CSV safe |
| 12 | Admin → `settings`, `brand`, real preview | Change a supported setting; save draft; preview/publish/rollback brand | Correct revision/hash/audit; effective entitlements unchanged; snapshots retained |
| 13 | Audit reader → `audit` | Filter events and follow an allowed target | Matching redacted events, stable pagination, no sensitive content |
| 14 | Second actor / Realtime → current workspace | Commit a permitted update; disconnect/reconnect; revoke membership | Authoritative refetch, visible degraded status, revoked access denied |
| 15 | Every relevant actor → connected pages | Switch EN↔AR, use narrow viewport/keyboard, sign out | Same record/filters where supported, useful RTL/focus/reflow, private data unavailable after logout |

## Task 22: Run the single final verification campaign, repair real failures, and hand off

**Files:** No speculative feature work. Use Task 21's runner/report and change only proven defects or intentionally approved visual differences.

**Skills:** `verification-before-completion`; `impeccable` `reference/audit.md`; `ahmed-frontend`/`ahmed-supabase` for trace review; `diagnosing-bugs` for actual failures.

**Interfaces:** The complete implementation revision and its configured local/test environment. Output is actual evidence, not a task-completion assertion based on code reading.

- [ ] Confirm the pinned Node/pnpm versions, local Supabase project identity `white-label-booking-platform`, synthetic-only fixtures, ignored public app configuration, and printed dev origins. Do not print CLI status keys or password/MFA material.
- [ ] Perform source review of the full feature diff once: requirements, client/server boundaries, authorization, money/time correctness, data minimization, distribution closure, reusable components, translations, and affected consumers. Record independent security review as performed only if an authorized reviewer actually completed it.
- [ ] Invoke the one campaign entry point:

```bash
rtk node scripts/verify-dashboard-completion.mjs
```

**Required runner stages and expected results:**

| Stage | Commands invoked once within the campaign | Expected result |
| --- | --- | --- |
| Installation/configuration | `rtk pnpm install --frozen-lockfile`; `rtk pnpm check:lockfile`; `rtk pnpm check:ci`; `rtk pnpm check:config`; `rtk pnpm test:contract`; `rtk pnpm test:config` | Exit 0; frozen dependency graph; contracts/config valid |
| Source quality | `rtk pnpm format:check`; `rtk pnpm lint`; `rtk proxy pnpm typecheck`; `rtk pnpm test:unit`; `rtk pnpm check:fonts`; `rtk pnpm check:docs` | Exit 0; no format/lint/type/behavior/font/docs failures. Proxy is necessary for the previously observed RTK typecheck interception. |
| Platform/export regressions | `rtk pnpm test:github-app`; `rtk pnpm test:vercel`; `rtk pnpm test:ci-fixtures`; `rtk pnpm check:distribution`; `rtk pnpm test:distribution`; `rtk pnpm build:distribution`; `rtk pnpm check:secrets` | Exit 0; distributable closure intact; fixture dependency failure resolved; no privileged source/secret leakage |
| Database | `rtk pnpm db:lint`; `rtk pnpm test:db`; `rtk pnpm check:db-types` | Exit 0; all pgTAP files/assertions pass; generated local `api_v1` types match |
| Fresh migration replay | Existing source CI reset-from-zero gate in an isolated ephemeral environment | Every central migration and seed apply cleanly. Do not run `db:reset` on the user's current stack. If that environment/run is unavailable, record required fresh-replay evidence pending, not a pass. |
| Concurrency | `rtk pnpm test:concurrency` in an isolated synthetic test environment with `psql` and required connection headroom | One allocation/action winner, replay consistency, no overlapping allocations. Do not run a fixture-mutating concurrency gate against the user's retained demo data. |
| Production compilation | Build shared dependencies and all three applications through existing Turborepo tasks; give each app its own configured `NEXT_PUBLIC_SITE_URL`; then `rtk pnpm check:edge` and `rtk pnpm check:bundles` | All builds/checks exit 0; no sitemap-origin failure or privileged bundle leakage |
| Existing browser gates | `rtk pnpm test:component`; `rtk pnpm test:e2e`; `rtk pnpm test:e2e:live`; `rtk pnpm test:i18n`; `rtk pnpm test:a11y`; `rtk pnpm test:visual` | Exit 0; existing foundation and Client flows still work; intentional screenshot differences reviewed |
| New live journeys | `rtk pnpm exec playwright test --project=dashboard-completion` | Every ordered journey and refusal case passes with real Auth/RPC/database evidence |
| Mechanical UI audit | `rtk /Volumes/PortableSSD/AI-Hub/skills/impeccable/scripts/impeccable detect --json apps/dashboard/app packages/ui-foundation/src packages/white-label-ui/src` | Record complete findings; inspect each in context. Exit 2 means findings to judge, not automatic proof of a defect. No skipped detector labelled passing. |

Build-stage implementation must use child-process environment overrides per app, for example `NEXT_PUBLIC_SITE_URL=http://localhost:3000` for Client, `http://localhost:3001` for Dashboard, and `http://localhost:3002` for Platform Admin in local synthetic build checks. Production/preview deployment uses its actual trusted origins. Do not set one shared origin for all three apps. Use `pnpm exec turbo run build --filter=@wlbp/client...`, then the corresponding Dashboard/Admin filters with their environments; capture results once per target.

The runner must explicitly distinguish local gates from isolated CI gates. It cannot invent a successful fresh replay/concurrency result from the running database. Provisioning an isolated test environment or triggering CI follows execution-time authorization and must be completed before release-ready claims.

- [ ] Use the native T3 browser: `preview_status`, then `preview_open` when needed. Inspect representative Today, Calendar, Bookings/detail/new, Services/editor, Availability, Settings, Brand/preview, Communications, Integrations, Audit, and Auth states in one batched desktop/mobile EN/AR round. Inspect actual screenshots as well as DOM/interaction state.
- [ ] Assess Impeccable's five audit dimensions: accessibility, performance, theming, responsive design, implementation integrity. Record measured facts, visual judgment, and detector false positives separately. Do not generate an unsupported “human-made” score.
- [ ] Run keyboard/error/focus/menu/calendar-list/reflow/reduced-motion checks within this round. Record 200% zoom and long-content behavior. Request/record actual human screen-reader and visual acceptance; automation cannot claim that Ahmed/VoiceOver/NVDA approved the UI.
- [ ] Collect all concrete defects, fix them in one batch, and rerun only affected failed/dependent checks. Use at most one confirmation screenshot round. If defects remain, continue necessary diagnosis; do not claim completion to preserve the nominal one-pass limit.
- [ ] Update the final report with all commands/results, feature coverage, roles/locales/brands/viewports, persisted references, contract versions, and remaining risks. Update durable `docs/journeys.md`, `docs/local-setup.md`, and the shipped `DESIGN.md` where implementation resolved actual behavior.
- [ ] Report unavailable provider live delivery as `N/A — not yet implemented, owned by issue #41` only if still accurate after source/issue inspection. For #102 or new full-journey coverage, report actual pass/failure/pending evidence; do not copy obsolete N/A labels from earlier reports.
- [ ] Only after passing evidence, offer a concrete reviewed diff for any later commit/PR/deployment action. This planning request itself authorizes none of those actions.

### Completion criteria

The Dashboard is **implemented and verified locally** only when supported pages are connected, actor workflows persist correct data, all applicable executed local gates pass, the known SQL/type/fixture failures are resolved, EN/AR and responsive behavior are demonstrated, and the UI audit has no unresolved task-blocking/accessibility defects. It is **release ready** only after isolated fresh-replay/concurrency/required CI evidence, required provider evidence, and human visual/assistive-technology acceptance are also recorded. If any of these is pending, say exactly which acceptance remains pending.

## Planning self-review

- Requirements coverage: navigation (2–4); Auth/MFA/staff access (5–7); catalog (8–9); scheduling/staff booking/daily views/live updates (10–13); Settings/Brand/Communications/Integrations/Audit (14–18); related operational workflows (19); existing failures (20); fixtures and final campaign (21–22).
- Contract honesty: existing RPCs are identified by their source; proposed UI interfaces are labelled; unconfirmed backend work starts with bounded discovery and concrete subtask refinement.
- Verification cadence: behavioral tests are authored during tasks and executed in one final campaign; no per-file suite runs, mock-only completion claims, or repeated aesthetic review loops.
- Scope/authorization: first-release boundaries are explicit; no feature implementation, agent delegation, destructive reset, remote mutation, commit, PR, or deployment occurs while writing the plan.
