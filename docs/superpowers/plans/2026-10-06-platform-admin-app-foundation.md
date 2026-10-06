# Platform Admin Completion — Part B1: App Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Global Constraints: [`2026-10-06-platform-admin-completion.md`](2026-10-06-platform-admin-completion.md). Conventions: [`2026-10-06-platform-admin-application.md`](2026-10-06-platform-admin-application.md).

**Goal:** The styling, copy, data access, action handling, list state, shell and primitives every console page uses.

---

### Task 9: Design tokens, bundled fonts, console stylesheet

**Files:**
- Create: `apps/platform-admin/public/fonts/` (copy of `apps/dashboard/public/fonts/*`)
- Rewrite: `apps/platform-admin/app/globals.css`
- Modify: `apps/platform-admin/next.config.ts` (`transpilePackages`)

**Interfaces:**
- Produces CSS classes used by Tasks 12–21: `console`, `console-sidebar`, `console-main`, `console-header`, `page-header`, `breadcrumbs`, `page-actions`, `section`, `section-header`, `metric-grid`, `metric`, `table-scroll`, `data-table`, `filter-bar`, `pagination`, `facts`, `state`, `state--denied`, `value-unknown`, `notice`, `notice--warning`, `timeline`, `dialog`, `form-grid`, `field`, `inline-form`, `json-pair`, `skip-link`, `sr-only`, plus `.wlbp-*` primitives.

- [ ] **Step 1: Copy the bundled fonts and their licences**

Run:
```bash
rtk mkdir -p apps/platform-admin/public/fonts
rtk cp apps/dashboard/public/fonts/* apps/platform-admin/public/fonts/
rtk ls apps/platform-admin/public/fonts
rtk pnpm check:fonts
```
Expected: the three `.woff2` files, their `OFL-*.txt` licences and any provenance file copied; `check:fonts` passes. If `check:fonts` lists per-app expectations that exclude platform-admin, add `apps/platform-admin/public/fonts` to the list it reads in `scripts/check-font-assets.mjs` in the same way the dashboard entry is written.

- [ ] **Step 2: Allow the server packages to be transpiled**

In `apps/platform-admin/next.config.ts` replace the `transpilePackages` line with:
```ts
  transpilePackages: [
    "@wlbp/auth",
    "@wlbp/config",
    "@wlbp/i18n",
    "@wlbp/supabase-client",
    "@wlbp/ui-foundation",
  ],
```

- [ ] **Step 3: Replace the stylesheet**

`apps/platform-admin/app/globals.css` (full file; logical properties only, no `left`/`right`, no `[dir=rtl]` overrides):
```css
/*
 * Platform Admin is an internal operations console: dense, calm, legible in
 * English and Arabic. Fonts are bundled; never add a remote font URL.
 */
@font-face {
  font-family: "Inter";
  font-style: normal;
  font-display: swap;
  font-weight: 100 900;
  src: url("/fonts/Inter-Variable.woff2") format("woff2");
}
@font-face {
  font-family: "Noto Sans Arabic";
  font-style: normal;
  font-display: swap;
  font-weight: 100 900;
  src: url("/fonts/NotoSansArabic-Variable.woff2") format("woff2");
}

:root {
  color-scheme: light;
  --ink: #17201f;
  --muted: #56625f;
  --canvas: #eef1ef;
  --surface: #ffffff;
  --sidebar: #14231f;
  --sidebar-ink: #e7efeb;
  --sidebar-muted: #a9bab4;
  --border: #d3dbd7;
  --accent: #1f6f5c;
  --accent-ink: #ffffff;
  --positive: #1d6b3a;
  --positive-bg: #e3f3e8;
  --warning: #8a5300;
  --warning-bg: #fff2d9;
  --danger: #a03224;
  --danger-bg: #fbe6e2;
  --neutral-bg: #eef1ef;
  --focus: #ffb800;
  --radius: 0.5rem;
  font-family: "Inter", "Noto Sans Arabic", system-ui, sans-serif;
  font-size: 15px;
  line-height: 1.5;
  color: var(--ink);
  background: var(--canvas);
}
:lang(ar) { font-family: "Noto Sans Arabic", "Inter", system-ui, sans-serif; letter-spacing: normal; }

* { box-sizing: border-box; }
html, body { margin: 0; min-block-size: 100%; }
a { color: var(--accent); }
:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }

.sr-only {
  position: absolute; inline-size: 1px; block-size: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0;
}
.skip-link { position: absolute; inset-block-start: -10rem; inset-inline-start: 1rem; z-index: 10;
  padding: 0.75rem 1rem; background: var(--surface); border: 2px solid var(--focus); }
.skip-link:focus { inset-block-start: 1rem; }

/* ---- shell ---------------------------------------------------------- */
.console { display: grid; grid-template-columns: 15.5rem minmax(0, 1fr); min-block-size: 100dvh; }
.console-sidebar { position: sticky; inset-block-start: 0; max-block-size: 100dvh; overflow-y: auto;
  padding: 1rem 0.75rem; background: var(--sidebar); color: var(--sidebar-ink); }
.console-brand { display: flex; gap: 0.6rem; align-items: center; padding: 0.25rem 0.5rem 1rem;
  color: inherit; text-decoration: none; font-weight: 700; }
.console-brand small { display: block; font-weight: 400; color: var(--sidebar-muted); font-size: 0.8rem; }
.nav-group { margin-block: 0.75rem 0; }
.nav-group h2 { margin: 0 0 0.25rem; padding-inline: 0.5rem; font-size: 0.72rem; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.06em; color: var(--sidebar-muted); }
:lang(ar) .nav-group h2 { text-transform: none; letter-spacing: normal; }
.nav-group ul { list-style: none; margin: 0; padding: 0; }
.nav-group a { display: flex; align-items: center; min-block-size: 2.75rem; padding-inline: 0.75rem;
  border-radius: var(--radius); color: var(--sidebar-ink); text-decoration: none; }
.nav-group a:hover { background: rgb(255 255 255 / 8%); }
.nav-group a[aria-current="page"] { background: var(--sidebar-ink); color: var(--sidebar); font-weight: 600; }
.menu-toggle { display: none; }

.console-main { min-inline-size: 0; display: flex; flex-direction: column; }
.console-header { display: flex; gap: 1rem; align-items: center; justify-content: flex-end;
  min-block-size: 3.5rem; padding-inline: 1.5rem; background: var(--surface);
  border-block-end: 1px solid var(--border); }
.console-header .operator { color: var(--muted); font-size: 0.9rem; }
.console-header form { margin: 0; }
.locale-switch { display: flex; gap: 0.25rem; }
.locale-switch a { padding: 0.35rem 0.6rem; border-radius: var(--radius); text-decoration: none; }
.locale-switch a[aria-current="true"] { background: var(--neutral-bg); font-weight: 600; color: var(--ink); }
.console-content { inline-size: 100%; max-inline-size: 92rem; padding: 1.25rem 1.5rem 4rem; }

.page-header { display: flex; flex-wrap: wrap; gap: 0.75rem 1.5rem; align-items: flex-end;
  justify-content: space-between; margin-block-end: 1.25rem; }
.page-header h1 { margin: 0.15rem 0 0; font-size: 1.5rem; line-height: 1.25; }
.page-header p { margin: 0.25rem 0 0; color: var(--muted); max-inline-size: 60rem; }
.breadcrumbs ol { display: flex; flex-wrap: wrap; gap: 0.35rem; margin: 0; padding: 0; list-style: none;
  font-size: 0.85rem; color: var(--muted); }
.breadcrumbs li + li::before { content: "/"; margin-inline-end: 0.35rem; color: var(--border); }
.page-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }

/* ---- surfaces ------------------------------------------------------- */
.section { margin-block-end: 1.25rem; padding: 1rem 1.25rem; background: var(--surface);
  border: 1px solid var(--border); border-radius: var(--radius); }
.section-header { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; align-items: center;
  justify-content: space-between; margin-block-end: 0.75rem; }
.section-header h2 { margin: 0; font-size: 1.05rem; }
.section-nav { display: flex; flex-wrap: wrap; gap: 0.25rem 1rem; margin-block-end: 1rem; font-size: 0.9rem; }
.metric-grid { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
  margin-block-end: 1.25rem; }
.metric { display: block; padding: 0.9rem 1rem; background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); color: inherit; text-decoration: none; }
.metric:hover { border-color: var(--accent); }
.metric h2 { margin: 0; font-size: 0.85rem; font-weight: 600; color: var(--muted); }
.metric strong { display: block; margin-block: 0.25rem; font-size: 1.6rem; }
.metric ul { margin: 0; padding: 0; list-style: none; font-size: 0.85rem; color: var(--muted); }
.notice { margin-block-end: 1rem; padding: 0.75rem 1rem; border-radius: var(--radius);
  background: var(--neutral-bg); border-inline-start: 4px solid var(--muted); }
.notice--warning { background: var(--warning-bg); border-inline-start-color: var(--warning); }
.notice--danger { background: var(--danger-bg); border-inline-start-color: var(--danger); }

/* ---- tables --------------------------------------------------------- */
.table-scroll { overflow-x: auto; border: 1px solid var(--border); border-radius: var(--radius); }
.data-table { inline-size: 100%; border-collapse: collapse; font-size: 0.9rem; }
.data-table caption { padding: 0.6rem 0.75rem; text-align: start; font-weight: 600; }
.data-table th, .data-table td { padding: 0.55rem 0.75rem; text-align: start; vertical-align: top;
  border-block-start: 1px solid var(--border); }
.data-table thead th { background: var(--neutral-bg); font-weight: 600; white-space: nowrap; }
.data-table th a { color: inherit; }
.data-table td.numeric, .data-table th.numeric { text-align: end; font-variant-numeric: tabular-nums; }
.secondary { display: block; color: var(--muted); font-size: 0.8rem; }

.filter-bar { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: flex-end; margin-block-end: 1rem; }
.filter-bar label { display: grid; gap: 0.25rem; font-size: 0.85rem; font-weight: 600; }
.pagination { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center;
  justify-content: space-between; margin-block-start: 0.75rem; font-size: 0.9rem; }
.pagination div { display: flex; gap: 0.5rem; }

/* ---- forms ---------------------------------------------------------- */
input, select, textarea { font: inherit; min-block-size: 2.75rem; padding: 0.45rem 0.6rem;
  border: 1px solid var(--muted); border-radius: var(--radius); background: var(--surface); color: var(--ink); }
textarea { min-block-size: 5rem; inline-size: 100%; }
input[type="checkbox"], input[type="radio"] { min-block-size: auto; inline-size: 1.1rem; block-size: 1.1rem; }
[aria-invalid="true"] { border-color: var(--danger); }
.form-grid { display: grid; gap: 0.9rem; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.form-grid .full { grid-column: 1 / -1; }
.field { display: grid; gap: 0.3rem; }
.field > span:first-child { font-weight: 600; font-size: 0.9rem; }
.field small { color: var(--muted); }
.checkbox { display: flex; gap: 0.5rem; align-items: center; }
fieldset { margin: 0; padding: 0; border: 0; min-inline-size: 0; }
legend { font-weight: 600; margin-block-end: 0.4rem; }
.inline-form { display: inline; }
.form-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: flex-end; margin-block-start: 1rem; }

.wlbp-button { display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;
  min-block-size: 2.75rem; padding: 0.45rem 1rem; border-radius: var(--radius); font: inherit;
  font-weight: 600; cursor: pointer; border: 1px solid transparent; text-decoration: none; }
.wlbp-button--primary { background: var(--accent); color: var(--accent-ink); }
.wlbp-button--secondary { background: var(--surface); color: var(--ink); border-color: var(--muted); }
.wlbp-button--quiet { background: transparent; color: var(--accent); }
.wlbp-button--danger { background: var(--danger); color: #fff; }
.wlbp-button:disabled, .wlbp-button[aria-disabled="true"] { opacity: 0.55; cursor: not-allowed; }
.wlbp-link-button { text-decoration: none; }
.wlbp-field { display: grid; gap: 0.3rem; margin-block-end: 0.9rem; }
.wlbp-field__label { font-weight: 600; }
.wlbp-field__description { color: var(--muted); font-size: 0.85rem; }
.wlbp-field__error { color: var(--danger); font-size: 0.85rem; }
.wlbp-error-summary { margin-block-end: 1rem; padding: 0.75rem 1rem; background: var(--danger-bg);
  border-inline-start: 4px solid var(--danger); border-radius: var(--radius); }
.wlbp-status { margin: 0 0 1rem; padding: 0.6rem 0.9rem; border-radius: var(--radius); background: var(--neutral-bg); }
.wlbp-status--positive { background: var(--positive-bg); }
.wlbp-status--warning { background: var(--warning-bg); }
.wlbp-surface { background: var(--surface); }

.wlbp-badge { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.1rem 0.5rem;
  border-radius: 999px; font-size: 0.8rem; font-weight: 600; white-space: nowrap;
  background: var(--neutral-bg); color: var(--ink); border: 1px solid var(--border); }
.wlbp-badge--positive { background: var(--positive-bg); color: var(--positive); border-color: currentcolor; }
.wlbp-badge--warning { background: var(--warning-bg); color: var(--warning); border-color: currentcolor; }
.wlbp-badge--danger { background: var(--danger-bg); color: var(--danger); border-color: currentcolor; }

/* ---- values, states, timelines -------------------------------------- */
.facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr)); gap: 0.75rem 1.25rem; margin: 0; }
.facts dt { font-size: 0.8rem; color: var(--muted); font-weight: 600; }
.facts dd { margin: 0.1rem 0 0; overflow-wrap: anywhere; }
.value-unknown { color: var(--muted); font-style: italic; }
.state { padding: 1.5rem; text-align: center; color: var(--muted); }
.state h2 { margin: 0 0 0.35rem; color: var(--ink); font-size: 1.05rem; }
.state--denied, .state--unavailable { text-align: start; background: var(--surface);
  border: 1px solid var(--border); border-radius: var(--radius); }
.timeline { margin: 0; padding: 0; list-style: none; }
.timeline li { display: grid; grid-template-columns: 11rem minmax(0, 1fr); gap: 0.75rem;
  padding-block: 0.5rem; border-block-start: 1px solid var(--border); font-size: 0.9rem; }
.json-pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; }
.json-pair pre { margin: 0; padding: 0.6rem; overflow-x: auto; background: var(--neutral-bg);
  border-radius: var(--radius); font-size: 0.8rem; direction: ltr; text-align: start; }

/* ---- dialogs -------------------------------------------------------- */
.dialog { inline-size: min(36rem, calc(100vw - 2rem)); max-block-size: calc(100dvh - 2rem);
  padding: 1.25rem; border: 1px solid var(--border); border-radius: var(--radius); color: var(--ink); }
.dialog::backdrop { background: rgb(10 20 18 / 55%); }
.dialog h2 { margin: 0 0 0.5rem; font-size: 1.15rem; }

/* ---- auth pages ----------------------------------------------------- */
.auth-shell { display: grid; place-items: center; min-block-size: 100dvh; padding: 1.5rem; }
.auth-card { inline-size: min(28rem, 100%); padding: 1.5rem; background: var(--surface);
  border: 1px solid var(--border); border-radius: var(--radius); }
.auth-card h1 { margin-block-start: 0; font-size: 1.35rem; }
.auth-card img { display: block; margin-block: 1rem; background: #fff; }
.not-found { padding: 3rem 1.5rem; }

/* ---- responsive ----------------------------------------------------- */
@media (max-width: 52rem) {
  .console { grid-template-columns: minmax(0, 1fr); }
  .console-sidebar { position: static; max-block-size: none; display: flex; flex-wrap: wrap;
    align-items: center; justify-content: space-between; gap: 0.5rem; padding-block: 0.5rem; }
  .console-brand { padding-block-end: 0.25rem; }
  .menu-toggle { display: inline-flex; }
  .console-menu { display: none; flex-basis: 100%; }
  .console-menu.is-open { display: block; }
  .console-header { flex-wrap: wrap; justify-content: space-between; padding-block: 0.5rem; }
  .console-content { padding-inline: 1rem; }
}
@media (max-width: 42rem) {
  .form-grid, .json-pair { grid-template-columns: minmax(0, 1fr); }
  .timeline li { grid-template-columns: minmax(0, 1fr); gap: 0.15rem; }
  .page-header h1 { font-size: 1.3rem; }
}
```

- [ ] **Step 4: Verify the build still compiles**

Run: `rtk pnpm --filter @wlbp/platform-admin build`
Expected: build succeeds (the old page still references removed classes; that is fine until Task 12 replaces it).

- [ ] **Step 5: Commit**

```bash
rtk git add apps/platform-admin/public/fonts apps/platform-admin/app/globals.css apps/platform-admin/next.config.ts
rtk git commit -m "Give Platform Admin a console stylesheet and bundled fonts"
```
(`globals.css` has prior uncommitted edits that this rewrite supersedes; confirm with `git diff` that nothing else in the file needed keeping.)

---

### Task 10: Bilingual copy with parity enforcement

**Files:**
- Rewrite: `apps/platform-admin/app/_lib/copy.ts`
- Create: `apps/platform-admin/app/_lib/copy.test.ts`
- Create: `apps/platform-admin/vitest.config.ts` (only if `pnpm --filter @wlbp/platform-admin test:unit` cannot resolve `.tsx`/aliases; otherwise skip)

**Interfaces:**
- Produces: `type Copy`, `say(locale, copy)`, `fill(locale, copy, values)`, `copyFor(map, key, locale)` (falls back to "Unknown status" + raw code), `shellCopy`, `stateCopy`, `formCopy`, `errorCopy`, `reasonCopy`, `statusCopy`, `statusTone(status)`, `roleCopy`, `assertCopyTree(tree, path)`.

- [ ] **Step 1: Write the failing test**

`apps/platform-admin/app/_lib/copy.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import * as shared from "./copy";

// Each route task appends its copy module here, e.g.
// import * as tenants from "../[locale]/(console)/tenants/copy";
const modules: Record<string, Record<string, unknown>> = { shared };

describe("copy parity", () => {
  for (const [name, module] of Object.entries(modules)) {
    it(`${name}: every entry has English and Arabic text`, () => {
      expect(() => shared.assertCopyTree(module, name)).not.toThrow();
    });
  }

  it("fill substitutes named values in both languages", () => {
    const copy = ["{count} jobs", "{count} مهام"] as const;
    expect(shared.fill("en", copy, { count: "3" })).toBe("3 jobs");
    expect(shared.fill("ar", copy, { count: "٣" })).toBe("٣ مهام");
  });

  it("unknown codes fall back to a localized label, never an English-only code", () => {
    expect(shared.copyFor(shared.statusCopy, "weird_state", "ar")).toBe("حالة غير معروفة");
  });

  it("every error code the database can raise has copy", () => {
    for (const code of [
      "policy_denied", "recent_authentication_required", "not_found", "stale_revision",
      "reason_required", "last_admin_protected", "idempotency_conflict", "unavailable",
    ]) {
      expect(shared.errorCopy).toHaveProperty(code);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `rtk pnpm --filter @wlbp/platform-admin test:unit`
Expected: FAIL — `assertCopyTree is not a function`.

- [ ] **Step 3: Write the copy module**

`apps/platform-admin/app/_lib/copy.ts`:
```ts
import type { Locale } from "@wlbp/i18n";

/** English and Arabic, always together. A missing language is a type error. */
export type Copy = readonly [en: string, ar: string];

export function say(locale: Locale, copy: Copy): string {
  return locale === "ar" ? copy[1] : copy[0];
}

export function fill(locale: Locale, copy: Copy, values: Record<string, string>): string {
  return say(locale, copy).replace(/\{(\w+)\}/gu, (_, key: string) => values[key] ?? "");
}

const unknownStatus: Copy = ["Unknown status", "حالة غير معروفة"];

export function copyFor(map: Record<string, Copy>, key: string | null | undefined, locale: Locale): string {
  return say(locale, (key && map[key]) || unknownStatus);
}

const arabicScript = /[؀-ۿ]/u;

/** Throws on the first entry that is not a complete [en, ar] pair. */
export function assertCopyTree(tree: unknown, path: string): void {
  if (Array.isArray(tree)) {
    const [en, ar] = tree as unknown[];
    if (tree.length !== 2 || typeof en !== "string" || typeof ar !== "string" || !en.trim() || !arabicScript.test(ar)) {
      throw new Error(`${path} is not a complete [en, ar] pair`);
    }
    return;
  }
  if (tree && typeof tree === "object") {
    for (const [key, value] of Object.entries(tree)) {
      if (typeof value === "function") continue;
      assertCopyTree(value, `${path}.${key}`);
    }
  }
}

export const shellCopy = {
  brand: ["Atlas", "أطلس"],
  brandDetail: ["Platform administration", "إدارة المنصة"],
  skip: ["Skip to content", "انتقل إلى المحتوى"],
  menu: ["Menu", "القائمة"],
  navigation: ["Platform administration", "إدارة المنصة"],
  breadcrumbs: ["Breadcrumb", "مسار التنقل"],
  language: ["Language", "اللغة"],
  english: ["English", "الإنجليزية"],
  arabic: ["Arabic", "العربية"],
  signOut: ["Sign out", "تسجيل الخروج"],
  account: ["Your account", "حسابك"],
  signedInAs: ["Signed in as {email} · {role}", "تم تسجيل الدخول باسم {email} · {role}"],
  groups: {
    overview: ["Overview", "نظرة عامة"],
    fleet: ["Fleet", "الأسطول"],
    commercial: ["Commercial", "الاشتراكات"],
    releases: ["Releases", "الإصدارات"],
    operations: ["Operations", "العمليات"],
    administration: ["Administration", "الإدارة"],
  },
  items: {
    overview: ["Overview", "نظرة عامة"],
    tenants: ["Tenants", "المستأجرون"],
    instances: ["Instances", "النسخ"],
    domains: ["Domains", "النطاقات"],
    provisioning: ["Provisioning", "التهيئة"],
    jobs: ["Jobs", "المهام"],
    plans: ["Plans", "الخطط"],
    subscriptions: ["Subscriptions", "الاشتراكات"],
    releases: ["Releases", "الإصدارات"],
    rollouts: ["Rollouts", "عمليات النشر"],
    health: ["Health", "الحالة التشغيلية"],
    support: ["Support access", "وصول الدعم"],
    operators: ["Operators", "المشغّلون"],
    audit: ["Audit log", "سجل التدقيق"],
    settings: ["Settings", "الإعدادات"],
  },
} as const satisfies Record<string, unknown>;

export const stateCopy = {
  emptyTitle: ["Nothing here yet", "لا يوجد شيء هنا بعد"],
  emptyFiltered: ["No records match these filters.", "لا توجد سجلات تطابق عوامل التصفية هذه."],
  unavailableTitle: ["This information could not be loaded", "تعذّر تحميل هذه المعلومات"],
  unavailableBody: ["Nothing is shown in its place. Try again; if it keeps failing, check the database connection.",
    "لا يُعرض أي بديل عنها. حاول مرة أخرى، وإذا استمر الخطأ فتحقق من اتصال قاعدة البيانات."],
  deniedTitle: ["You do not have access to the control plane", "ليست لديك صلاحية الوصول إلى لوحة التحكم"],
  deniedBody: ["Your account is not an active operator, or your operator access has expired. Ask a platform administrator.",
    "حسابك ليس مشغّلًا نشطًا، أو انتهت صلاحية وصولك. تواصل مع مسؤول المنصة."],
  configurationTitle: ["Platform Admin is not configured", "لم تتم تهيئة إدارة المنصة"],
  configurationBody: ["The database address and publishable key are missing from this environment.",
    "عنوان قاعدة البيانات والمفتاح العام غير موجودين في هذه البيئة."],
  notObserved: ["Not observed", "لم تُرصد"],
  notReported: ["Not reported", "لم يُبلّغ عنه"],
  never: ["Never", "أبدًا"],
  none: ["None", "لا يوجد"],
  unknown: ["Unknown", "غير معروف"],
  utc: ["UTC", "بالتوقيت العالمي"],
  staleSince: ["Stale — observed {age} ago", "قديمة — رُصدت منذ {age}"],
  minutes: ["{n} min", "{n} دقيقة"],
  hours: ["{n} h", "{n} ساعة"],
  days: ["{n} d", "{n} يوم"],
  yes: ["Yes", "نعم"],
  no: ["No", "لا"],
  roleRequired: ["Your role can view this but not change it. Ask an administrator.", "يمكن لدورك عرض هذا دون تعديله. تواصل مع مسؤول."],
  loading: ["Loading…", "جارٍ التحميل…"],
  waitingForWorker: ["Queued — waiting for the {worker} worker to claim it. Nothing has run yet.",
    "في قائمة الانتظار — بانتظار أن يستلمها عامل {worker}. لم يُنفّذ شيء بعد."],
} as const satisfies Record<string, unknown>;

export const formCopy = {
  apply: ["Apply", "تطبيق"],
  clear: ["Clear filters", "مسح عوامل التصفية"],
  search: ["Search", "بحث"],
  all: ["All", "الكل"],
  cancel: ["Cancel", "إلغاء"],
  close: ["Close", "إغلاق"],
  save: ["Save", "حفظ"],
  saving: ["Saving…", "جارٍ الحفظ…"],
  working: ["Working…", "جارٍ التنفيذ…"],
  reason: ["Reason", "السبب"],
  reasonHint: ["Recorded in the audit log. At least {n} characters.", "يُسجَّل في سجل التدقيق. {n} أحرف على الأقل."],
  typeToConfirm: ["Type {value} to confirm", "اكتب {value} للتأكيد"],
  previous: ["Previous", "السابق"],
  next: ["Next", "التالي"],
  pageOf: ["Page {page} of {pages}", "الصفحة {page} من {pages}"],
  results: ["{total} results", "{total} نتيجة"],
  pagination: ["Pagination", "التنقل بين الصفحات"],
  sortBy: ["Sort by {column}", "الترتيب حسب {column}"],
  errorTitle: ["The action did not complete", "لم يكتمل الإجراء"],
  done: ["Done.", "تم."],
  stepUpTitle: ["Confirm it is you", "أكّد هويتك"],
  stepUpBody: ["This action needs a fresh verification. Enter the 6-digit code from your authenticator app; the action then continues.",
    "يتطلب هذا الإجراء تحققًا جديدًا. أدخل الرمز المكوّن من ٦ أرقام من تطبيق المصادقة، ثم يتابع الإجراء."],
  stepUpCode: ["6-digit code", "رمز من ٦ أرقام"],
  stepUpSubmit: ["Verify and continue", "تحقق وتابع"],
  stepUpInvalid: ["That code was not accepted. Wait for a new code and try again.", "لم يُقبل هذا الرمز. انتظر رمزًا جديدًا وحاول مرة أخرى."],
  stepUpNoFactor: ["No verified authenticator is enrolled on this account.", "لا يوجد تطبيق مصادقة موثّق على هذا الحساب."],
} as const satisfies Record<string, unknown>;

export const errorCopy: Record<string, Copy> = {
  policy_denied: ["Your role does not allow this action, or your session is no longer verified.", "دورك لا يسمح بهذا الإجراء، أو لم تعد جلستك موثّقة."],
  recent_authentication_required: ["This action needs a fresh verification.", "يتطلب هذا الإجراء تحققًا جديدًا."],
  not_found: ["That record no longer exists.", "هذا السجل لم يعد موجودًا."],
  stale_revision: ["Someone changed this record since you opened it. Reload and try again.", "غيّر شخص آخر هذا السجل منذ فتحه. أعد التحميل وحاول مرة أخرى."],
  reason_required: ["Give a reason that a reviewer can understand.", "اكتب سببًا يمكن للمراجع فهمه."],
  name_invalid: ["Enter a name of 1 to 160 characters.", "أدخل اسمًا من ١ إلى ١٦٠ حرفًا."],
  tenant_name_invalid: ["Enter a tenant name of 1 to 160 characters.", "أدخل اسم مستأجر من ١ إلى ١٦٠ حرفًا."],
  brand_key_invalid: ["Use lowercase letters, digits and single hyphens, e.g. north-clinic.", "استخدم أحرفًا صغيرة وأرقامًا وشرطات مفردة، مثل north-clinic."],
  confirmation_mismatch: ["The confirmation text does not match.", "نص التأكيد غير مطابق."],
  suspend_before_closure: ["Suspend the tenant before requesting closure.", "علّق المستأجر قبل طلب الإغلاق."],
  transition_not_allowed: ["That change is not allowed from the record's current state.", "هذا التغيير غير مسموح من الحالة الحالية للسجل."],
  job_running: ["A worker is running this job. Wait for it to finish.", "يعمل أحد العمّال على هذه المهمة. انتظر حتى تنتهي."],
  attempts_exhausted: ["This job has used all its attempts. Investigate before queuing it again.", "استنفدت هذه المهمة كل محاولاتها. تحقّق قبل إعادة جدولتها."],
  plan_exists: ["A plan with this key already exists.", "توجد خطة بهذا المفتاح بالفعل."],
  plan_invalid: ["Use a lowercase key of 2 to 41 characters.", "استخدم مفتاحًا بأحرف صغيرة من ٢ إلى ٤١ حرفًا."],
  plan_unknown: ["That plan does not exist or is inactive.", "هذه الخطة غير موجودة أو غير نشطة."],
  entitlement_invalid: ["Feature keys use lowercase letters, digits, dots and underscores.", "مفاتيح الميزات تستخدم أحرفًا صغيرة وأرقامًا ونقاطًا وشرطات سفلية."],
  ends_at_required: ["Choose an end date for this status.", "اختر تاريخ انتهاء لهذه الحالة."],
  expiry_invalid: ["Choose an expiry in the future within the allowed limit.", "اختر تاريخ انتهاء مستقبليًا ضمن الحد المسموح."],
  release_exists: ["That version is already registered.", "هذا الإصدار مسجّل بالفعل."],
  release_invalid: ["Check the version, commit, contract range and notes.", "تحقّق من رقم الإصدار والالتزام ونطاق العقد والملاحظات."],
  no_targets: ["No active instance matches this targeting.", "لا توجد نسخة نشطة تطابق هذا الاستهداف."],
  rollback_not_supported: ["This release was registered as irreversible. Ship a forward fix instead.", "سُجّل هذا الإصدار كغير قابل للتراجع. انشر إصلاحًا لاحقًا بدلًا من ذلك."],
  account_not_found: ["No account uses that email. The person must sign up or be invited first.", "لا يوجد حساب بهذا البريد. يجب أن يسجّل الشخص أو يُدعى أولًا."],
  operator_exists: ["That account is already an operator.", "هذا الحساب مشغّل بالفعل."],
  last_admin_protected: ["This would leave no administrator with verified MFA. Add another administrator first.", "سيؤدي هذا إلى عدم وجود مسؤول بمصادقة موثّقة. أضف مسؤولًا آخر أولًا."],
  self_grant_denied: ["You cannot grant break-glass access to yourself.", "لا يمكنك منح نفسك وصول الطوارئ."],
  second_operator_required: ["A different administrator must approve this.", "يجب أن يوافق مسؤول آخر على هذا."],
  self_approval_denied: ["You cannot approve your own request.", "لا يمكنك الموافقة على طلبك."],
  hostname_invalid: ["Enter a valid hostname such as book.example.com.", "أدخل اسم نطاق صالحًا مثل book.example.com."],
  domain_taken: ["That hostname is already in use.", "اسم النطاق هذا مستخدم بالفعل."],
  flag_invalid: ["Check the key, both messages and the time window.", "تحقّق من المفتاح والرسالتين والفترة الزمنية."],
  reference_invalid: ["Secret references are environment variable names such as GITHUB_APP_ID, never values.", "مراجع الأسرار هي أسماء متغيرات بيئة مثل GITHUB_APP_ID، وليست قيمًا."],
  idempotency_conflict: ["This form was already submitted for a different action. Reload the page.", "أُرسل هذا النموذج لإجراء مختلف. أعد تحميل الصفحة."],
  idempotency_key_invalid: ["This form expired. Reload the page.", "انتهت صلاحية هذا النموذج. أعد تحميل الصفحة."],
  secret_rejected: ["Something that looks like a secret was refused. Never paste credentials here.", "رُفض شيء يشبه سرًّا. لا تلصق بيانات اعتماد هنا أبدًا."],
  settings_invalid: ["One of the values is not allowed.", "إحدى القيم غير مسموح بها."],
  configuration_missing: ["Platform Admin is not configured in this environment.", "لم تتم تهيئة إدارة المنصة في هذه البيئة."],
  unavailable: ["The database did not answer. Nothing was changed.", "لم تستجب قاعدة البيانات. لم يتغير شيء."],
};

/** Validation, activation and prerequisite reasons returned as data. */
export const reasonCopy: Record<string, Copy> = {
  instance_unknown: ["The instance does not exist.", "النسخة غير موجودة."],
  instance_not_provisioning: ["The instance is already past provisioning.", "النسخة تجاوزت مرحلة التهيئة."],
  slug_invalid: ["Slug: 3–40 lowercase letters, digits or hyphens.", "المعرّف: ٣–٤٠ حرفًا صغيرًا أو أرقامًا أو شرطات."],
  slug_taken: ["That slug is used by another instance.", "هذا المعرّف مستخدم لنسخة أخرى."],
  locale_invalid: ["Choose English or Arabic.", "اختر الإنجليزية أو العربية."],
  timezone_invalid: ["Choose a valid IANA time zone.", "اختر منطقة زمنية صالحة."],
  currency_invalid: ["Use a three-letter currency code.", "استخدم رمز عملة من ثلاثة أحرف."],
  release_invalid: ["Choose a registered release.", "اختر إصدارًا مسجّلًا."],
  config_schema_invalid: ["The release has no valid configuration schema.", "لا يحتوي الإصدار على مخطط إعدادات صالح."],
  backend_contract_incompatible: ["The release cannot talk to the backend this fleet runs.", "لا يتوافق الإصدار مع الخادم الذي يعمل عليه الأسطول."],
  domains_invalid: ["One of the domains is malformed.", "أحد النطاقات غير صالح."],
  domain_taken: ["A domain is already used by another tenant.", "أحد النطاقات مستخدم لمستأجر آخر."],
  github_installation_missing: ["The GitHub App is not installed for this tenant.", "تطبيق GitHub غير مثبّت لهذا المستأجر."],
  steps_incomplete: ["Required steps have not all succeeded.", "لم تنجح كل الخطوات المطلوبة."],
  waiting_customer_dns: ["Waiting for the customer's DNS change.", "بانتظار تغيير DNS لدى العميل."],
  waiting_external_approval: ["Waiting for an external approval.", "بانتظار موافقة خارجية."],
  waiting_provider_rate_limit: ["Waiting for a provider rate limit.", "بانتظار انتهاء حدّ معدل المزوّد."],
  waiting_provider_outage: ["Waiting for a provider outage to end.", "بانتظار انتهاء انقطاع المزوّد."],
  waiting_worker_not_implemented: ["Waiting for a worker that is not deployed.", "بانتظار عامل غير منشور."],
  release_state_missing: ["No release state is recorded.", "لا توجد حالة إصدار مسجّلة."],
  environment_unverified: ["The deployed environment has not been verified.", "لم يتم التحقق من بيئة النشر."],
  release_mismatch: ["The running release differs from the desired one.", "الإصدار العامل يختلف عن الإصدار المطلوب."],
  domains_unverified: ["A production domain is not verified.", "أحد نطاقات الإنتاج غير موثّق."],
  brand_not_published: ["The brand has not been published.", "لم تُنشر العلامة التجارية."],
  release_withdrawn: ["The release was withdrawn.", "سُحب الإصدار."],
  migrations_missing: ["Required database migrations are not applied.", "ترحيلات قاعدة البيانات المطلوبة غير مطبّقة."],
  migration_state_unknown: ["Applied migrations cannot be read.", "تعذّرت قراءة الترحيلات المطبّقة."],
  config_schema_regression: ["The instance uses a newer configuration schema.", "تستخدم النسخة مخطط إعدادات أحدث."],
  rollout_in_progress: ["Another rollout is already moving this instance.", "عملية نشر أخرى تنقل هذه النسخة بالفعل."],
  previous_release_unknown: ["The previous release is not registered, so it cannot be restored.", "الإصدار السابق غير مسجّل، لذا لا يمكن استعادته."],
};

export const statusCopy: Record<string, Copy> = {
  active: ["Active", "نشط"], suspended: ["Suspended", "معلّق"], closed: ["Closed", "مغلق"],
  provisioning: ["Provisioning", "قيد التهيئة"],
  none: ["No subscription", "بلا اشتراك"], trialing: ["Trial", "تجريبي"], past_due: ["Past due", "متأخر السداد"],
  cancelled: ["Cancelled", "ملغى"],
  requested: ["Requested", "مطلوب"], validated: ["Validated", "تم التحقق"], tenant_created: ["Records created", "أُنشئت السجلات"],
  repository_seeded: ["Repository seeded", "تمت تهيئة المستودع"], config_committed: ["Configuration committed", "تم حفظ الإعدادات"],
  projects_created: ["Projects created", "أُنشئت المشاريع"], environment_configured: ["Environment configured", "تمت تهيئة البيئة"],
  domain_pending: ["Waiting for domain", "بانتظار النطاق"], domain_deployed: ["Domain deployed", "تم نشر النطاق"],
  health_checked: ["Health checked", "تم فحص الحالة"], failed: ["Failed", "فشل"], deactivated: ["Deactivated", "معطّل"],
  pending: ["Pending", "معلّق الانتظار"], running: ["Running", "قيد التنفيذ"], waiting: ["Waiting", "بانتظار"],
  succeeded: ["Succeeded", "نجح"], skipped: ["Skipped", "متخطّى"], queued: ["Queued", "في قائمة الانتظار"],
  awaiting_approval: ["Awaiting approval", "بانتظار الموافقة"],
  draft: ["Draft", "مسودة"], paused: ["Paused", "متوقف مؤقتًا"], completed: ["Completed", "مكتمل"],
  rolled_back: ["Rolled back", "تم التراجع"], rollback_queued: ["Rollback queued", "التراجع في الانتظار"],
  healthy: ["Healthy", "سليم"], degraded: ["Degraded", "متراجع"], failing: ["Failing", "متعطل"],
  unknown: ["Not observed", "لم تُرصد"], stale: ["Stale", "قديمة"], fresh: ["Current", "حديثة"], never: ["Never observed", "لم تُرصد أبدًا"],
  not_configured: ["Not configured", "غير مهيأ"], configured: ["Configured, not checked", "مهيأ، لم يُفحص"],
  reachable: ["Reachable, not verified", "يمكن الوصول إليه، غير موثّق"], verified: ["Verified in operation", "موثّق أثناء التشغيل"],
  expired: ["Expired", "منتهي"], revoked: ["Revoked", "ملغى الوصول"],
  denied: ["Denied", "مرفوض"],
  available: ["Available", "متاح"], withdrawn: ["Withdrawn", "مسحوب"],
  internal: ["Internal", "داخلي"], candidate: ["Candidate", "مرشّح"], stable: ["Stable", "مستقر"],
  canary: ["Canary", "تجريبي مبكر"], early: ["Early", "مبكر"], general: ["General", "عام"],
  disabled: ["Disabled", "معطّل"],
  claimed: ["Claimed by a worker", "استلمها عامل"], retried: ["Retried", "أُعيدت المحاولة"],
  activation_blocked: ["Activation blocked", "مُنع التفعيل"], activated: ["Activated", "تم التفعيل"],
  reconciled: ["Reconciled", "تمت المعالجة"], enqueued: ["Queued", "أُضيفت للانتظار"], approved: ["Approved", "تمت الموافقة"],
};

export function statusTone(status: string | null | undefined): "neutral" | "positive" | "warning" | "danger" {
  switch (status) {
    case "active": case "succeeded": case "healthy": case "verified": case "completed": case "available":
    case "fresh": case "rolled_back":
      return "positive";
    case "failed": case "failing": case "suspended": case "denied": case "past_due": case "closed": case "withdrawn":
      return "danger";
    case "waiting": case "queued": case "paused": case "degraded": case "stale": case "pending": case "domain_pending":
    case "awaiting_approval": case "trialing": case "rollback_queued": case "reachable": case "configured":
    case "unknown": case "never": case "not_configured": case "running": case "provisioning":
      return "warning";
    default:
      return "neutral";
  }
}

export const roleCopy: Record<string, Copy> = {
  viewer: ["Viewer", "مشاهد"],
  operator: ["Operator", "مشغّل"],
  admin: ["Administrator", "مسؤول"],
  break_glass: ["Break-glass", "وصول الطوارئ"],
};
```

The existing `getAdminMessage`/`AdminMessageKey` exports are removed; Task 12 rewrites every caller (`layout.tsx`, `not-found.tsx`, `login`, `mfa-enroll`, `create-tenant-form.tsx`). Until then `typecheck` fails — Task 10 and Task 12 land together if executed by different agents; otherwise keep `getAdminMessage` temporarily by adding at the bottom of `copy.ts`:
```ts
/** @deprecated removed in Task 12 */
export function getAdminMessage(locale: Locale, key: string): string {
  return say(locale, (shellCopy as unknown as Record<string, Copy>)[key] ?? shellCopy.brand);
}
```
and delete it in Task 12 Step 9.

- [ ] **Step 4: Run the test to verify it passes**

Run: `rtk pnpm --filter @wlbp/platform-admin test:unit`
Expected: PASS (4 tests + existing `route.test.ts`).

- [ ] **Step 5: Commit**

```bash
rtk git add apps/platform-admin/app/_lib/copy.ts apps/platform-admin/app/_lib/copy.test.ts
rtk git commit -m "Hold Platform Admin copy as checked English/Arabic pairs"
```

### Task 11: Operator data access, action runner, list URL state

**Files:**
- Modify: `apps/platform-admin/app/_lib/platform-admin-server.ts` (cookie writes tolerate server components)
- Create: `apps/platform-admin/app/_lib/operator-api.ts`
- Create: `apps/platform-admin/app/_lib/operator-errors.ts`
- Create: `apps/platform-admin/app/_lib/operator-errors.test.ts`
- Create: `apps/platform-admin/app/_lib/operator-page.ts`
- Create: `apps/platform-admin/app/_lib/operator-action.ts`
- Create: `apps/platform-admin/app/_lib/form-data.ts`
- Create: `apps/platform-admin/app/_lib/list-params.ts`
- Create: `apps/platform-admin/app/_lib/list-params.test.ts`

**Interfaces:**
- Consumes: regenerated `Database` type (Task 8), `loadOperatorSession` (existing).
- Produces:
  ```ts
  // operator-errors.ts (pure, unit-tested)
  export const operatorErrorCodes: readonly string[];
  export type OperatorErrorCode = string; // one of operatorErrorCodes
  export function operatorErrorCode(error: { message?: string | null; code?: string | null }): OperatorErrorCode;
  // operator-api.ts (server-only)
  export type OperatorFunction = keyof Database["api_v1"]["Functions"];
  export type RpcArgs<F>; export type RpcReturn<F>; export type RpcRow<F>;
  export type OperatorResult<T> = { ok: true; data: T } | { ok: false; code: OperatorErrorCode };
  export async function callOperator<F extends OperatorFunction>(fn: F, args?: RpcArgs<F>): Promise<OperatorResult<RpcReturn<F>>>;
  // operator-page.ts (server-only)
  export type OperatorRole = "viewer" | "operator" | "admin" | "break_glass";
  export type OperatorContext = { operatorId: string; email: string; role: OperatorRole; expiresAt: string | null; stepUpSeconds: number };
  export type OperatorAccess = { kind: "ready"; operator: OperatorContext } | { kind: "denied" } | { kind: "unavailable" } | { kind: "configuration-missing" };
  export const loadOperatorAccess: (locale: Locale) => Promise<OperatorAccess>; // React cache(); redirects signed-out / MFA
  export async function getOperator(locale: Locale): Promise<OperatorContext | null>;
  export function atLeast(role: OperatorRole, minimum: "viewer" | "operator" | "admin"): boolean;
  // operator-action.ts (server-only)
  export type ActionResult = { kind: "idle" } | { kind: "success"; code: string; values?: Record<string, string>; href?: string; download?: { filename: string; body: string } } | { kind: "error"; code: OperatorErrorCode; reasons?: string[] } | { kind: "step-up" };
  export const idle: ActionResult;
  export async function runOperatorAction<F extends OperatorFunction>(input: { action: string; fn: F; args: RpcArgs<F>; tenantId?: string | null; targetKind?: string; targetId?: string }): Promise<{ result: ActionResult; data?: RpcReturn<F> }>;
  // form-data.ts
  export function text(form: FormData, name: string): string;          // trimmed, "" when absent
  export function optional(form: FormData, name: string): string | undefined; // undefined when blank
  export function asUuid(value: string | undefined): string | undefined;
  export function uuid(form: FormData, name: string): string | undefined;
  export function integer(form: FormData, name: string): number | undefined;
  export function instant(form: FormData, name: string): string | undefined; // datetime-local (UTC) → ISO
  export function lines(form: FormData, name: string): string[];
  export function localeOf(form: FormData): Locale;
  // list-params.ts (pure)
  export type ListSpec = { sorts?: readonly string[]; defaultSort?: string; filters?: Record<string, readonly string[] | "uuid" | "text" | "date">; pageSize?: number };
  export type ListParams = { q: string; page: number; sort: string; defaultSort: string; filters: Record<string, string>; pageSize: number; offset: number };
  export function parseListParams(raw: Record<string, string | string[] | undefined>, spec: ListSpec): ListParams;
  export function listHref(path: string, params: ListParams, overrides?: { q?: string; page?: number; sort?: string; filters?: Record<string, string> }): string;
  ```

- [ ] **Step 1: Write the failing tests**

`apps/platform-admin/app/_lib/operator-errors.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { errorCopy } from "./copy";
import { operatorErrorCode, operatorErrorCodes } from "./operator-errors";

describe("operatorErrorCode", () => {
  it("passes through a known database message", () => {
    expect(operatorErrorCode({ message: "last_admin_protected", code: "42501" })).toBe("last_admin_protected");
  });
  it("maps an unknown permission error to policy_denied", () => {
    expect(operatorErrorCode({ message: "permission denied for function x", code: "42501" })).toBe("policy_denied");
    expect(operatorErrorCode({ message: "JWT expired", code: "PGRST301" })).toBe("policy_denied");
  });
  it("never leaks an unknown message", () => {
    expect(operatorErrorCode({ message: "connect ECONNREFUSED 127.0.0.1:56521" })).toBe("unavailable");
  });
  it("has copy for every code it can return", () => {
    for (const code of operatorErrorCodes) expect(errorCopy).toHaveProperty(code);
  });
});
```

`apps/platform-admin/app/_lib/list-params.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { listHref, parseListParams } from "./list-params";

const spec = {
  sorts: ["name", "-name", "-created"],
  defaultSort: "-created",
  filters: { status: ["active", "suspended"], tenant: "uuid", from: "date" },
  pageSize: 25,
} as const;

describe("parseListParams", () => {
  it("keeps valid values and computes the offset", () => {
    const p = parseListParams({ q: "  north ", page: "3", sort: "name", status: "active" }, spec);
    expect(p).toMatchObject({ q: "north", page: 3, sort: "name", offset: 50, filters: { status: "active" } });
  });
  it("drops anything not allow-listed", () => {
    const p = parseListParams(
      { page: "-4", sort: "drop table", status: "deleted", tenant: "not-a-uuid", from: "2026-13-40", extra: "x" },
      spec,
    );
    expect(p).toMatchObject({ page: 1, sort: "-created", filters: {} });
  });
  it("accepts a uuid and a civil date", () => {
    const p = parseListParams({ tenant: "A0000000-0000-0000-0000-000000000001", from: "2026-10-06" }, spec);
    expect(p.filters).toEqual({ tenant: "a0000000-0000-0000-0000-000000000001", from: "2026-10-06" });
  });
  it("caps search length and uses the first repeated value", () => {
    expect(parseListParams({ q: ["a".repeat(300), "b"] }, spec).q).toHaveLength(100);
  });
});

describe("listHref", () => {
  it("omits defaults and resets the page when filters change", () => {
    const p = parseListParams({ q: "x", page: "4", status: "active" }, spec);
    expect(listHref("/en/tenants", p, { filters: { status: "suspended" } })).toBe(
      "/en/tenants?q=x&status=suspended",
    );
    expect(listHref("/en/tenants", p, { page: 5 })).toBe("/en/tenants?q=x&status=active&page=5");
    expect(listHref("/en/tenants", parseListParams({}, spec))).toBe("/en/tenants");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `rtk pnpm --filter @wlbp/platform-admin test:unit`
Expected: FAIL — cannot resolve `./operator-errors` and `./list-params`.

- [ ] **Step 3: Implement the pure modules**

`apps/platform-admin/app/_lib/operator-errors.ts`:
```ts
/** Every stable code the operator RPCs raise, plus the two the app adds. */
export const operatorErrorCodes = [
  "policy_denied", "recent_authentication_required", "not_found", "stale_revision",
  "reason_required", "name_invalid", "tenant_name_invalid", "brand_key_invalid",
  "confirmation_mismatch", "suspend_before_closure", "transition_not_allowed", "job_running",
  "attempts_exhausted", "plan_exists", "plan_invalid", "plan_unknown", "entitlement_invalid",
  "ends_at_required", "expiry_invalid", "release_exists", "release_invalid", "no_targets",
  "rollback_not_supported", "account_not_found", "operator_exists", "last_admin_protected",
  "self_grant_denied", "second_operator_required", "self_approval_denied", "hostname_invalid",
  "domain_taken", "flag_invalid", "reference_invalid", "idempotency_conflict",
  "idempotency_key_invalid", "secret_rejected", "settings_invalid",
  "configuration_missing", "unavailable",
] as const;

export type OperatorErrorCode = (typeof operatorErrorCodes)[number];

const known = new Set<string>(operatorErrorCodes);

export function operatorErrorCode(error: { message?: string | null; code?: string | null }): OperatorErrorCode {
  const message = error.message?.trim() ?? "";
  if (known.has(message)) return message as OperatorErrorCode;
  // Anything else is a driver or network message; it may quote hosts or SQL,
  // so it is never shown. Permission failures still read as permission failures.
  if (error.code === "42501" || error.code === "PGRST301" || error.code === "PGRST302") return "policy_denied";
  return "unavailable";
}
```

`apps/platform-admin/app/_lib/list-params.ts`:
```ts
export type ListSpec = {
  sorts?: readonly string[];
  defaultSort?: string;
  filters?: Record<string, readonly string[] | "uuid" | "text" | "date">;
  pageSize?: number;
};

export type ListParams = {
  q: string;
  page: number;
  sort: string;
  defaultSort: string;
  filters: Record<string, string>;
  pageSize: number;
  offset: number;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const datePattern = /^\d{4}-\d{2}-\d{2}$/u;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function validDate(value: string): boolean {
  if (!datePattern.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export function parseListParams(
  raw: Record<string, string | string[] | undefined>,
  spec: ListSpec,
): ListParams {
  const pageSize = spec.pageSize ?? 25;
  const page = Math.min(Math.max(Number.parseInt(first(raw.page), 10) || 1, 1), 1000);
  const defaultSort = spec.defaultSort ?? "";
  const requestedSort = first(raw.sort);
  const sort = spec.sorts?.includes(requestedSort) ? requestedSort : defaultSort;
  const filters: Record<string, string> = {};
  for (const [name, rule] of Object.entries(spec.filters ?? {})) {
    const value = first(raw[name]).trim();
    if (!value) continue;
    if (rule === "uuid") {
      if (uuidPattern.test(value.toLowerCase())) filters[name] = value.toLowerCase();
    } else if (rule === "date") {
      if (validDate(value)) filters[name] = value;
    } else if (rule === "text") {
      filters[name] = value.slice(0, 100);
    } else if (rule.includes(value)) {
      filters[name] = value;
    }
  }
  return {
    q: first(raw.q).trim().slice(0, 100),
    page,
    sort,
    defaultSort,
    filters,
    pageSize,
    offset: (page - 1) * pageSize,
  };
}

/** Shareable URL for a list; defaults are omitted and any change returns to page 1. */
export function listHref(
  path: string,
  params: ListParams,
  overrides: { q?: string; page?: number; sort?: string; filters?: Record<string, string> } = {},
): string {
  const search = new URLSearchParams();
  const q = overrides.q ?? params.q;
  if (q) search.set("q", q);
  for (const [name, value] of Object.entries({ ...params.filters, ...overrides.filters })) {
    if (value) search.set(name, value);
  }
  const sort = overrides.sort ?? params.sort;
  if (sort && sort !== params.defaultSort) search.set("sort", sort);
  const resetPage =
    overrides.filters !== undefined || overrides.q !== undefined || overrides.sort !== undefined;
  const page = overrides.page ?? (resetPage ? 1 : params.page);
  if (page > 1) search.set("page", String(page));
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}
```

- [ ] **Step 4: Run the pure tests to verify they pass**

Run: `rtk pnpm --filter @wlbp/platform-admin test:unit`
Expected: PASS for `operator-errors.test.ts` and `list-params.test.ts`.

- [ ] **Step 5: Let server components read without writing cookies**

In `apps/platform-admin/app/_lib/platform-admin-server.ts`, replace the `setAll` body of `createPlatformAdminRequestClient` with:
```ts
      setAll: async (values) => {
        // Server components cannot set cookies; the proxy (Task 12) refreshes
        // the session on every request, and server actions can write.
        try {
          for (const cookie of values) {
            cookieStore.set(cookie.name, cookie.value, cookie.options);
          }
        } catch {
          /* read-only render */
        }
      },
```

- [ ] **Step 6: Implement the server modules**

`apps/platform-admin/app/_lib/operator-api.ts`:
```ts
import "server-only";

import type { Database } from "@wlbp/supabase-client";
import { createPlatformAdminRequestClient } from "./platform-admin-server";
import { operatorErrorCode, type OperatorErrorCode } from "./operator-errors";

type Functions = Database["api_v1"]["Functions"];
export type OperatorFunction = keyof Functions;
export type RpcArgs<F extends OperatorFunction> = Functions[F]["Args"];
export type RpcReturn<F extends OperatorFunction> = Functions[F]["Returns"];
export type RpcRow<F extends OperatorFunction> = RpcReturn<F> extends readonly (infer R)[] ? R : never;
export type OperatorResult<T> = { ok: true; data: T } | { ok: false; code: OperatorErrorCode };

type LooseRpc = (fn: string, args: object) => PromiseLike<{
  data: unknown;
  error: { message?: string | null; code?: string | null } | null;
}>;

/** Drops undefined so the database default applies instead of an explicit null. */
function defined(args: object): object {
  return Object.fromEntries(Object.entries(args).filter(([, value]) => value !== undefined));
}

export async function callOperator<F extends OperatorFunction>(
  fn: F,
  args?: RpcArgs<F>,
): Promise<OperatorResult<RpcReturn<F>>> {
  const client = await createPlatformAdminRequestClient();
  if (client === null) return { ok: false, code: "configuration_missing" };
  try {
    const rpc = client.rpc.bind(client) as unknown as LooseRpc;
    const { data, error } = await rpc(fn, defined(args ?? {}));
    if (error) return { ok: false, code: operatorErrorCode(error) };
    return { ok: true, data: data as RpcReturn<F> };
  } catch {
    return { ok: false, code: "unavailable" };
  }
}
```

`apps/platform-admin/app/_lib/operator-page.ts`:
```ts
import "server-only";

import type { Locale } from "@wlbp/i18n";
import { redirect } from "next/navigation";
import { cache } from "react";
import { callOperator } from "./operator-api";
import { loadOperatorSession } from "./platform-admin-server";

export type OperatorRole = "viewer" | "operator" | "admin" | "break_glass";
export type OperatorContext = {
  operatorId: string;
  email: string;
  role: OperatorRole;
  expiresAt: string | null;
  stepUpSeconds: number;
};
export type OperatorAccess =
  | { kind: "ready"; operator: OperatorContext }
  | { kind: "denied" }
  | { kind: "unavailable" }
  | { kind: "configuration-missing" };

const rank: Record<OperatorRole, number> = { viewer: 0, operator: 1, admin: 2, break_glass: 3 };

export function atLeast(role: OperatorRole, minimum: "viewer" | "operator" | "admin"): boolean {
  return rank[role] >= rank[minimum];
}

/**
 * One decision per request: the layout and every page share it through
 * React's cache. Signed-out and MFA states redirect; everything else is data.
 */
export const loadOperatorAccess = cache(async (locale: Locale): Promise<OperatorAccess> => {
  const { state } = await loadOperatorSession();
  if (state.kind === "configuration-missing") return { kind: "configuration-missing" };
  if (state.kind === "signed-out") redirect(`/${locale}/login`);
  if (state.kind === "mfa-enrollment-required") redirect(`/${locale}/mfa-enroll`);
  if (state.kind === "step-up-required") redirect(`/${locale}/login?step=mfa`);

  const result = await callOperator("get_operator_context_v1");
  if (!result.ok) return { kind: result.code === "policy_denied" ? "denied" : "unavailable" };
  const row = result.data[0];
  if (!row) return { kind: "denied" };
  return {
    kind: "ready",
    operator: {
      operatorId: row.operator_id,
      email: row.email,
      role: row.role as OperatorRole,
      expiresAt: row.expires_at,
      stepUpSeconds: row.step_up_seconds,
    },
  };
});

/** For pages: the layout already rendered any non-ready state. */
export async function getOperator(locale: Locale): Promise<OperatorContext | null> {
  const access = await loadOperatorAccess(locale);
  return access.kind === "ready" ? access.operator : null;
}
```

`apps/platform-admin/app/_lib/operator-action.ts`:
```ts
import "server-only";

import { revalidatePath } from "next/cache";
import { callOperator, type OperatorFunction, type RpcArgs, type RpcReturn } from "./operator-api";
import type { OperatorErrorCode } from "./operator-errors";

export type ActionResult =
  | { kind: "idle" }
  | {
      kind: "success";
      code: string;
      values?: Record<string, string>;
      href?: string;
      download?: { filename: string; body: string };
    }
  | { kind: "error"; code: OperatorErrorCode; reasons?: string[] }
  | { kind: "step-up" };

export const idle: ActionResult = { kind: "idle" };

const notRecorded = new Set<OperatorErrorCode>(["configuration_missing", "unavailable"]);

/**
 * Runs one operator RPC. A refused or failed call rolls back its own audit
 * row, so the attempt is recorded afterwards (best effort: recording must never
 * turn a clear error into a confusing one).
 */
export async function runOperatorAction<F extends OperatorFunction>(input: {
  action: string;
  fn: F;
  args: RpcArgs<F>;
  tenantId?: string | null;
  targetKind?: string;
  targetId?: string;
}): Promise<{ result: ActionResult; data?: RpcReturn<F> }> {
  const outcome = await callOperator(input.fn, input.args);
  if (outcome.ok) {
    revalidatePath("/", "layout");
    return { result: { kind: "success", code: input.action }, data: outcome.data };
  }
  if (!notRecorded.has(outcome.code)) {
    await callOperator("record_operator_failure_v1", {
      p_action: input.action,
      p_error_code: outcome.code,
      p_tenant_id: input.tenantId ?? undefined,
      p_target_kind: input.targetKind,
      p_target_id: input.targetId,
    });
  }
  if (outcome.code === "recent_authentication_required") return { result: { kind: "step-up" } };
  return { result: { kind: "error", code: outcome.code } };
}
```

`apps/platform-admin/app/_lib/form-data.ts`:
```ts
import { isLocale, type Locale } from "@wlbp/i18n";

export function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export function optional(form: FormData, name: string): string | undefined {
  return text(form, name) || undefined;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export function asUuid(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? "";
  return uuidPattern.test(trimmed) ? trimmed.toLowerCase() : undefined;
}

export function uuid(form: FormData, name: string): string | undefined {
  return asUuid(text(form, name));
}

export function integer(form: FormData, name: string): number | undefined {
  const value = Number.parseInt(text(form, name), 10);
  return Number.isFinite(value) ? value : undefined;
}

/** `<input type="datetime-local">` values are entered and shown in UTC. */
export function instant(form: FormData, name: string): string | undefined {
  const value = text(form, name);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(value)) return undefined;
  const date = new Date(`${value}:00Z`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function lines(form: FormData, name: string): string[] {
  return text(form, name)
    .split(/[\n,]/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function localeOf(form: FormData): Locale {
  const value = text(form, "locale");
  return isLocale(value) ? value : "en";
}
```

- [ ] **Step 7: Verify types against the regenerated contract**

Run: `rtk pnpm --filter @wlbp/platform-admin typecheck`
Expected: PASS. If `row.operator_id` etc. are not found, `database.types.ts` was not regenerated after Task 7; rerun Task 8 Step 2.

- [ ] **Step 8: Commit**

```bash
rtk git add apps/platform-admin/app/_lib/operator-api.ts apps/platform-admin/app/_lib/operator-errors.ts \
  apps/platform-admin/app/_lib/operator-errors.test.ts apps/platform-admin/app/_lib/operator-page.ts \
  apps/platform-admin/app/_lib/operator-action.ts apps/platform-admin/app/_lib/form-data.ts \
  apps/platform-admin/app/_lib/list-params.ts apps/platform-admin/app/_lib/list-params.test.ts \
  apps/platform-admin/app/_lib/platform-admin-server.ts
rtk git commit -m "Route every Platform Admin read and write through one operator boundary"
```

### Task 12: Shell, session refresh, auth pages, UI primitives

**Files:**
- Create: `apps/platform-admin/app/_lib/navigation.ts`, `navigation.test.ts`
- Create: `apps/platform-admin/app/_lib/auth-copy.ts`
- Create: `apps/platform-admin/app/_lib/shell/sidebar-nav.tsx`, `mobile-menu.tsx`, `locale-switch.tsx`, `page-header.tsx`
- Create: `apps/platform-admin/app/_lib/ui/states.tsx`, `select-field.tsx`, `status-badge.tsx`, `facts.tsx`, `time.tsx`, `data-table.tsx`, `pagination.tsx`, `filter-bar.tsx`, `operator-form.tsx`, `action-dialog.tsx`, `step-up.ts`, `step-up-prompt.tsx`
- Create: `apps/platform-admin/app/[locale]/(console)/layout.tsx`, `app/[locale]/(console)/loading.tsx`
- Create: `apps/platform-admin/app/[locale]/sign-out/route.ts`
- Modify: `apps/platform-admin/proxy.ts`, `app/[locale]/layout.tsx`, `app/[locale]/not-found.tsx`, `app/[locale]/login/page.tsx`, `app/[locale]/mfa-enroll/page.tsx`, `app/_lib/copy.test.ts`, `app/_lib/copy.ts` (remove the `getAdminMessage` shim if added)
- Delete: `apps/platform-admin/app/[locale]/page.tsx`, `app/[locale]/create-tenant-form.tsx`, `app/_lib/tenant-actions.ts` (tenant creation returns in Task 14; the overview in Task 13)

**Interfaces:**
- Consumes: Task 10 copy, Task 11 access/actions.
- Produces (used by every page task):
  ```ts
  // navigation.ts
  export type NavItemKey = "overview" | "tenants" | "instances" | "domains" | "provisioning" | "jobs" | "plans" | "subscriptions" | "releases" | "rollouts" | "health" | "support" | "operators" | "audit" | "settings";
  export function navHref(locale: Locale, item: NavItemKey): string;
  export function isActive(pathname: string, href: string, locale: Locale): boolean;
  export function getNavigation(locale: Locale): { group: string; label: string; items: { key: NavItemKey; href: string; label: string }[] }[];
  // shell/page-header.tsx
  export function PageHeader(props: { locale: Locale; title: string; description?: string; breadcrumbs?: readonly (readonly [label: string, href?: string])[]; actions?: ReactNode }): JSX.Element;
  // ui/*.tsx
  export function EmptyState(props: { locale: Locale; filtered?: boolean; title?: string; body?: string; action?: ReactNode }): JSX.Element;
  export function UnavailableState(props: { locale: Locale; code?: string }): JSX.Element;
  export function Unknown(props: { locale: Locale; kind?: "notObserved" | "notReported" | "never" | "unknown" | "none" }): JSX.Element;
  export function StatusBadge(props: { locale: Locale; status: string | null | undefined }): JSX.Element;
  export function RoleBadge(props: { locale: Locale; role: string }): JSX.Element;
  export function Facts(props: { items: readonly (readonly [label: string, value: ReactNode])[] }): JSX.Element;
  export function TimeValue(props: { locale: Locale; value: string | null | undefined; staleAfterMinutes?: number; empty?: "never" | "notObserved" | "notReported" | "none" }): JSX.Element;
  export type Column = { label: string; sort?: string; numeric?: boolean };
  export function DataTable(props: { id: string; locale: Locale; caption: string; columns: readonly Column[]; rows: readonly { key: string; cells: readonly ReactNode[] }[]; sort?: string; sortHref?: (sort: string) => string }): JSX.Element;
  export function Pagination(props: { locale: Locale; page: number; pageSize: number; total: number; href: (page: number) => string }): JSX.Element;
  export function FilterBar(props: { locale: Locale; path: string; search?: { label: string; value: string }; children?: ReactNode }): JSX.Element;
  export function SelectField(props: { name: string; label: string; options: readonly (readonly [value: string, label: string])[]; value?: string; required?: boolean }): JSX.Element;
  export function SelectFilter(props: { name: string; label: string; value: string | undefined; options: readonly (readonly [value: string, label: string])[]; allLabel: string }): JSX.Element;
  export type FormAction = (previous: ActionResult, form: FormData) => Promise<ActionResult>;
  export function OperatorForm(props: { locale: Locale; action: FormAction; submit: string; successMessage: string; danger?: boolean; children?: ReactNode; onSuccess?: () => void; submitDisabled?: boolean; className?: string }): JSX.Element;
  export function ActionDialog(props: { locale: Locale; action: FormAction; trigger: string; title: string; description?: string; submit: string; successMessage: string; danger?: boolean; triggerVariant?: "primary" | "secondary" | "quiet"; hidden?: Record<string, string>; reason?: { minLength: number }; confirmText?: string; children?: ReactNode }): JSX.Element;
  ```

- [ ] **Step 1: Write the failing navigation test**

`apps/platform-admin/app/_lib/navigation.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { getNavigation, isActive, navHref } from "./navigation";

describe("navigation", () => {
  it("lists every area once, grouped, with bilingual labels", () => {
    const en = getNavigation("en").flatMap((g) => g.items);
    const ar = getNavigation("ar").flatMap((g) => g.items);
    expect(new Set(en.map((i) => i.key)).size).toBe(15);
    expect(ar.every((i) => /[؀-ۿ]/u.test(i.label))).toBe(true);
  });
  it("builds locale-prefixed hrefs", () => {
    expect(navHref("ar", "overview")).toBe("/ar");
    expect(navHref("en", "tenants")).toBe("/en/tenants");
  });
  it("marks the overview active only on itself, others on their subtree", () => {
    expect(isActive("/en", "/en", "en")).toBe(true);
    expect(isActive("/en/tenants", "/en", "en")).toBe(false);
    expect(isActive("/en/tenants/abc", "/en/tenants", "en")).toBe(true);
    expect(isActive("/en/tenants-old", "/en/tenants", "en")).toBe(false);
  });
});
```

Run: `rtk pnpm --filter @wlbp/platform-admin test:unit`
Expected: FAIL — cannot resolve `./navigation`.

- [ ] **Step 2: Implement navigation**

`apps/platform-admin/app/_lib/navigation.ts`:
```ts
import type { Locale } from "@wlbp/i18n";
import { say, shellCopy } from "./copy";

const groups = [
  ["overview", ["overview"]],
  ["fleet", ["tenants", "instances", "domains", "provisioning", "jobs"]],
  ["commercial", ["plans", "subscriptions"]],
  ["releases", ["releases", "rollouts"]],
  ["operations", ["health", "support"]],
  ["administration", ["operators", "audit", "settings"]],
] as const;

export type NavItemKey = (typeof groups)[number][1][number];

export function navHref(locale: Locale, item: NavItemKey): string {
  return item === "overview" ? `/${locale}` : `/${locale}/${item}`;
}

export function isActive(pathname: string, href: string, locale: Locale): boolean {
  if (href === `/${locale}`) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function getNavigation(locale: Locale) {
  return groups.map(([group, items]) => ({
    group,
    label: say(locale, shellCopy.groups[group]),
    items: items.map((key) => ({ key, href: navHref(locale, key), label: say(locale, shellCopy.items[key]) })),
  }));
}
```

Run the test again. Expected: PASS.

- [ ] **Step 3: Refresh the session in the proxy**

`apps/platform-admin/proxy.ts` (full file; same session-refresh pattern as `apps/dashboard/proxy.ts`, plus no-store headers because every page is operator-private):
```ts
import { createContentSecurityPolicy } from "@wlbp/config";
import { createRequestScopedSupabaseClient } from "@wlbp/supabase-client/server";
import { type NextRequest, NextResponse } from "next/server";

function applyPrivateNoStoreHeaders(headers: Headers): void {
  headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  headers.set("CDN-Cache-Control", "no-store");
  headers.set("Expires", "0");
  headers.set("Pragma", "no-cache");
}

export async function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const policy = createContentSecurityPolicy(nonce, {
    connectSources: supabaseUrl ? [supabaseUrl] : [],
    development: process.env.NODE_ENV !== "production",
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  // Server components cannot write cookies, so a rotated refresh token must be
  // persisted here or the next request presents a token that was already used.
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (supabaseUrl && publishableKey) {
    const client = createRequestScopedSupabaseClient(
      { publishableKey, url: supabaseUrl },
      {
        getAll: () => request.cookies.getAll(),
        setAll: (values, cacheHeaders) => {
          for (const cookie of values) request.cookies.set(cookie.name, cookie.value);
          requestHeaders.set("cookie", request.cookies.toString());
          response = NextResponse.next({ request: { headers: requestHeaders } });
          for (const cookie of values) response.cookies.set(cookie.name, cookie.value, cookie.options);
          for (const [name, value] of Object.entries(cacheHeaders)) response.headers.set(name, value);
        },
      },
    );
    try {
      await client.auth.getClaims();
    } catch {
      // The page guard verifies identity again and fails closed.
    }
  }

  response.headers.set("Content-Security-Policy", policy);
  applyPrivateNoStoreHeaders(response.headers);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|fonts/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
```

- [ ] **Step 4: Auth and not-found copy**

`apps/platform-admin/app/_lib/auth-copy.ts`:
```ts
export const authCopy = {
  loginTitle: ["Sign in to Platform Admin", "تسجيل الدخول إلى إدارة المنصة"],
  email: ["Email", "البريد الإلكتروني"],
  password: ["Password", "كلمة المرور"],
  signIn: ["Sign in", "تسجيل الدخول"],
  signingIn: ["Signing in…", "جارٍ تسجيل الدخول…"],
  mfaTitle: ["Enter your authenticator code", "أدخل رمز تطبيق المصادقة"],
  code: ["6-digit code", "رمز من ٦ أرقام"],
  verify: ["Verify", "تحقق"],
  verifying: ["Verifying…", "جارٍ التحقق…"],
  errorTitle: ["Sign-in did not complete", "لم يكتمل تسجيل الدخول"],
  invalidCredentials: ["The email or password is not correct.", "البريد الإلكتروني أو كلمة المرور غير صحيحة."],
  invalidCode: ["That code was not accepted. Wait for a new code and try again.", "لم يُقبل هذا الرمز. انتظر رمزًا جديدًا وحاول مرة أخرى."],
  noFactor: ["This account has no verified authenticator. Set one up first.", "لا يوجد تطبيق مصادقة موثّق لهذا الحساب. أعدّه أولًا."],
  unavailable: ["The sign-in service did not answer. Try again.", "لم تستجب خدمة تسجيل الدخول. حاول مرة أخرى."],
  enrollTitle: ["Set up your authenticator app", "إعداد تطبيق المصادقة"],
  enrollBody: ["Platform Admin requires a second factor. Scan the QR code or enter the setup key in an authenticator app, then enter the 6-digit code it shows.",
    "تتطلب إدارة المنصة عاملًا ثانيًا. امسح رمز QR أو أدخل مفتاح الإعداد في تطبيق مصادقة، ثم أدخل الرمز المكوّن من ٦ أرقام."],
  enrollQr: ["QR code for your authenticator app", "رمز QR لتطبيق المصادقة"],
  enrollKey: ["Setup key", "مفتاح الإعداد"],
  enrollSubmit: ["Verify and enable", "تحقق وفعّل"],
  enrollFailed: ["The authenticator could not be set up. Reload to try again.", "تعذّر إعداد تطبيق المصادقة. أعد التحميل للمحاولة مجددًا."],
  preparing: ["Preparing a new setup key…", "جارٍ تجهيز مفتاح إعداد جديد…"],
  notFoundTitle: ["Page not found", "الصفحة غير موجودة"],
  notFoundBody: ["The address may be mistyped, or the record was removed.", "قد يكون العنوان خاطئًا، أو أُزيل السجل."],
  returnHome: ["Go to the overview", "الانتقال إلى النظرة العامة"],
} as const satisfies Record<string, readonly [string, string]>;
```

Add to `copy.test.ts` modules: `import * as auth from "./auth-copy";` and `{ shared, auth }`.

- [ ] **Step 5: Locale layout and not-found**

`apps/platform-admin/app/[locale]/layout.tsx` (full file):
```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getDirection, isLocale, type Locale } from "@wlbp/i18n";
import { say, shellCopy } from "../_lib/copy";
import "../globals.css";

type LocaleLayoutProps = Readonly<{ children: ReactNode; params: Promise<{ locale: string }> }>;

export const dynamic = "force-dynamic";

function requireLocale(value: string): Locale {
  if (!isLocale(value)) notFound();
  return value;
}

export async function generateMetadata({ params }: LocaleLayoutProps): Promise<Metadata> {
  const locale = requireLocale((await params).locale);
  return {
    title: { default: `${say(locale, shellCopy.brand)} · ${say(locale, shellCopy.brandDetail)}`, template: `%s · ${say(locale, shellCopy.brand)}` },
    robots: { index: false, follow: false },
  };
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const locale = requireLocale((await params).locale);
  return (
    <html lang={locale} dir={getDirection(locale)}>
      <body>{children}</body>
    </html>
  );
}
```

`apps/platform-admin/app/[locale]/not-found.tsx` (full file — it renders without a known locale, so it shows both languages):
```tsx
import Link from "next/link";
import { authCopy } from "../_lib/auth-copy";

export default function NotFound() {
  return (
    <main className="not-found">
      <h1>
        <span lang="en">{authCopy.notFoundTitle[0]}</span>
        <span aria-hidden="true"> · </span>
        <span lang="ar" dir="rtl">{authCopy.notFoundTitle[1]}</span>
      </h1>
      <p lang="en">{authCopy.notFoundBody[0]}</p>
      <p lang="ar" dir="rtl">{authCopy.notFoundBody[1]}</p>
      <p>
        <Link href="/en" lang="en">{authCopy.returnHome[0]}</Link>
        {" · "}
        <Link href="/ar" lang="ar">{authCopy.returnHome[1]}</Link>
      </p>
    </main>
  );
}
```

- [ ] **Step 6: Shell components**

`apps/platform-admin/app/_lib/shell/sidebar-nav.tsx`:
```tsx
"use client";

import type { Locale } from "@wlbp/i18n";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActive } from "../navigation";

type Group = { group: string; label: string; items: { key: string; href: string; label: string }[] };

export function SidebarNav({ locale, groups, label }: { locale: Locale; groups: Group[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label}>
      {groups.map((group) => (
        <div className="nav-group" key={group.group}>
          <h2 id={`nav-${group.group}`}>{group.label}</h2>
          <ul aria-labelledby={`nav-${group.group}`}>
            {group.items.map((item) => (
              <li key={item.key}>
                <Link href={item.href} aria-current={isActive(pathname, item.href, locale) ? "page" : undefined}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
```

`apps/platform-admin/app/_lib/shell/mobile-menu.tsx`:
```tsx
"use client";

import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/** Below 52rem the sidebar collapses behind an explicit disclosure button. */
export function MobileMenu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button ref={button} type="button" className="wlbp-button wlbp-button--secondary menu-toggle"
        aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}>
        {label}
      </button>
      <div id={id} className={`console-menu${open ? " is-open" : ""}`}>{children}</div>
    </>
  );
}
```
Add to `globals.css` under `@media (max-width: 52rem)` nothing more; above 52rem `.console-menu` must always show, so add outside the media query: `.console-menu { display: block; }` before the media block (the media block's `display: none` then wins on small screens).

`apps/platform-admin/app/_lib/shell/locale-switch.tsx`:
```tsx
"use client";

import type { Locale } from "@wlbp/i18n";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export function LocaleSwitch({ locale, label, names }: { locale: Locale; label: string; names: { en: string; ar: string } }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const hrefFor = (target: Locale) => {
    const rest = pathname.replace(/^\/(en|ar)(?=\/|$)/u, "");
    return `/${target}${rest}${search ? `?${search}` : ""}`;
  };
  return (
    <nav className="locale-switch" aria-label={label}>
      {(["en", "ar"] as const).map((target) => (
        <Link key={target} href={hrefFor(target)} lang={target} hrefLang={target}
          aria-current={target === locale ? "true" : undefined}>
          <span aria-hidden="true">{target === "en" ? "EN" : "عربي"}</span>
          <span className="sr-only">{names[target]}</span>
        </Link>
      ))}
    </nav>
  );
}
```

`apps/platform-admin/app/_lib/shell/page-header.tsx`:
```tsx
import type { Locale } from "@wlbp/i18n";
import Link from "next/link";
import type { ReactNode } from "react";
import { say, shellCopy } from "../copy";

export function PageHeader({
  locale, title, description, breadcrumbs, actions,
}: {
  locale: Locale;
  title: string;
  description?: string;
  breadcrumbs?: readonly (readonly [label: string, href?: string])[];
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {breadcrumbs?.length ? (
          <nav className="breadcrumbs" aria-label={say(locale, shellCopy.breadcrumbs)}>
            <ol>
              {breadcrumbs.map(([label, href]) => (
                <li key={label}>{href ? <Link href={href}>{label}</Link> : <span aria-current="page">{label}</span>}</li>
              ))}
            </ol>
          </nav>
        ) : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}
```

- [ ] **Step 7: The console layout (guard + shell)**

`apps/platform-admin/app/[locale]/(console)/layout.tsx`:
```tsx
import { isLocale } from "@wlbp/i18n";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { fill, roleCopy, say, shellCopy, stateCopy } from "../../_lib/copy";
import { getNavigation } from "../../_lib/navigation";
import { loadOperatorAccess } from "../../_lib/operator-page";
import { LocaleSwitch } from "../../_lib/shell/locale-switch";
import { MobileMenu } from "../../_lib/shell/mobile-menu";
import { SidebarNav } from "../../_lib/shell/sidebar-nav";

export const dynamic = "force-dynamic";

export default async function ConsoleLayout({
  children, params,
}: Readonly<{ children: ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw;
  const access = await loadOperatorAccess(locale);
  const signOut = (
    <form method="post" action={`/${locale}/sign-out`}>
      <button type="submit" className="wlbp-button wlbp-button--secondary">{say(locale, shellCopy.signOut)}</button>
    </form>
  );

  if (access.kind !== "ready") {
    const [title, body] =
      access.kind === "denied" ? [stateCopy.deniedTitle, stateCopy.deniedBody]
      : access.kind === "configuration-missing" ? [stateCopy.configurationTitle, stateCopy.configurationBody]
      : [stateCopy.unavailableTitle, stateCopy.unavailableBody];
    return (
      <main className="auth-shell">
        <section className={`auth-card state--${access.kind}`} aria-labelledby="state-title">
          <h1 id="state-title">{say(locale, title)}</h1>
          <p>{say(locale, body)}</p>
          {access.kind === "configuration-missing" ? null : signOut}
        </section>
      </main>
    );
  }

  const { operator } = access;
  return (
    <div className="console">
      <a className="skip-link" href="#content">{say(locale, shellCopy.skip)}</a>
      <aside className="console-sidebar">
        <Link className="console-brand" href={`/${locale}`}>
          <span>
            {say(locale, shellCopy.brand)}
            <small>{say(locale, shellCopy.brandDetail)}</small>
          </span>
        </Link>
        <MobileMenu label={say(locale, shellCopy.menu)}>
          <SidebarNav locale={locale} groups={getNavigation(locale)} label={say(locale, shellCopy.navigation)} />
        </MobileMenu>
      </aside>
      <div className="console-main">
        <header className="console-header">
          <span className="operator">
            {fill(locale, shellCopy.signedInAs, { email: operator.email, role: say(locale, roleCopy[operator.role] ?? roleCopy.viewer) })}
          </span>
          <Link href={`/${locale}/account`}>{say(locale, shellCopy.account)}</Link>
          <Suspense>
            <LocaleSwitch locale={locale} label={say(locale, shellCopy.language)}
              names={{ en: say(locale, shellCopy.english), ar: say(locale, shellCopy.arabic) }} />
          </Suspense>
          {signOut}
        </header>
        <main id="content" className="console-content" tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}
```

`apps/platform-admin/app/[locale]/(console)/loading.tsx` (the streaming fallback for every console route; a loading file receives no params, so it reads the locale from the URL):
```tsx
"use client";

import { isLocale } from "@wlbp/i18n";
import { useParams } from "next/navigation";
import { say, stateCopy } from "../../_lib/copy";

export default function Loading() {
  const { locale } = useParams<{ locale: string }>();
  return (
    <p className="state" role="status" aria-live="polite">
      {say(isLocale(locale) ? locale : "en", stateCopy.loading)}
    </p>
  );
}
```

- [ ] **Step 8: Sign-out route**

`apps/platform-admin/app/[locale]/sign-out/route.ts`:
```ts
import { isLocale } from "@wlbp/i18n";
import { NextResponse, type NextRequest } from "next/server";
import { createPlatformAdminRequestClient } from "../../_lib/platform-admin-server";

export async function POST(request: NextRequest, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const target = isLocale(locale) ? locale : "en";
  // Same-origin only: a cross-site form must not be able to end a session.
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== request.nextUrl.origin) {
    return new NextResponse(null, { status: 403 });
  }
  const client = await createPlatformAdminRequestClient();
  await client?.auth.signOut();
  return NextResponse.redirect(new URL(`/${target}/login`, request.url), 303);
}
```

- [ ] **Step 9: Localize the login and enrollment pages; remove the old page**

`apps/platform-admin/app/[locale]/login/page.tsx` (full file):
```tsx
"use client";

import { Button, ErrorSummary, TextField } from "@wlbp/ui-foundation";
import type { Locale } from "@wlbp/i18n";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { authCopy } from "../../_lib/auth-copy";
import { say, type Copy } from "../../_lib/copy";
import { getPlatformAdminBrowserClient, verifyMfaCode } from "../../_lib/supabase-browser";

type Step = { kind: "credentials" } | { kind: "mfa"; factorId: string };

export default function LoginPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = use(params);
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "credentials" });
  const [error, setError] = useState<Copy | null>(null);
  const [pending, setPending] = useState(false);

  // Signed in at aal1 with a verified factor (e.g. after the guard asked for a
  // step-up): go straight to the code instead of asking for the password again.
  useEffect(() => {
    void (async () => {
      const client = getPlatformAdminBrowserClient();
      const { data } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (data?.currentLevel === "aal1" && data.nextLevel === "aal2") {
        const { data: factors } = await client.auth.mfa.listFactors();
        const factor = factors?.totp.find((entry) => entry.status === "verified");
        if (factor) setStep({ kind: "mfa", factorId: factor.id });
      }
    })();
  }, []);

  async function finish() {
    router.replace(`/${locale}`);
    router.refresh();
  }

  async function onCredentials(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const client = getPlatformAdminBrowserClient();
    const { error: signInError } = await client.auth.signInWithPassword({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    if (signInError) {
      setError(signInError.status === 400 ? authCopy.invalidCredentials : authCopy.unavailable);
      setPending(false);
      return;
    }
    const { data: aal } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      const { data: factors } = await client.auth.mfa.listFactors();
      const factor = factors?.totp.find((entry) => entry.status === "verified");
      setPending(false);
      if (!factor) {
        setError(authCopy.noFactor);
        return;
      }
      setStep({ kind: "mfa", factorId: factor.id });
      return;
    }
    if (aal?.nextLevel === "aal1") {
      router.replace(`/${locale}/mfa-enroll`);
      return;
    }
    await finish();
  }

  async function onCode(event: React.FormEvent<HTMLFormElement>, factorId: string) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const code = String(new FormData(event.currentTarget).get("code") ?? "");
    const { error: verifyError } = await verifyMfaCode(getPlatformAdminBrowserClient(), factorId, code);
    if (verifyError) {
      setError(authCopy.invalidCode);
      setPending(false);
      return;
    }
    await finish();
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="login-title">
        <h1 id="login-title">{say(locale, step.kind === "credentials" ? authCopy.loginTitle : authCopy.mfaTitle)}</h1>
        {error ? <ErrorSummary title={say(locale, authCopy.errorTitle)}>{say(locale, error)}</ErrorSummary> : null}
        {step.kind === "credentials" ? (
          <form onSubmit={onCredentials}>
            <TextField autoComplete="email" id="email" label={say(locale, authCopy.email)} name="email" required type="email" />
            <TextField autoComplete="current-password" id="password" label={say(locale, authCopy.password)} name="password" required type="password" />
            <Button loading={pending} loadingLabel={say(locale, authCopy.signingIn)} type="submit">{say(locale, authCopy.signIn)}</Button>
          </form>
        ) : (
          <form onSubmit={(event) => onCode(event, step.factorId)}>
            <TextField autoComplete="one-time-code" id="code" inputMode="numeric" label={say(locale, authCopy.code)}
              maxLength={6} minLength={6} name="code" required />
            <Button loading={pending} loadingLabel={say(locale, authCopy.verifying)} type="submit">{say(locale, authCopy.verify)}</Button>
          </form>
        )}
      </section>
    </main>
  );
}
```

`apps/platform-admin/app/[locale]/mfa-enroll/page.tsx`: keep the existing enrollment logic (stale-factor cleanup, `enroll`, `verifyMfaCode`) and change only presentation:
- Replace `getAdminMessage(locale, key)` calls with `say(locale, authCopy.<key>)`: `mfaEnrollTitle→enrollTitle`, `mfaEnrollInstructions→enrollBody`, `mfaEnrollSecretLabel→enrollKey`, `mfaEnrollCodeLabel→code`, `mfaEnrollSubmit→enrollSubmit`, `mfaEnrollErrorTitle→errorTitle`.
- Replace `setError(enrollError.message)` with `setError(say(locale, authCopy.enrollFailed))` and `setError(verifyError.message)` with `setError(say(locale, authCopy.invalidCode))` — provider messages are never shown.
- Wrap in `<main className="auth-shell"><section className="auth-card" aria-labelledby="mfa-enroll-title">…`, drop `Surface`/`StatusMessage` imports, render the instructions as `<p>`.
- While `factor === null && error === null` render `<p role="status">{say(locale, authCopy.preparing)}</p>`.
- Give the QR image a real description: `alt={say(locale, authCopy.enrollQr)}`; render the setup key as `<code dir="ltr">` so it reads correctly in Arabic.
- After a successful verify call `router.replace(`/${locale}`)` then `router.refresh()`.

Delete the old surfaces and the shim:
```bash
rtk git rm apps/platform-admin/app/[locale]/page.tsx apps/platform-admin/app/[locale]/create-tenant-form.tsx apps/platform-admin/app/_lib/tenant-actions.ts
```
If Task 10 added the `getAdminMessage` shim to `copy.ts`, delete it now.

- [ ] **Step 10: Read-only primitives**

`apps/platform-admin/app/_lib/ui/states.tsx`:
```tsx
import type { Locale } from "@wlbp/i18n";
import type { ReactNode } from "react";
import { errorCopy, say, stateCopy } from "../copy";

export function EmptyState({ locale, filtered, title, body, action }: {
  locale: Locale; filtered?: boolean; title?: string; body?: string; action?: ReactNode;
}) {
  return (
    <div className="state" role="status">
      <h2>{title ?? say(locale, stateCopy.emptyTitle)}</h2>
      <p>{body ?? (filtered ? say(locale, stateCopy.emptyFiltered) : "")}</p>
      {action}
    </div>
  );
}

/** A failed read. Shown instead of data, never alongside a substitute value. */
export function UnavailableState({ locale, code }: { locale: Locale; code?: string }) {
  const specific = code && code !== "unavailable" ? errorCopy[code] : undefined;
  return (
    <div className="state state--unavailable" role="alert">
      <h2>{say(locale, stateCopy.unavailableTitle)}</h2>
      <p>{say(locale, specific ?? stateCopy.unavailableBody)}</p>
    </div>
  );
}

const unknownKinds = {
  notObserved: stateCopy.notObserved, notReported: stateCopy.notReported,
  never: stateCopy.never, unknown: stateCopy.unknown, none: stateCopy.none,
} as const;

export function Unknown({ locale, kind = "notObserved" }: { locale: Locale; kind?: keyof typeof unknownKinds }) {
  return <span className="value-unknown">{say(locale, unknownKinds[kind])}</span>;
}
```

`apps/platform-admin/app/_lib/ui/status-badge.tsx`:
```tsx
import type { Locale } from "@wlbp/i18n";
import { Badge } from "@wlbp/ui-foundation";
import { copyFor, roleCopy, statusCopy, statusTone } from "../copy";

export function StatusBadge({ locale, status }: { locale: Locale; status: string | null | undefined }) {
  return <Badge tone={statusTone(status ?? "unknown")}>{copyFor(statusCopy, status ?? "unknown", locale)}</Badge>;
}

export function RoleBadge({ locale, role }: { locale: Locale; role: string }) {
  return <Badge tone={role === "break_glass" ? "danger" : role === "admin" ? "warning" : "neutral"}>{copyFor(roleCopy, role, locale)}</Badge>;
}
```

`apps/platform-admin/app/_lib/ui/facts.tsx`:
```tsx
import type { ReactNode } from "react";

export function Facts({ items }: { items: readonly (readonly [label: string, value: ReactNode])[] }) {
  return (
    <dl className="facts">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
```

`apps/platform-admin/app/_lib/ui/time.tsx`:
```tsx
import { formatDateTime, formatNumber, type Locale } from "@wlbp/i18n";
import { Badge } from "@wlbp/ui-foundation";
import { fill, say, stateCopy } from "../copy";
import { Unknown } from "./states";

export function ageLabel(locale: Locale, minutes: number): string {
  if (minutes < 120) return fill(locale, stateCopy.minutes, { n: formatNumber(minutes, locale) });
  if (minutes < 2880) return fill(locale, stateCopy.hours, { n: formatNumber(Math.floor(minutes / 60), locale) });
  return fill(locale, stateCopy.days, { n: formatNumber(Math.floor(minutes / 1440), locale) });
}

/** Always UTC and labelled; optionally flags data older than a threshold. */
export function TimeValue({ locale, value, staleAfterMinutes, empty = "never" }: {
  locale: Locale; value: string | null | undefined; staleAfterMinutes?: number;
  empty?: "never" | "notObserved" | "notReported" | "none";
}) {
  if (!value) return <Unknown locale={locale} kind={empty} />;
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  const stale = staleAfterMinutes !== undefined && minutes > staleAfterMinutes;
  return (
    <span>
      <time dateTime={value}>{formatDateTime(value, locale, "UTC")}</time>{" "}
      <span className="secondary">{say(locale, stateCopy.utc)}</span>
      {stale ? <> <Badge tone="warning">{fill(locale, stateCopy.staleSince, { age: ageLabel(locale, minutes) })}</Badge></> : null}
    </span>
  );
}
```

`apps/platform-admin/app/_lib/ui/data-table.tsx`:
```tsx
import type { Locale } from "@wlbp/i18n";
import Link from "next/link";
import type { ReactNode } from "react";
import { fill, formCopy } from "../copy";

export type Column = { label: string; sort?: string; numeric?: boolean };

/** Wide tables scroll inside their own labelled, focusable region. */
export function DataTable({ id, locale, caption, columns, rows, sort, sortHref }: {
  id: string; locale: Locale; caption: string; columns: readonly Column[];
  rows: readonly { key: string; cells: readonly ReactNode[] }[];
  sort?: string; sortHref?: (sort: string) => string;
}) {
  return (
    <div className="table-scroll" role="region" aria-labelledby={id} tabIndex={0}>
      <table className="data-table">
        <caption id={id}>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => {
              const direction = !column.sort ? undefined
                : sort === column.sort ? "ascending" : sort === `-${column.sort}` ? "descending" : "none";
              const next = sort === column.sort ? `-${column.sort}` : column.sort;
              return (
                <th key={column.label} scope="col" aria-sort={direction} className={column.numeric ? "numeric" : undefined}>
                  {column.sort && sortHref && next ? (
                    <Link href={sortHref(next)} aria-label={fill(locale, formCopy.sortBy, { column: column.label })}>
                      {column.label}
                      <span aria-hidden="true">{direction === "ascending" ? " ▲" : direction === "descending" ? " ▼" : ""}</span>
                    </Link>
                  ) : column.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              {row.cells.map((cell, index) => (
                <td key={columns[index]?.label ?? index} className={columns[index]?.numeric ? "numeric" : undefined}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

`apps/platform-admin/app/_lib/ui/pagination.tsx`:
```tsx
import { formatNumber, type Locale } from "@wlbp/i18n";
import Link from "next/link";
import { fill, formCopy, say } from "../copy";

export function Pagination({ locale, page, pageSize, total, href }: {
  locale: Locale; page: number; pageSize: number; total: number; href: (page: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav className="pagination" aria-label={say(locale, formCopy.pagination)}>
      <span>
        {fill(locale, formCopy.results, { total: formatNumber(total, locale) })} ·{" "}
        {fill(locale, formCopy.pageOf, { page: formatNumber(Math.min(page, pages), locale), pages: formatNumber(pages, locale) })}
      </span>
      <div>
        {page > 1 ? <Link rel="prev" href={href(page - 1)}>{say(locale, formCopy.previous)}</Link> : null}
        {page < pages ? <Link rel="next" href={href(page + 1)}>{say(locale, formCopy.next)}</Link> : null}
      </div>
    </nav>
  );
}
```

`apps/platform-admin/app/_lib/ui/filter-bar.tsx`:
```tsx
import type { Locale } from "@wlbp/i18n";
import Link from "next/link";
import type { ReactNode } from "react";
import { formCopy, say } from "../copy";

/** A plain GET form: filters live in the URL, so every view is shareable. */
export function FilterBar({ locale, path, search, children }: {
  locale: Locale; path: string; search?: { label: string; value: string }; children?: ReactNode;
}) {
  return (
    <form className="filter-bar" method="get" action={path} role="search">
      {search ? (
        <label>
          {search.label}
          <input type="search" name="q" defaultValue={search.value} maxLength={100} />
        </label>
      ) : null}
      {children}
      <button type="submit" className="wlbp-button wlbp-button--secondary">{say(locale, formCopy.apply)}</button>
      <Link href={path}>{say(locale, formCopy.clear)}</Link>
    </form>
  );
}

export function SelectFilter({ name, label, value, options, allLabel }: {
  name: string; label: string; value: string | undefined;
  options: readonly (readonly [value: string, label: string])[]; allLabel: string;
}) {
  return (
    <label>
      {label}
      <select name={name} defaultValue={value ?? ""}>
        <option value="">{allLabel}</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  );
}
```

`apps/platform-admin/app/_lib/ui/select-field.tsx`:
```tsx
/** A labelled, required native select for forms and dialogs. */
export function SelectField({ name, label, options, value, required = true }: {
  name: string; label: string; options: readonly (readonly [value: string, label: string])[];
  value?: string; required?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select name={name} defaultValue={value} required={required}>
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  );
}
```

- [ ] **Step 11: Interactive primitives (forms, dialogs, step-up)**

`apps/platform-admin/app/_lib/ui/step-up.ts`:
```ts
"use client";

import { getPlatformAdminBrowserClient, verifyMfaCode } from "../supabase-browser";

/** A fresh TOTP verification; the refreshed session cookie carries the new amr time. */
export async function verifyStepUp(code: string): Promise<"ok" | "invalid" | "no-factor"> {
  const client = getPlatformAdminBrowserClient();
  const { data } = await client.auth.mfa.listFactors();
  const factor = data?.totp.find((entry) => entry.status === "verified");
  if (!factor) return "no-factor";
  const { error } = await verifyMfaCode(client, factor.id, code);
  return error ? "invalid" : "ok";
}
```

`apps/platform-admin/app/_lib/ui/step-up-prompt.tsx`:
```tsx
"use client";

import type { Locale } from "@wlbp/i18n";
import { Button, TextField } from "@wlbp/ui-foundation";
import { useEffect, useId, useRef, useState } from "react";
import { formCopy, say, type Copy } from "../copy";
import { verifyStepUp } from "./step-up";

export function StepUpPrompt({ locale, onVerified }: { locale: Locale; onVerified: () => void }) {
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [error, setError] = useState<Copy | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => heading.current?.focus(), []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const outcome = await verifyStepUp(String(new FormData(event.currentTarget).get("code") ?? ""));
    setPending(false);
    if (outcome === "ok") onVerified();
    else setError(outcome === "no-factor" ? formCopy.stepUpNoFactor : formCopy.stepUpInvalid);
  }

  return (
    <section className="notice notice--warning" aria-labelledby={id}>
      <h3 id={id} ref={heading} tabIndex={-1}>{say(locale, formCopy.stepUpTitle)}</h3>
      <p>{say(locale, formCopy.stepUpBody)}</p>
      {error ? <p role="alert">{say(locale, error)}</p> : null}
      <form onSubmit={submit}>
        <TextField id={`${id}-code`} name="code" label={say(locale, formCopy.stepUpCode)} autoComplete="one-time-code"
          inputMode="numeric" minLength={6} maxLength={6} required />
        <Button type="submit" loading={pending} loadingLabel={say(locale, formCopy.working)}>{say(locale, formCopy.stepUpSubmit)}</Button>
      </form>
    </section>
  );
}
```

`apps/platform-admin/app/_lib/ui/operator-form.tsx`:
```tsx
"use client";

import type { Locale } from "@wlbp/i18n";
import { Button, ErrorSummary, StatusMessage } from "@wlbp/ui-foundation";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import type { ActionResult } from "../operator-action";
import { copyFor, errorCopy, formCopy, reasonCopy, say } from "../copy";
import { StepUpPrompt } from "./step-up-prompt";

export type FormAction = (previous: ActionResult, form: FormData) => Promise<ActionResult>;

const initial: ActionResult = { kind: "idle" };

function download({ filename, body }: { filename: string; body: string }) {
  const url = URL.createObjectURL(new Blob([body], { type: "text/csv;charset=utf-8" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: filename });
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * One form behaviour for every mutation: pending state disables input, errors
 * are announced in text, a step-up challenge re-submits the same form, and a
 * success either navigates, downloads, or announces itself.
 */
export function OperatorForm({ locale, action, submit, successMessage, danger, children, onSuccess, submitDisabled, className }: {
  locale: Locale; action: FormAction; submit: string; successMessage: string; danger?: boolean;
  children?: ReactNode; onSuccess?: () => void; submitDisabled?: boolean; className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const form = useRef<HTMLFormElement>(null);
  const handled = useRef<ActionResult>(initial);
  const router = useRouter();

  useEffect(() => {
    if (state === handled.current || state.kind !== "success") return;
    handled.current = state;
    if (state.download) download(state.download);
    if (state.href) router.push(state.href);
    onSuccess?.();
  }, [state, router, onSuccess]);

  return (
    <>
      {state.kind === "error" ? (
        <ErrorSummary title={say(locale, formCopy.errorTitle)}>
          <p>{copyFor(errorCopy, state.code, locale)}</p>
          {state.reasons?.length ? (
            <ul>{state.reasons.map((reason) => <li key={reason}>{copyFor(reasonCopy, reason, locale)} <bdi className="secondary">{reason}</bdi></li>)}</ul>
          ) : null}
        </ErrorSummary>
      ) : null}
      {state.kind === "success" && !state.href && !onSuccess ? (
        <StatusMessage tone="positive">{successMessage}</StatusMessage>
      ) : null}
      <form ref={form} action={formAction} className={className}>
        <input type="hidden" name="locale" value={locale} />
        <fieldset disabled={pending}>{children}</fieldset>
        <div className="form-actions">
          <Button type="submit" loading={pending} loadingLabel={say(locale, formCopy.working)}
            disabled={submitDisabled} className={danger ? "wlbp-button--danger" : undefined}>
            {submit}
          </Button>
        </div>
      </form>
      {state.kind === "step-up" && !pending ? (
        <StepUpPrompt locale={locale} onVerified={() => form.current?.requestSubmit()} />
      ) : null}
    </>
  );
}
```

`apps/platform-admin/app/_lib/ui/action-dialog.tsx`:
```tsx
"use client";

import type { Locale } from "@wlbp/i18n";
import { StatusMessage } from "@wlbp/ui-foundation";
import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { fill, formCopy, say } from "../copy";
import { OperatorForm, type FormAction } from "./operator-form";

/**
 * A native modal <dialog>: focus moves in, Escape closes, focus returns to the
 * trigger. Destructive and high-impact actions always go through one.
 */
export function ActionDialog({
  locale, action, trigger, title, description, submit, successMessage, danger, triggerVariant = "secondary",
  hidden, reason, confirmText, children,
}: {
  locale: Locale; action: FormAction; trigger: string; title: string; description?: string; submit: string;
  successMessage: string; danger?: boolean; triggerVariant?: "primary" | "secondary" | "quiet";
  hidden?: Record<string, string>; reason?: { minLength: number }; confirmText?: string; children?: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const fieldId = useId();
  const [typed, setTyped] = useState("");
  const [done, setDone] = useState(false);
  // A fresh form on every open, so a previous error or step-up does not linger.
  const [generation, setGeneration] = useState(0);

  const close = useCallback(() => dialog.current?.close(), []);
  const onSuccess = useCallback(() => {
    dialog.current?.close();
    setDone(true);
  }, []);

  return (
    <>
      <button type="button" className={`wlbp-button wlbp-button--${danger && triggerVariant === "primary" ? "primary wlbp-button--danger" : triggerVariant}`}
        onClick={() => {
          setDone(false);
          setTyped("");
          setGeneration((value) => value + 1);
          dialog.current?.showModal();
        }}>
        {trigger}
      </button>
      {done ? <StatusMessage tone="positive">{successMessage}</StatusMessage> : null}
      <dialog ref={dialog} className="dialog" aria-labelledby={titleId}>
        <h2 id={titleId}>{title}</h2>
        {description ? <p>{description}</p> : null}
        <OperatorForm key={generation} locale={locale} action={action} submit={submit} successMessage={successMessage}
          danger={danger} onSuccess={onSuccess} submitDisabled={confirmText !== undefined && typed !== confirmText}>
          {Object.entries(hidden ?? {}).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
          {children}
          {reason ? (
            <label className="field" htmlFor={`${fieldId}-reason`}>
              <span>{say(locale, formCopy.reason)}</span>
              <textarea id={`${fieldId}-reason`} name="reason" required minLength={reason.minLength} maxLength={500}
                aria-describedby={`${fieldId}-reason-hint`} />
              <small id={`${fieldId}-reason-hint`}>{fill(locale, formCopy.reasonHint, { n: String(reason.minLength) })}</small>
            </label>
          ) : null}
          {confirmText !== undefined ? (
            <label className="field" htmlFor={`${fieldId}-confirm`}>
              <span>{fill(locale, formCopy.typeToConfirm, { value: confirmText })}</span>
              <input id={`${fieldId}-confirm`} name="confirmation" value={typed} autoComplete="off"
                onChange={(event) => setTyped(event.target.value)} required />
            </label>
          ) : null}
        </OperatorForm>
        <div className="form-actions">
          <button type="button" className="wlbp-button wlbp-button--quiet" onClick={close}>{say(locale, formCopy.cancel)}</button>
        </div>
      </dialog>
    </>
  );
}
```

Note: `fill(locale, formCopy.reasonHint, { n: … })` uses Latin digits inside the string for a numeric attribute-like value; that is acceptable because the same value is the `minLength` the browser enforces. Everything else numeric uses `formatNumber`.

Add `import * as auth from "./auth-copy";` to `copy.test.ts` if not done in Step 4.

- [ ] **Step 12: Verify**

Run:
```bash
rtk pnpm --filter @wlbp/platform-admin test:unit
rtk pnpm --filter @wlbp/platform-admin typecheck
rtk pnpm exec eslint apps/platform-admin --max-warnings=0
rtk pnpm --filter @wlbp/platform-admin build
```
Expected: all pass. The build lists `/[locale]/login`, `/[locale]/mfa-enroll`, `/[locale]/sign-out`; there is no `/[locale]` page until Task 13.

- [ ] **Step 13: Commit**

```bash
rtk git add apps/platform-admin/proxy.ts apps/platform-admin/app
rtk git status --short apps/platform-admin   # confirm only this task's files are staged
rtk git commit -m "Give Platform Admin a guarded console shell and shared primitives"
```
`apps/platform-admin/package.json` has a prior uncommitted edit; leave it unstaged.
