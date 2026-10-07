# Platform Admin Completion — Part B: Application (index)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Master plan and Global Constraints: [`2026-10-06-platform-admin-completion.md`](2026-10-06-platform-admin-completion.md).

Part B is split into four files so each stays reviewable. Execute in order.

| File | Tasks |
| --- | --- |
| [`2026-10-06-platform-admin-app-foundation.md`](2026-10-06-platform-admin-app-foundation.md) | 9 styling & fonts · 10 copy · 11 data/action layer & list state · 12 shell, auth pages, UI primitives |
| [`2026-10-06-platform-admin-app-fleet.md`](2026-10-06-platform-admin-app-fleet.md) | 13 overview · 14 tenants · 15 instances, domains, provisioning, jobs |
| [`2026-10-06-platform-admin-app-commercial-releases.md`](2026-10-06-platform-admin-app-commercial-releases.md) | 16 plans & subscriptions · 17 releases & rollouts · 18 health & support |
| [`2026-10-06-platform-admin-app-administration.md`](2026-10-06-platform-admin-app-administration.md) | 19 operators & account · 20 audit & export · 21 settings & integrations |

## Conventions for every Part B task

- Before writing Next.js code, read the relevant guide under `apps/platform-admin/node_modules/next/dist/docs/01-app/` (this is Next 16: `params`/`searchParams` are Promises, middleware is `proxy.ts`, `useActionState` from `react`).
- Every console page is a server component under `app/[locale]/(console)/`, starts with `export const dynamic = "force-dynamic";`, resolves `const { locale } = await params`, and reads data only through `callOperator` (Task 11).
- Every mutation is a `"use server"` action with signature `(previous: ActionResult, form: FormData) => Promise<ActionResult>` built on `runOperatorAction` (Task 11), rendered with `ActionDialog` or `OperatorForm` (Task 12).
- Every string is a `Copy` tuple `[en, ar]` rendered with `say(locale, …)`; each route has a `copy.ts` next to its `page.tsx`, imported into `app/_lib/copy.test.ts` for parity checking.
- Technical identifiers render inside `<bdi>`; times render with `TimeValue` (UTC, labelled).
- Role-gated controls are hidden for lower roles only as a convenience; the database refuses regardless.
- After each task: `rtk pnpm --filter @wlbp/platform-admin typecheck && rtk pnpm --filter @wlbp/platform-admin test:unit && rtk pnpm exec eslint apps/platform-admin --max-warnings=0`.
