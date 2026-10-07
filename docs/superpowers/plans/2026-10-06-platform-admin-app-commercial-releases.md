# Platform Admin Completion — Part B3: Commercial, Releases, Health and Support

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Global Constraints: [`2026-10-06-platform-admin-completion.md`](2026-10-06-platform-admin-completion.md). Conventions: [`2026-10-06-platform-admin-application.md`](2026-10-06-platform-admin-application.md). Depends on Parts B1–B2 (Tasks 9–15).

**Goal:** Plans and subscriptions, releases and rollouts, health and alerts, and support access.

---

### Task 16: Plans and subscriptions

**Files:**
- Create: `apps/platform-admin/app/_lib/actions/plans.ts`
- Create: `apps/platform-admin/app/_lib/commercial-copy.ts`
- Create: `apps/platform-admin/app/[locale]/(console)/plans/page.tsx`
- Create: `apps/platform-admin/app/[locale]/(console)/subscriptions/page.tsx`
- Modify: `apps/platform-admin/app/_lib/copy.test.ts` (register `commercial-copy`)

**Interfaces:**
- Consumes: `assignSubscriptionAction`, `updateSubscriptionAction` (Task 14), `actionCopy` (Task 14), `SelectField` (Task 12).
- Produces: `savePlanAction` — form fields `mode` (`create`|`edit`), `key`, `name`, `features` (one key per line or comma-separated), `active` (checkbox `on`) → `save_plan_v1`.

- [ ] **Step 1: Plan action**

`apps/platform-admin/app/_lib/actions/plans.ts`:
```ts
"use server";

import { lines, text } from "../form-data";
import { runOperatorAction, type ActionResult } from "../operator-action";

export async function savePlanAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const key = text(form, "key").toLowerCase();
  const create = text(form, "mode") === "create";
  return (await runOperatorAction({
    action: create ? "plan.create" : "plan.update",
    fn: "save_plan_v1",
    args: {
      p_key: key, p_name: text(form, "name"),
      p_entitlements: lines(form, "features").map((feature) => feature.toLowerCase()),
      p_active: form.get("active") === "on", p_create: create,
    },
    targetKind: "plan", targetId: /^[a-z][a-z0-9_-]{1,40}$/u.test(key) ? key : undefined,
  })).result;
}
```

- [ ] **Step 2: Commercial copy**

`apps/platform-admin/app/_lib/commercial-copy.ts`:
```ts
export const commercialCopy = {
  plans: {
    title: ["Plans", "الخطط"],
    description: ["A plan is a named set of features. Changing a plan's features updates every tenant on it.",
      "الخطة مجموعة مسمّاة من الميزات. تغيير ميزات خطة يحدّث كل مستأجر عليها."],
    create: ["Create plan", "إنشاء خطة"], createTitle: ["Create a plan", "إنشاء خطة"],
    edit: ["Edit", "تعديل"], editTitle: ["Edit plan", "تعديل الخطة"],
    editBody: ["Saving re-applies the features to every tenant on this plan. Manual overrides are kept.",
      "الحفظ يعيد تطبيق الميزات على كل مستأجر في هذه الخطة. تُحفظ التجاوزات اليدوية."],
    saved: ["Plan saved.", "تم حفظ الخطة."],
    key: ["Key", "المفتاح"], keyHint: ["Lowercase, e.g. studio. Cannot be changed later.", "بأحرف صغيرة، مثل studio. لا يمكن تغييره لاحقًا."],
    name: ["Name", "الاسم"], features: ["Features", "الميزات"],
    featuresHint: ["One feature key per line, e.g. booking.online.", "مفتاح ميزة في كل سطر، مثل booking.online."],
    knownFeatures: ["Feature keys in use: {keys}", "مفاتيح الميزات المستخدمة: {keys}"],
    active: ["Available for new assignments", "متاحة للتعيينات الجديدة"],
    subscribers: ["Tenants on plan", "المستأجرون على الخطة"], status: ["Status", "الحالة"],
    inactive: ["Inactive", "غير نشطة"], created: ["Created", "تاريخ الإنشاء"],
    empty: ["No plans exist yet.", "لا توجد خطط بعد."],
  },
  subscriptions: {
    title: ["Subscriptions", "الاشتراكات"],
    description: ["Each tenant's plan, status and dates as recorded here.", "خطة كل مستأجر وحالتها وتواريخها كما سُجّلت هنا."],
    billingNote: ["These are administrative records. No payment provider is connected for platform subscriptions: nothing here charges, refunds or confirms a payment.",
      "هذه سجلات إدارية. لا يوجد مزوّد دفع متصل باشتراكات المنصة: لا شيء هنا يحصّل مبلغًا أو يردّه أو يؤكد دفعًا."],
    search: ["Search by tenant", "ابحث بالمستأجر"],
    tenant: ["Tenant", "المستأجر"], plan: ["Plan", "الخطة"], status: ["Status", "الحالة"], ring: ["Ring", "الحلقة"],
    started: ["Started", "البداية"], ends: ["Ends", "النهاية"], updated: ["Last changed", "آخر تعديل"],
    actions: ["Actions", "الإجراءات"],
  },
} as const;
```
Register in `copy.test.ts`: `import * as commercial from "./commercial-copy";`.

- [ ] **Step 3: Plans page**

`apps/platform-admin/app/[locale]/(console)/plans/page.tsx`:
```tsx
import { formatNumber, type Locale } from "@wlbp/i18n";
import { TextField } from "@wlbp/ui-foundation";
import { savePlanAction } from "../../../_lib/actions/plans";
import { commercialCopy } from "../../../_lib/commercial-copy";
import { fill, say, stateCopy } from "../../../_lib/copy";
import { callOperator } from "../../../_lib/operator-api";
import { atLeast, getOperator } from "../../../_lib/operator-page";
import { pageLocale } from "../../../_lib/page-locale";
import { PageHeader } from "../../../_lib/shell/page-header";
import { ActionDialog } from "../../../_lib/ui/action-dialog";
import { DataTable } from "../../../_lib/ui/data-table";
import { EmptyState, UnavailableState } from "../../../_lib/ui/states";
import { StatusBadge } from "../../../_lib/ui/status-badge";
import { TimeValue } from "../../../_lib/ui/time";

export const dynamic = "force-dynamic";

const c = commercialCopy.plans;

function PlanFields({ locale, plan }: { locale: Locale; plan?: { key: string; name: string; entitlements: string[]; active: boolean } }) {
  return (
    <>
      <input type="hidden" name="mode" value={plan ? "edit" : "create"} />
      {plan ? <input type="hidden" name="key" value={plan.key} />
        : <TextField id="plan-key" name="key" label={say(locale, c.key)} description={say(locale, c.keyHint)} required minLength={2} maxLength={41} autoComplete="off" />}
      <TextField id={`plan-name-${plan?.key ?? "new"}`} name="name" label={say(locale, c.name)} defaultValue={plan?.name} required maxLength={80} />
      <label className="field">
        <span>{say(locale, c.features)}</span>
        <textarea name="features" defaultValue={plan?.entitlements.join("\n")} rows={6} dir="ltr" />
        <small>{say(locale, c.featuresHint)}</small>
      </label>
      <label className="checkbox"><input type="checkbox" name="active" defaultChecked={plan?.active ?? true} /> {say(locale, c.active)}</label>
    </>
  );
}

export default async function PlansPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await pageLocale(params);
  const operator = await getOperator(locale);
  if (!operator) return null;
  const result = await callOperator("list_plans_v1");
  const admin = atLeast(operator.role, "admin");
  const known = result.ok ? [...new Set(result.data.flatMap((p) => p.entitlements))].sort() : [];

  return (
    <>
      <PageHeader locale={locale} title={say(locale, c.title)} description={say(locale, c.description)}
        actions={admin ? (
          <ActionDialog locale={locale} action={savePlanAction} trigger={say(locale, c.create)} triggerVariant="primary"
            title={say(locale, c.createTitle)} submit={say(locale, c.create)} successMessage={say(locale, c.saved)}>
            <PlanFields locale={locale} />
          </ActionDialog>
        ) : null} />
      {known.length ? <p className="secondary">{fill(locale, c.knownFeatures, { keys: known.join(", ") })}</p> : null}
      {!admin ? <p className="notice">{say(locale, stateCopy.roleRequired)}</p> : null}
      {!result.ok ? <UnavailableState locale={locale} code={result.code} />
        : result.data.length === 0 ? <EmptyState locale={locale} title={say(locale, c.empty)} />
        : (
          <DataTable id="plans-table" locale={locale} caption={say(locale, c.title)}
            columns={[{ label: say(locale, c.name) }, { label: say(locale, c.features) }, { label: say(locale, c.subscribers), numeric: true },
              { label: say(locale, c.status) }, { label: say(locale, c.created) }, { label: "" }]}
            rows={result.data.map((plan) => ({
              key: plan.key,
              cells: [
                <>{plan.name}<span className="secondary"><bdi>{plan.key}</bdi></span></>,
                <bdi key="f">{plan.entitlements.join(", ") || say(locale, stateCopy.none)}</bdi>,
                formatNumber(Number(plan.subscriber_count), locale),
                plan.active ? <StatusBadge key="s" locale={locale} status="active" /> : say(locale, c.inactive),
                <TimeValue key="t" locale={locale} value={plan.created_at} />,
                admin ? (
                  <ActionDialog key="e" locale={locale} action={savePlanAction} trigger={say(locale, c.edit)} triggerVariant="quiet"
                    title={say(locale, c.editTitle)} description={say(locale, c.editBody)} submit={say(locale, c.edit)}
                    successMessage={say(locale, c.saved)}>
                    <PlanFields locale={locale} plan={plan} />
                  </ActionDialog>
                ) : null,
              ],
            }))} />
        )}
    </>
  );
}
```

- [ ] **Step 4: Subscriptions page**

`apps/platform-admin/app/[locale]/(console)/subscriptions/page.tsx`:
```tsx
import Link from "next/link";
import { actionCopy as a } from "../../../_lib/action-copy";
import { assignSubscriptionAction, updateSubscriptionAction } from "../../../_lib/actions/subscriptions";
import { commercialCopy } from "../../../_lib/commercial-copy";
import { copyFor, formCopy, say, statusCopy } from "../../../_lib/copy";
import { listHref, parseListParams } from "../../../_lib/list-params";
import { callOperator } from "../../../_lib/operator-api";
import { atLeast, getOperator } from "../../../_lib/operator-page";
import { pageLocale } from "../../../_lib/page-locale";
import { PageHeader } from "../../../_lib/shell/page-header";
import { ActionDialog } from "../../../_lib/ui/action-dialog";
import { DataTable } from "../../../_lib/ui/data-table";
import { FilterBar, SelectFilter } from "../../../_lib/ui/filter-bar";
import { Pagination } from "../../../_lib/ui/pagination";
import { SelectField } from "../../../_lib/ui/select-field";
import { EmptyState, Unknown, UnavailableState } from "../../../_lib/ui/states";
import { StatusBadge } from "../../../_lib/ui/status-badge";
import { TimeValue } from "../../../_lib/ui/time";

export const dynamic = "force-dynamic";

const c = commercialCopy.subscriptions;
const states = ["none", "trialing", "active", "past_due", "cancelled"] as const;
const rings = ["canary", "early", "general"] as const;
const spec = { filters: { state: states, plan: "text" }, pageSize: 25 } as const;

export default async function SubscriptionsPage({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await pageLocale(params);
  const operator = await getOperator(locale);
  if (!operator) return null;
  const list = parseListParams(await searchParams, spec);
  const path = `/${locale}/subscriptions`;
  const [result, plans] = await Promise.all([
    callOperator("list_subscriptions_v1", {
      p_state: list.filters.state, p_plan_key: list.filters.plan, p_search: list.q || undefined,
      p_limit: list.pageSize, p_offset: list.offset,
    }),
    callOperator("list_plans_v1"),
  ]);
  const admin = atLeast(operator.role, "admin");
  const status = (s: string) => copyFor(statusCopy, s, locale);
  const ringOptions = rings.map((r) => [r, status(r)] as const);
  const planOptions = plans.ok ? plans.data.filter((p) => p.active).map((p) => [p.key, p.name] as const) : [];

  return (
    <>
      <PageHeader locale={locale} title={say(locale, c.title)} description={say(locale, c.description)} />
      <p className="notice">{say(locale, c.billingNote)}</p>
      <FilterBar locale={locale} path={path} search={{ label: say(locale, c.search), value: list.q }}>
        <SelectFilter name="state" label={say(locale, c.status)} value={list.filters.state} allLabel={say(locale, formCopy.all)}
          options={states.map((s) => [s, status(s)] as const)} />
        <SelectFilter name="plan" label={say(locale, c.plan)} value={list.filters.plan} allLabel={say(locale, formCopy.all)}
          options={plans.ok ? plans.data.map((p) => [p.key, p.name] as const) : []} />
      </FilterBar>
      {!result.ok ? <UnavailableState locale={locale} code={result.code} />
        : result.data.length === 0 ? <EmptyState locale={locale} filtered={Boolean(list.q || Object.keys(list.filters).length)} />
        : (
          <>
            <DataTable id="subscriptions-table" locale={locale} caption={say(locale, c.title)}
              columns={[{ label: say(locale, c.tenant) }, { label: say(locale, c.plan) }, { label: say(locale, c.status) },
                { label: say(locale, c.ring) }, { label: say(locale, c.started) }, { label: say(locale, c.ends) },
                { label: say(locale, c.updated) }, { label: say(locale, c.actions) }]}
              rows={result.data.map((row) => ({
                key: row.tenant_id,
                cells: [
                  <Link key="t" href={`/${locale}/tenants/${row.tenant_id}#subscription`}><bdi>{row.tenant_name}</bdi></Link>,
                  row.plan_key ? <bdi key="p">{row.plan_name ?? row.plan_key}</bdi> : <Unknown key="p" locale={locale} kind="none" />,
                  <StatusBadge key="s" locale={locale} status={row.state} />,
                  row.rollout_ring ? status(row.rollout_ring) : <Unknown key="r" locale={locale} kind="none" />,
                  <TimeValue key="st" locale={locale} value={row.started_at} empty="none" />,
                  <TimeValue key="e" locale={locale} value={row.ends_at} empty="none" />,
                  <TimeValue key="u" locale={locale} value={row.updated_at} empty="none" />,
                  admin ? (
                    <div key="a" className="page-actions">
                      <ActionDialog locale={locale} action={assignSubscriptionAction} trigger={say(locale, a.assignPlan.trigger)} triggerVariant="quiet"
                        title={say(locale, a.assignPlan.title)} description={say(locale, a.assignPlan.body)} submit={say(locale, a.assignPlan.submit)}
                        successMessage={say(locale, a.assignPlan.done)} reason={{ minLength: 5 }} hidden={{ tenantId: row.tenant_id }}>
                        <SelectField name="planKey" label={say(locale, a.fields.plan)} value={row.plan_key ?? undefined} options={planOptions} />
                        <SelectField name="ring" label={say(locale, a.fields.ring)} value={row.rollout_ring ?? "general"} options={ringOptions} />
                      </ActionDialog>
                      {row.updated_at ? (
                        <ActionDialog locale={locale} action={updateSubscriptionAction} trigger={say(locale, a.updateSubscription.trigger)} triggerVariant="quiet"
                          title={say(locale, a.updateSubscription.title)} description={say(locale, a.updateSubscription.body)}
                          submit={say(locale, a.updateSubscription.submit)} successMessage={say(locale, a.updateSubscription.done)}
                          reason={{ minLength: 5 }} hidden={{ tenantId: row.tenant_id, expectedUpdatedAt: row.updated_at }}>
                          <SelectField name="state" label={say(locale, a.fields.state)} value={row.state}
                            options={states.filter((s) => s !== "none").map((s) => [s, status(s)] as const)} />
                          <label className="field"><span>{say(locale, a.fields.endsAt)}</span>
                            <input type="datetime-local" name="endsAt" defaultValue={row.ends_at?.slice(0, 16)} /></label>
                          <SelectField name="ring" label={say(locale, a.fields.ring)} value={row.rollout_ring ?? "general"} options={ringOptions} />
                        </ActionDialog>
                      ) : null}
                    </div>
                  ) : null,
                ],
              }))} />
            <Pagination locale={locale} page={list.page} pageSize={list.pageSize} total={Number(result.data[0]?.total_count ?? 0)}
              href={(page) => listHref(path, list, { page })} />
          </>
        )}
    </>
  );
}
```
`row.ends_at?.slice(0, 16)` turns the stored UTC ISO instant into the `datetime-local` value; the field label says UTC and `instant()` reads it back as UTC.

- [ ] **Step 5: Verify and commit**

Run:
```bash
rtk pnpm --filter @wlbp/platform-admin test:unit
rtk pnpm --filter @wlbp/platform-admin typecheck
rtk pnpm exec eslint apps/platform-admin --max-warnings=0
```
Expected: pass.
```bash
rtk git add apps/platform-admin/app/_lib/actions/plans.ts apps/platform-admin/app/_lib/commercial-copy.ts \
  "apps/platform-admin/app/[locale]/(console)/plans" "apps/platform-admin/app/[locale]/(console)/subscriptions" \
  apps/platform-admin/app/_lib/copy.test.ts
rtk git commit -m "Let admins manage plans and subscriptions as administrative records"
```

### Task 17: Releases and rollouts

**Files:**
- Create: `apps/platform-admin/app/_lib/actions/releases.ts`
- Create: `apps/platform-admin/app/_lib/release-copy.ts`
- Create: `apps/platform-admin/app/[locale]/(console)/releases/page.tsx`, `releases/[releaseId]/page.tsx`
- Create: `apps/platform-admin/app/[locale]/(console)/rollouts/page.tsx`, `rollouts/[rolloutId]/page.tsx`
- Modify: `apps/platform-admin/app/_lib/copy.test.ts` (register `release-copy`)

**Interfaces:**
- Produces server actions in `actions/releases.ts`:

| Action | Form fields | RPC |
| --- | --- | --- |
| `registerReleaseAction` | `version`, `channel`, `gitCommit`, `configSchemaVersion`, `backendMin`, `backendMax`, `migrationIds` (lines), `featureNotes` (lines), `upgradeNotes` (lines), `reversible` (checkbox), `idempotencyKey` | `register_release_v1` → `href` release detail |
| `setReleaseStatusAction` | `releaseId`, `status`, `reason` | `set_release_status_v1` |
| `createRolloutAction` | `releaseId`, `rings` (repeated checkbox), `reason`, `idempotencyKey` | `create_rollout_v1` → `href` rollout detail |
| `startRolloutAction` | `rolloutId` | `start_rollout_v1`; non-empty `blocked` → error `transition_not_allowed` with `reasons` |
| `pauseRolloutAction` / `cancelRolloutAction` / `rollbackRolloutAction` | `rolloutId`, `reason` | `pause_rollout_v1` / `cancel_rollout_v1` / `rollback_rollout_v1` |
| `retryRolloutAction` | `rolloutId` | `retry_rollout_targets_v1` |

- [ ] **Step 1: Release actions**

`apps/platform-admin/app/_lib/actions/releases.ts`:
```ts
"use server";

import { integer, lines, localeOf, text, uuid } from "../form-data";
import { runOperatorAction, type ActionResult } from "../operator-action";
import { missing } from "./guard";

/** Notes may contain commas, so they split on line breaks only. */
function notes(form: FormData, name: string): string[] {
  return text(form, name).split("\n").map((line) => line.trim()).filter(Boolean);
}

export async function registerReleaseAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const locale = localeOf(form);
  const { result, data } = await runOperatorAction({
    action: "release.register",
    fn: "register_release_v1",
    args: {
      p_version: text(form, "version"), p_channel: text(form, "channel"),
      p_git_commit: text(form, "gitCommit").toLowerCase(),
      p_config_schema_version: integer(form, "configSchemaVersion") ?? 0,
      p_backend_min: integer(form, "backendMin") ?? 0, p_backend_max: integer(form, "backendMax") ?? 0,
      p_migration_ids: lines(form, "migrationIds"),
      p_feature_notes: notes(form, "featureNotes"), p_upgrade_notes: notes(form, "upgradeNotes"),
      p_reversible: form.get("reversible") === "on", p_idempotency_key: text(form, "idempotencyKey"),
    },
    targetKind: "release",
  });
  const id = data?.[0]?.release_id;
  return result.kind === "success" && id ? { ...result, href: `/${locale}/releases/${id}` } : result;
}

export async function setReleaseStatusAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const releaseId = uuid(form, "releaseId");
  const invalid = missing(releaseId);
  if (invalid) return invalid;
  return (await runOperatorAction({
    action: "release.set_status", fn: "set_release_status_v1",
    args: { p_release_id: releaseId!, p_status: text(form, "status"), p_reason: text(form, "reason") },
    targetKind: "release", targetId: releaseId,
  })).result;
}

export async function createRolloutAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const locale = localeOf(form);
  const releaseId = uuid(form, "releaseId");
  const invalid = missing(releaseId);
  if (invalid) return invalid;
  const rings = form.getAll("rings").filter((value): value is string => typeof value === "string");
  const { result, data } = await runOperatorAction({
    action: "rollout.create", fn: "create_rollout_v1",
    args: { p_release_id: releaseId!, p_rings: rings, p_reason: text(form, "reason"), p_idempotency_key: text(form, "idempotencyKey") },
    targetKind: "rollout",
  });
  const id = data?.[0]?.rollout_id;
  return result.kind === "success" && id ? { ...result, href: `/${locale}/rollouts/${id}` } : result;
}

export async function startRolloutAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const rolloutId = uuid(form, "rolloutId");
  const invalid = missing(rolloutId);
  if (invalid) return invalid;
  const { result, data } = await runOperatorAction({
    action: "rollout.start", fn: "start_rollout_v1", args: { p_rollout_id: rolloutId! },
    targetKind: "rollout", targetId: rolloutId,
  });
  const blocked = data?.[0]?.blocked ?? [];
  return result.kind === "success" && blocked.length
    ? { kind: "error", code: "transition_not_allowed", reasons: blocked }
    : result;
}

async function rolloutWithReason(
  form: FormData,
  action: string,
  fn: "pause_rollout_v1" | "cancel_rollout_v1" | "rollback_rollout_v1",
): Promise<ActionResult> {
  const rolloutId = uuid(form, "rolloutId");
  const invalid = missing(rolloutId);
  if (invalid) return invalid;
  return (await runOperatorAction({
    action, fn, args: { p_rollout_id: rolloutId!, p_reason: text(form, "reason") },
    targetKind: "rollout", targetId: rolloutId,
  })).result;
}

export async function pauseRolloutAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  return rolloutWithReason(form, "rollout.pause", "pause_rollout_v1");
}

export async function cancelRolloutAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  return rolloutWithReason(form, "rollout.cancel", "cancel_rollout_v1");
}

export async function rollbackRolloutAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  return rolloutWithReason(form, "rollout.rollback", "rollback_rollout_v1");
}

export async function retryRolloutAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const rolloutId = uuid(form, "rolloutId");
  const invalid = missing(rolloutId);
  if (invalid) return invalid;
  return (await runOperatorAction({
    action: "rollout.retry", fn: "retry_rollout_targets_v1", args: { p_rollout_id: rolloutId! },
    targetKind: "rollout", targetId: rolloutId,
  })).result;
}
```
`rolloutWithReason` is a plain async helper, not exported; Next only exposes the exported actions.

- [ ] **Step 2: Release copy**

`apps/platform-admin/app/_lib/release-copy.ts`:
```ts
export const releaseCopy = {
  releases: {
    title: ["Releases", "الإصدارات"],
    description: ["Registered versions, what each requires, and which instances want or run it.",
      "الإصدارات المسجّلة، وما يتطلبه كل منها، والنسخ التي تطلبه أو تشغّله."],
    register: ["Register release", "تسجيل إصدار"], registerTitle: ["Register a release", "تسجيل إصدار"],
    registerBody: ["Use the values from the generated release manifest (scripts/generate-release-manifest.mjs).",
      "استخدم القيم من ملف الإصدار المُولّد (scripts/generate-release-manifest.mjs)."],
    registered: ["Release registered.", "تم تسجيل الإصدار."],
    version: ["Version", "رقم الإصدار"], channel: ["Channel", "القناة"], commit: ["Git commit", "التزام Git"],
    configSchema: ["Configuration schema", "مخطط الإعدادات"], backendMin: ["Backend contract (min)", "عقد الخادم (أدنى)"],
    backendMax: ["Backend contract (max)", "عقد الخادم (أعلى)"], migrations: ["Required migrations", "الترحيلات المطلوبة"],
    migrationsHint: ["One migration ID per line, e.g. 20261006120000_platform_admin_foundation.", "معرّف ترحيل في كل سطر."],
    featureNotes: ["Feature notes", "ملاحظات الميزات"], upgradeNotes: ["Upgrade notes", "ملاحظات الترقية"],
    notesHint: ["One note per line.", "ملاحظة في كل سطر."],
    reversible: ["Can be rolled back safely (no destructive migration)", "يمكن التراجع عنه بأمان (لا ترحيل مدمّر)"],
    status: ["Availability", "الإتاحة"], contract: ["Backend contract", "عقد الخادم"],
    prerequisites: ["Prerequisites", "المتطلبات المسبقة"], ready: ["No blockers right now", "لا توجد عوائق حاليًا"],
    desired: ["Instances wanting it", "نسخ تطلبه"], running: ["Instances reporting it", "نسخ تُبلّغ عنه"],
    rollouts: ["Rollouts", "عمليات النشر"], registeredBy: ["Registered by", "سجّله"], created: ["Registered", "تاريخ التسجيل"],
    notReversible: ["Irreversible", "غير قابل للتراجع"],
    withdraw: ["Withdraw", "سحب"], withdrawTitle: ["Withdraw this release?", "سحب هذا الإصدار؟"],
    withdrawBody: ["A withdrawn release cannot start new rollouts. Running instances are not changed.", "لا يمكن بدء عمليات نشر جديدة لإصدار مسحوب. لا تتغير النسخ العاملة."],
    makeAvailable: ["Make available", "إتاحة"], makeAvailableTitle: ["Make this release available again?", "إتاحة هذا الإصدار مجددًا؟"],
    statusChanged: ["Availability changed.", "تم تغيير الإتاحة."],
    versions: ["Instance versions", "إصدارات النسخ"], tenant: ["Tenant", "المستأجر"],
    desiredRelease: ["Desired", "المطلوب"], reportedRelease: ["Reported", "المُبلّغ"], reportedAt: ["Reported at", "وقت الإبلاغ"],
    createRollout: ["Create rollout", "إنشاء عملية نشر"], createRolloutTitle: ["Create a rollout", "إنشاء عملية نشر"],
    createRolloutBody: ["Targets active instances in the chosen rings. Nothing is queued until you start it.", "يستهدف النسخ النشطة في الحلقات المختارة. لا يُضاف شيء للانتظار حتى تبدأه."],
    rings: ["Rings", "الحلقات"], rolloutCreated: ["Rollout created as a draft.", "أُنشئت عملية النشر كمسودة."],
    notes: ["Notes", "الملاحظات"], empty: ["No releases are registered.", "لا توجد إصدارات مسجّلة."],
  },
  rollouts: {
    title: ["Rollouts", "عمليات النشر"],
    description: ["Moving instances to a release. Progress counts only what the release worker reported.",
      "نقل النسخ إلى إصدار. يُحتسب التقدم مما أبلغ به عامل الإصدارات فقط."],
    status: ["Status", "الحالة"], version: ["Release", "الإصدار"], rings: ["Rings", "الحلقات"],
    progress: ["Done / failed / queued / total", "منجز / فاشل / بالانتظار / الكل"], createdBy: ["Created by", "أنشأها"],
    started: ["Started", "البداية"], finished: ["Finished", "النهاية"], reason: ["Reason", "السبب"],
    blocked: ["Blocking now", "يمنع حاليًا"], targets: ["Targets", "الأهداف"], tenant: ["Tenant", "المستأجر"],
    ring: ["Ring", "الحلقة"], from: ["From", "من"], attempts: ["Attempts", "المحاولات"], job: ["Job", "المهمة"],
    reported: ["Reported release", "الإصدار المُبلّغ"], history: ["History", "السجل"],
    workerNote: ["Queued targets wait for the release worker, which deploys and reports back. Nothing is marked done until it reports.",
      "تنتظر الأهداف عامل الإصدارات الذي ينشر ويُبلّغ. لا يُعدّ شيء منجزًا حتى يُبلّغ."],
    start: ["Start", "بدء"], startTitle: ["Start this rollout?", "بدء عملية النشر؟"],
    startBody: ["Checks prerequisites now, sets each target's desired release, and queues one deployment job per target.",
      "يتحقق من المتطلبات الآن، ويضبط الإصدار المطلوب لكل هدف، ويضيف مهمة نشر لكل هدف."],
    started_ok: ["Rollout started; deployments are queued.", "بدأت عملية النشر؛ مهام النشر في الانتظار."],
    resume: ["Resume", "استئناف"],
    pause: ["Pause", "إيقاف مؤقت"], pauseTitle: ["Pause this rollout?", "إيقاف عملية النشر مؤقتًا؟"],
    pauseBody: ["Unclaimed deployments are withdrawn. Deployments a worker already claimed finish.", "تُسحب عمليات النشر غير المستلمة. تكتمل التي استلمها عامل."],
    paused: ["Rollout paused.", "تم الإيقاف المؤقت."],
    retry: ["Retry failed targets", "إعادة محاولة الأهداف الفاشلة"], retryTitle: ["Retry failed targets?", "إعادة محاولة الأهداف الفاشلة؟"],
    retried: ["Failed targets queued again.", "أُعيدت جدولة الأهداف الفاشلة."],
    cancel: ["Cancel rollout", "إلغاء عملية النشر"], cancelTitle: ["Cancel this rollout?", "إلغاء عملية النشر؟"],
    cancelled: ["Rollout cancelled.", "أُلغيت عملية النشر."],
    rollback: ["Roll back", "تراجع"], rollbackTitle: ["Roll back to each instance's previous release?", "التراجع إلى الإصدار السابق لكل نسخة؟"],
    rollbackBody: ["Queues a deployment of the previous release for each target. Code rollback does not undo data migrations.",
      "يضيف نشر الإصدار السابق لكل هدف. التراجع عن الشيفرة لا يلغي ترحيلات البيانات."],
    rolledBack: ["Rollback queued.", "تمت جدولة التراجع."],
    rollbackUnavailable: ["This release was registered as irreversible, so rollback is not offered. Ship a forward fix.",
      "سُجّل هذا الإصدار كغير قابل للتراجع، لذا لا يُعرض التراجع. انشر إصلاحًا لاحقًا."],
    empty: ["No rollouts yet.", "لا توجد عمليات نشر بعد."],
  },
} as const;
```
Register in `copy.test.ts`: `import * as releases from "./release-copy";`.

- [ ] **Step 3: Releases list and registration**

`apps/platform-admin/app/[locale]/(console)/releases/page.tsx`:
```tsx
import { formatNumber } from "@wlbp/i18n";
import { Badge, TextField } from "@wlbp/ui-foundation";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { registerReleaseAction } from "../../../_lib/actions/releases";
import { copyFor, formCopy, reasonCopy, say, statusCopy } from "../../../_lib/copy";
import { listHref, parseListParams } from "../../../_lib/list-params";
import { callOperator } from "../../../_lib/operator-api";
import { atLeast, getOperator } from "../../../_lib/operator-page";
import { pageLocale } from "../../../_lib/page-locale";
import { releaseCopy } from "../../../_lib/release-copy";
import { PageHeader } from "../../../_lib/shell/page-header";
import { ActionDialog } from "../../../_lib/ui/action-dialog";
import { DataTable } from "../../../_lib/ui/data-table";
import { FilterBar, SelectFilter } from "../../../_lib/ui/filter-bar";
import { Pagination } from "../../../_lib/ui/pagination";
import { SelectField } from "../../../_lib/ui/select-field";
import { EmptyState, UnavailableState } from "../../../_lib/ui/states";
import { StatusBadge } from "../../../_lib/ui/status-badge";
import { TimeValue } from "../../../_lib/ui/time";

export const dynamic = "force-dynamic";

const c = releaseCopy.releases;
const channels = ["internal", "candidate", "stable"] as const;
const spec = { filters: { channel: channels, status: ["available", "withdrawn"] }, pageSize: 25 } as const;

export default async function ReleasesPage({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await pageLocale(params);
  const operator = await getOperator(locale);
  if (!operator) return null;
  const list = parseListParams(await searchParams, spec);
  const path = `/${locale}/releases`;
  const result = await callOperator("list_releases_v1", {
    p_channel: list.filters.channel, p_status: list.filters.status, p_limit: list.pageSize, p_offset: list.offset,
  });
  const status = (s: string) => copyFor(statusCopy, s, locale);

  return (
    <>
      <PageHeader locale={locale} title={say(locale, c.title)} description={say(locale, c.description)}
        actions={atLeast(operator.role, "admin") ? (
          <ActionDialog locale={locale} action={registerReleaseAction} trigger={say(locale, c.register)} triggerVariant="primary"
            title={say(locale, c.registerTitle)} description={say(locale, c.registerBody)} submit={say(locale, c.register)}
            successMessage={say(locale, c.registered)} hidden={{ idempotencyKey: randomUUID() }}>
            <div className="form-grid">
              <TextField id="r-version" name="version" label={say(locale, c.version)} required maxLength={40} autoComplete="off" />
              <SelectField name="channel" label={say(locale, c.channel)} value="candidate" options={channels.map((ch) => [ch, status(ch)] as const)} />
              <div className="full"><TextField id="r-commit" name="gitCommit" label={say(locale, c.commit)} required minLength={40} maxLength={64} autoComplete="off" /></div>
              <TextField id="r-schema" name="configSchemaVersion" label={say(locale, c.configSchema)} type="number" required />
              <span />
              <TextField id="r-min" name="backendMin" label={say(locale, c.backendMin)} type="number" required />
              <TextField id="r-max" name="backendMax" label={say(locale, c.backendMax)} type="number" required />
            </div>
            <label className="field"><span>{say(locale, c.migrations)}</span><textarea name="migrationIds" dir="ltr" rows={3} /><small>{say(locale, c.migrationsHint)}</small></label>
            <label className="field"><span>{say(locale, c.featureNotes)}</span><textarea name="featureNotes" required rows={3} /><small>{say(locale, c.notesHint)}</small></label>
            <label className="field"><span>{say(locale, c.upgradeNotes)}</span><textarea name="upgradeNotes" required rows={3} /><small>{say(locale, c.notesHint)}</small></label>
            <label className="checkbox"><input type="checkbox" name="reversible" defaultChecked /> {say(locale, c.reversible)}</label>
          </ActionDialog>
        ) : null} />
      <FilterBar locale={locale} path={path}>
        <SelectFilter name="channel" label={say(locale, c.channel)} value={list.filters.channel} allLabel={say(locale, formCopy.all)}
          options={channels.map((ch) => [ch, status(ch)] as const)} />
        <SelectFilter name="status" label={say(locale, c.status)} value={list.filters.status} allLabel={say(locale, formCopy.all)}
          options={spec.filters.status.map((s) => [s, status(s)] as const)} />
      </FilterBar>
      {!result.ok ? <UnavailableState locale={locale} code={result.code} />
        : result.data.length === 0 ? <EmptyState locale={locale} title={say(locale, c.empty)} filtered={Object.keys(list.filters).length > 0} />
        : (
          <>
            <DataTable id="releases-table" locale={locale} caption={say(locale, c.title)}
              columns={[{ label: say(locale, c.version) }, { label: say(locale, c.channel) }, { label: say(locale, c.status) },
                { label: say(locale, c.contract) }, { label: say(locale, c.prerequisites) },
                { label: say(locale, c.desired), numeric: true }, { label: say(locale, c.running), numeric: true }, { label: say(locale, c.created) }]}
              rows={result.data.map((row) => ({
                key: row.release_id,
                cells: [
                  <><Link href={`${path}/${row.release_id}`}><bdi>{row.version}</bdi></Link>
                    {!row.reversible ? <> <Badge tone="warning">{say(locale, c.notReversible)}</Badge></> : null}</>,
                  status(row.channel),
                  <StatusBadge key="s" locale={locale} status={row.status} />,
                  `${row.backend_contract_min}–${row.backend_contract_max}`,
                  row.prerequisites.length
                    ? <ul key="p">{row.prerequisites.map((p) => <li key={p}>{copyFor(reasonCopy, p, locale)}</li>)}</ul>
                    : say(locale, c.ready),
                  formatNumber(Number(row.instances_desired), locale),
                  formatNumber(Number(row.instances_current), locale),
                  <TimeValue key="t" locale={locale} value={row.created_at} />,
                ],
              }))} />
            <Pagination locale={locale} page={list.page} pageSize={list.pageSize} total={Number(result.data[0]?.total_count ?? 0)}
              href={(page) => listHref(path, list, { page })} />
          </>
        )}
    </>
  );
}
```

- [ ] **Step 4: Release detail**

`apps/platform-admin/app/[locale]/(console)/releases/[releaseId]/page.tsx`:
```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { createRolloutAction, setReleaseStatusAction } from "../../../../_lib/actions/releases";
import { copyFor, reasonCopy, say, stateCopy, statusCopy } from "../../../../_lib/copy";
import { callOperator } from "../../../../_lib/operator-api";
import { atLeast, getOperator } from "../../../../_lib/operator-page";
import { pageLocale } from "../../../../_lib/page-locale";
import { releaseCopy } from "../../../../_lib/release-copy";
import { PageHeader } from "../../../../_lib/shell/page-header";
import { ActionDialog } from "../../../../_lib/ui/action-dialog";
import { DataTable } from "../../../../_lib/ui/data-table";
import { Facts } from "../../../../_lib/ui/facts";
import { EmptyState, Unknown, UnavailableState } from "../../../../_lib/ui/states";
import { StatusBadge } from "../../../../_lib/ui/status-badge";
import { TimeValue } from "../../../../_lib/ui/time";

export const dynamic = "force-dynamic";

const c = releaseCopy.releases;

type Release = { id: string; version: string; channel: string; git_commit: string; config_schema_version: number;
  backend_contract_min: number; backend_contract_max: number; migration_ids: string[]; feature_notes: string[];
  upgrade_notes: string[]; reversible: boolean; status: string; created_at: string; registered_by_email: string | null;
  prerequisites: string[]; backend_contract_version: number;
  versions: { instance_id: string; tenant_id: string; tenant_name: string; desired_release: string | null;
    current_release: string | null; config_schema_version: number; reported_at: string | null }[];
  rollouts: { id: string; status: string; target_rings: string[]; created_at: string }[] };

export default async function ReleasePage({ params }: { params: Promise<{ locale: string; releaseId: string }> }) {
  const locale = await pageLocale(params);
  const { releaseId } = await params;
  const operator = await getOperator(locale);
  if (!operator) return null;
  if (!/^[0-9a-f-]{36}$/u.test(releaseId)) notFound();
  const result = await callOperator("get_release_v1", { p_release_id: releaseId });
  if (!result.ok && result.code === "not_found") notFound();
  const crumbs = [[say(locale, c.title), `/${locale}/releases`]] as const;
  if (!result.ok) return <><PageHeader locale={locale} title={say(locale, c.title)} breadcrumbs={crumbs} /><UnavailableState locale={locale} code={result.code} /></>;
  const r = result.data as unknown as Release;
  const admin = atLeast(operator.role, "admin");
  const status = (s: string) => copyFor(statusCopy, s, locale);

  return (
    <>
      <PageHeader locale={locale} title={r.version} breadcrumbs={[...crumbs, [r.version]]}
        actions={<>
          <StatusBadge locale={locale} status={r.status} />
          {admin && r.status === "available" ? (
            <ActionDialog locale={locale} action={createRolloutAction} trigger={say(locale, c.createRollout)} triggerVariant="primary"
              title={say(locale, c.createRolloutTitle)} description={say(locale, c.createRolloutBody)} submit={say(locale, c.createRollout)}
              successMessage={say(locale, c.rolloutCreated)} reason={{ minLength: 5 }}
              hidden={{ releaseId: r.id, idempotencyKey: randomUUID() }}>
              <fieldset>
                <legend>{say(locale, c.rings)}</legend>
                {(["canary", "early", "general"] as const).map((ring) => (
                  <label key={ring} className="checkbox"><input type="checkbox" name="rings" value={ring} defaultChecked={ring === "canary"} /> {status(ring)}</label>
                ))}
              </fieldset>
            </ActionDialog>
          ) : null}
          {admin ? (
            <ActionDialog locale={locale} action={setReleaseStatusAction} danger={r.status === "available"}
              trigger={say(locale, r.status === "available" ? c.withdraw : c.makeAvailable)}
              title={say(locale, r.status === "available" ? c.withdrawTitle : c.makeAvailableTitle)}
              description={r.status === "available" ? say(locale, c.withdrawBody) : undefined}
              submit={say(locale, r.status === "available" ? c.withdraw : c.makeAvailable)}
              successMessage={say(locale, c.statusChanged)} reason={{ minLength: 5 }}
              hidden={{ releaseId: r.id, status: r.status === "available" ? "withdrawn" : "available" }} />
          ) : null}
        </>} />

      <section className="section" aria-labelledby="release-facts">
        <h2 id="release-facts" className="sr-only">{r.version}</h2>
        <Facts items={[
          [say(locale, c.channel), status(r.channel)],
          [say(locale, c.commit), <bdi key="g">{r.git_commit}</bdi>],
          [say(locale, c.configSchema), String(r.config_schema_version)],
          [say(locale, c.contract), `${r.backend_contract_min}–${r.backend_contract_max} (${r.backend_contract_version})`],
          [say(locale, c.reversible), say(locale, r.reversible ? stateCopy.yes : stateCopy.no)],
          [say(locale, c.registeredBy), <bdi key="b">{r.registered_by_email ?? "—"}</bdi>],
          [say(locale, c.created), <TimeValue key="t" locale={locale} value={r.created_at} />],
          [say(locale, c.migrations), r.migration_ids.length ? <bdi key="m">{r.migration_ids.join(", ")}</bdi> : <Unknown key="m" locale={locale} kind="none" />],
        ]} />
      </section>

      <section className="section" aria-labelledby="prereq-title">
        <div className="section-header"><h2 id="prereq-title">{say(locale, c.prerequisites)}</h2></div>
        {r.prerequisites.length
          ? <ul>{r.prerequisites.map((p) => <li key={p}>{copyFor(reasonCopy, p, locale)} <bdi className="secondary">{p}</bdi></li>)}</ul>
          : <p>{say(locale, c.ready)}</p>}
      </section>

      <section className="section" aria-labelledby="notes-title">
        <div className="section-header"><h2 id="notes-title">{say(locale, c.notes)}</h2></div>
        <h3>{say(locale, c.featureNotes)}</h3><ul>{r.feature_notes.map((n) => <li key={n}>{n}</li>)}</ul>
        <h3>{say(locale, c.upgradeNotes)}</h3><ul>{r.upgrade_notes.map((n) => <li key={n}>{n}</li>)}</ul>
      </section>

      <section className="section" aria-labelledby="versions-title">
        <div className="section-header"><h2 id="versions-title">{say(locale, c.versions)}</h2></div>
        {r.versions.length === 0 ? <EmptyState locale={locale} /> : (
          <DataTable id="versions-table" locale={locale} caption={say(locale, c.versions)}
            columns={[{ label: say(locale, c.tenant) }, { label: say(locale, c.desiredRelease) }, { label: say(locale, c.reportedRelease) },
              { label: say(locale, c.reportedAt) }]}
            rows={r.versions.map((v) => ({
              key: v.instance_id,
              cells: [
                <Link key="t" href={`/${locale}/instances/${v.instance_id}`}><bdi>{v.tenant_name}</bdi></Link>,
                <bdi key="d">{v.desired_release ?? "—"}</bdi>,
                v.current_release ? <bdi key="c">{v.current_release}</bdi> : <Unknown key="c" locale={locale} kind="notReported" />,
                <TimeValue key="r" locale={locale} value={v.reported_at} empty="notReported" />,
              ],
            }))} />
        )}
      </section>

      <section className="section" aria-labelledby="rollouts-title">
        <div className="section-header"><h2 id="rollouts-title">{say(locale, c.rollouts)}</h2></div>
        {r.rollouts.length === 0 ? <EmptyState locale={locale} /> : (
          <ul>
            {r.rollouts.map((o) => (
              <li key={o.id}>
                <Link href={`/${locale}/rollouts/${o.id}`}>{o.target_rings.map(status).join(", ") || "—"}</Link>{" "}
                <StatusBadge locale={locale} status={o.status} /> <TimeValue locale={locale} value={o.created_at} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
```

- [ ] **Step 5: Rollouts list**

`apps/platform-admin/app/[locale]/(console)/rollouts/page.tsx`:
```tsx
import { formatNumber } from "@wlbp/i18n";
import Link from "next/link";
import { copyFor, formCopy, say, statusCopy } from "../../../_lib/copy";
import { listHref, parseListParams } from "../../../_lib/list-params";
import { callOperator } from "../../../_lib/operator-api";
import { getOperator } from "../../../_lib/operator-page";
import { pageLocale } from "../../../_lib/page-locale";
import { releaseCopy } from "../../../_lib/release-copy";
import { PageHeader } from "../../../_lib/shell/page-header";
import { DataTable } from "../../../_lib/ui/data-table";
import { FilterBar, SelectFilter } from "../../../_lib/ui/filter-bar";
import { Pagination } from "../../../_lib/ui/pagination";
import { EmptyState, UnavailableState } from "../../../_lib/ui/states";
import { StatusBadge } from "../../../_lib/ui/status-badge";
import { TimeValue } from "../../../_lib/ui/time";

export const dynamic = "force-dynamic";

const c = releaseCopy.rollouts;
const statuses = ["draft", "running", "paused", "completed", "failed", "cancelled", "rolled_back"] as const;
const spec = { filters: { status: statuses, release: "uuid" }, pageSize: 25 } as const;

export default async function RolloutsPage({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await pageLocale(params);
  if (!(await getOperator(locale))) return null;
  const list = parseListParams(await searchParams, spec);
  const path = `/${locale}/rollouts`;
  const result = await callOperator("list_rollouts_v1", {
    p_status: list.filters.status, p_release_id: list.filters.release, p_limit: list.pageSize, p_offset: list.offset,
  });
  const status = (s: string) => copyFor(statusCopy, s, locale);
  const n = (value: number) => formatNumber(value, locale);

  return (
    <>
      <PageHeader locale={locale} title={say(locale, c.title)} description={say(locale, c.description)} />
      <FilterBar locale={locale} path={path}>
        <SelectFilter name="status" label={say(locale, c.status)} value={list.filters.status} allLabel={say(locale, formCopy.all)}
          options={statuses.map((s) => [s, status(s)] as const)} />
        {list.filters.release ? <input type="hidden" name="release" value={list.filters.release} /> : null}
      </FilterBar>
      {!result.ok ? <UnavailableState locale={locale} code={result.code} />
        : result.data.length === 0 ? <EmptyState locale={locale} title={say(locale, c.empty)} filtered={Object.keys(list.filters).length > 0} />
        : (
          <>
            <DataTable id="rollouts-table" locale={locale} caption={say(locale, c.title)}
              columns={[{ label: say(locale, c.version) }, { label: say(locale, c.status) }, { label: say(locale, c.rings) },
                { label: say(locale, c.progress), numeric: true }, { label: say(locale, c.createdBy) }, { label: say(locale, c.started) }]}
              rows={result.data.map((row) => ({
                key: row.rollout_id,
                cells: [
                  <Link key="v" href={`${path}/${row.rollout_id}`}><bdi>{row.version}</bdi></Link>,
                  <StatusBadge key="s" locale={locale} status={row.status} />,
                  row.target_rings.map(status).join(", ") || "—",
                  `${n(Number(row.targets_succeeded))} / ${n(Number(row.targets_failed))} / ${n(Number(row.targets_queued))} / ${n(Number(row.targets_total))}`,
                  <bdi key="b">{row.created_by_email ?? "—"}</bdi>,
                  <TimeValue key="t" locale={locale} value={row.started_at} />,
                ],
              }))} />
            <Pagination locale={locale} page={list.page} pageSize={list.pageSize} total={Number(result.data[0]?.total_count ?? 0)}
              href={(page) => listHref(path, list, { page })} />
          </>
        )}
    </>
  );
}
```

- [ ] **Step 6: Rollout detail and controls**

`apps/platform-admin/app/[locale]/(console)/rollouts/[rolloutId]/page.tsx`:
```tsx
import { formatNumber } from "@wlbp/i18n";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  cancelRolloutAction, pauseRolloutAction, retryRolloutAction, rollbackRolloutAction, startRolloutAction,
} from "../../../../_lib/actions/releases";
import type { AuditRow } from "../../../../_lib/audit-copy";
import { copyFor, reasonCopy, say, statusCopy } from "../../../../_lib/copy";
import { callOperator } from "../../../../_lib/operator-api";
import { atLeast, getOperator } from "../../../../_lib/operator-page";
import { pageLocale } from "../../../../_lib/page-locale";
import { releaseCopy } from "../../../../_lib/release-copy";
import { PageHeader } from "../../../../_lib/shell/page-header";
import { ActionDialog } from "../../../../_lib/ui/action-dialog";
import { AuditList } from "../../../../_lib/ui/audit-list";
import { DataTable } from "../../../../_lib/ui/data-table";
import { Facts } from "../../../../_lib/ui/facts";
import { EmptyState, Unknown, UnavailableState } from "../../../../_lib/ui/states";
import { StatusBadge } from "../../../../_lib/ui/status-badge";
import { TimeValue } from "../../../../_lib/ui/time";

export const dynamic = "force-dynamic";

const c = releaseCopy.rollouts;

type Rollout = { id: string; status: string; target_rings: string[]; reason: string; created_by_email: string | null;
  started_at: string | null; finished_at: string | null; created_at: string; updated_at: string;
  release: { id: string; version: string; channel: string; reversible: boolean; status: string };
  blocked: string[]; counts: Record<string, number>;
  targets: { instance_id: string; tenant_id: string; tenant_name: string; ring: string | null; from_release: string | null;
    status: string; attempts: number; error_code: string | null; job_id: string | null; job_status: string | null;
    current_release: string | null; reported_at: string | null; updated_at: string }[];
  history: AuditRow[] };

export default async function RolloutPage({ params }: { params: Promise<{ locale: string; rolloutId: string }> }) {
  const locale = await pageLocale(params);
  const { rolloutId } = await params;
  const operator = await getOperator(locale);
  if (!operator) return null;
  if (!/^[0-9a-f-]{36}$/u.test(rolloutId)) notFound();
  const result = await callOperator("get_rollout_v1", { p_rollout_id: rolloutId });
  if (!result.ok && result.code === "not_found") notFound();
  const crumbs = [[say(locale, c.title), `/${locale}/rollouts`]] as const;
  if (!result.ok) return <><PageHeader locale={locale} title={say(locale, c.title)} breadcrumbs={crumbs} /><UnavailableState locale={locale} code={result.code} /></>;
  const o = result.data as unknown as Rollout;
  const hidden = { rolloutId: o.id };
  const admin = atLeast(operator.role, "admin");
  const operatorRole = atLeast(operator.role, "operator");
  const status = (s: string) => copyFor(statusCopy, s, locale);
  const hasFailed = (o.counts.failed ?? 0) > 0;
  const title = `${o.release.version} · ${o.target_rings.map(status).join(", ")}`;

  return (
    <>
      <PageHeader locale={locale} title={title} breadcrumbs={[...crumbs, [o.release.version]]}
        actions={<>
          <StatusBadge locale={locale} status={o.status} />
          {admin && (o.status === "draft" || o.status === "paused") ? (
            <ActionDialog locale={locale} action={startRolloutAction} triggerVariant="primary"
              trigger={say(locale, o.status === "draft" ? c.start : c.resume)} title={say(locale, c.startTitle)}
              description={say(locale, c.startBody)} submit={say(locale, o.status === "draft" ? c.start : c.resume)}
              successMessage={say(locale, c.started_ok)} hidden={hidden} />
          ) : null}
          {operatorRole && o.status === "running" ? (
            <ActionDialog locale={locale} action={pauseRolloutAction} trigger={say(locale, c.pause)} title={say(locale, c.pauseTitle)}
              description={say(locale, c.pauseBody)} submit={say(locale, c.pause)} successMessage={say(locale, c.paused)}
              reason={{ minLength: 5 }} hidden={hidden} />
          ) : null}
          {operatorRole && hasFailed && ["running", "paused", "failed"].includes(o.status) ? (
            <ActionDialog locale={locale} action={retryRolloutAction} trigger={say(locale, c.retry)} title={say(locale, c.retryTitle)}
              submit={say(locale, c.retry)} successMessage={say(locale, c.retried)} hidden={hidden} />
          ) : null}
          {admin && ["draft", "running", "paused"].includes(o.status) ? (
            <ActionDialog locale={locale} action={cancelRolloutAction} trigger={say(locale, c.cancel)} danger
              title={say(locale, c.cancelTitle)} submit={say(locale, c.cancel)} successMessage={say(locale, c.cancelled)}
              reason={{ minLength: 5 }} hidden={hidden} />
          ) : null}
          {admin && o.release.reversible && ["running", "paused", "completed", "failed"].includes(o.status) ? (
            <ActionDialog locale={locale} action={rollbackRolloutAction} trigger={say(locale, c.rollback)} danger
              title={say(locale, c.rollbackTitle)} description={say(locale, c.rollbackBody)} submit={say(locale, c.rollback)}
              successMessage={say(locale, c.rolledBack)} reason={{ minLength: 10 }} confirmText={o.release.version} hidden={hidden} />
          ) : null}
        </>} />
      {!o.release.reversible ? <p className="notice notice--warning">{say(locale, c.rollbackUnavailable)}</p> : null}
      {["running", "paused"].includes(o.status) ? <p className="notice">{say(locale, c.workerNote)}</p> : null}

      <section className="section" aria-labelledby="rollout-facts">
        <h2 id="rollout-facts" className="sr-only">{title}</h2>
        <Facts items={[
          [say(locale, c.version), <Link key="r" href={`/${locale}/releases/${o.release.id}`}><bdi>{o.release.version}</bdi></Link>],
          [say(locale, c.reason), o.reason],
          [say(locale, c.createdBy), <bdi key="b">{o.created_by_email ?? "—"}</bdi>],
          [say(locale, c.started), <TimeValue key="s" locale={locale} value={o.started_at} />],
          [say(locale, c.finished), <TimeValue key="f" locale={locale} value={o.finished_at} />],
          [say(locale, c.progress), Object.entries(o.counts).map(([k, v]) => `${status(k)}: ${formatNumber(v, locale)}`).join(" · ")],
          [say(locale, c.blocked), o.blocked.length
            ? <ul key="bl">{o.blocked.map((b) => <li key={b}>{copyFor(reasonCopy, b, locale)}</li>)}</ul>
            : <Unknown key="bl" locale={locale} kind="none" />],
        ]} />
      </section>

      <section className="section" aria-labelledby="targets-title">
        <div className="section-header"><h2 id="targets-title">{say(locale, c.targets)}</h2></div>
        {o.targets.length === 0 ? <EmptyState locale={locale} /> : (
          <DataTable id="targets-table" locale={locale} caption={say(locale, c.targets)}
            columns={[{ label: say(locale, c.tenant) }, { label: say(locale, c.ring) }, { label: say(locale, c.from) },
              { label: say(locale, c.status) }, { label: say(locale, c.attempts), numeric: true }, { label: say(locale, c.job) },
              { label: say(locale, c.reported) }]}
            rows={o.targets.map((t) => ({
              key: t.instance_id,
              cells: [
                <Link key="t" href={`/${locale}/instances/${t.instance_id}`}><bdi>{t.tenant_name}</bdi></Link>,
                t.ring ? status(t.ring) : <Unknown key="r" locale={locale} kind="none" />,
                t.from_release ? <bdi key="f">{t.from_release}</bdi> : <Unknown key="f" locale={locale} kind="notReported" />,
                <>
                  <StatusBadge locale={locale} status={t.status} />
                  {t.error_code ? <span className="secondary">{copyFor(reasonCopy, t.error_code, locale)} <bdi>{t.error_code}</bdi></span> : null}
                </>,
                String(t.attempts),
                t.job_id ? <Link key="j" href={`/${locale}/jobs/${t.job_id}`}>{status(t.job_status ?? "queued")}</Link> : <Unknown key="j" locale={locale} kind="none" />,
                t.current_release
                  ? <><bdi>{t.current_release}</bdi> <TimeValue locale={locale} value={t.reported_at} /></>
                  : <Unknown locale={locale} kind="notReported" />,
              ],
            }))} />
        )}
      </section>

      <section className="section" aria-labelledby="history-title">
        <div className="section-header"><h2 id="history-title">{say(locale, c.history)}</h2></div>
        {o.history.length ? <AuditList locale={locale} rows={o.history} /> : <EmptyState locale={locale} />}
      </section>
    </>
  );
}
```
The rollback dialog requires typing the version number, because it is the one irreversible-in-effect action here.

- [ ] **Step 7: Verify and commit**

Run:
```bash
rtk pnpm --filter @wlbp/platform-admin test:unit
rtk pnpm --filter @wlbp/platform-admin typecheck
rtk pnpm exec eslint apps/platform-admin --max-warnings=0
```
Expected: pass.
```bash
rtk git add apps/platform-admin/app/_lib/actions/releases.ts apps/platform-admin/app/_lib/release-copy.ts \
  "apps/platform-admin/app/[locale]/(console)/releases" "apps/platform-admin/app/[locale]/(console)/rollouts" \
  apps/platform-admin/app/_lib/copy.test.ts
rtk git commit -m "Let admins register releases and run guarded rollouts"
```

### Task 18: Health, alerts and support access

**Files:**
- Modify: `apps/platform-admin/app/_lib/actions/support.ts` (add approve and revoke)
- Create: `apps/platform-admin/app/_lib/health-support-copy.ts`
- Create: `apps/platform-admin/app/[locale]/(console)/health/page.tsx`
- Create: `apps/platform-admin/app/[locale]/(console)/support/page.tsx`
- Modify: `apps/platform-admin/app/_lib/copy.test.ts` (register `health-support-copy`)

**Interfaces:**
- Consumes: `requestSupportAction` (Task 14), `overviewCopy.alertKinds` (Task 13), `actionCopy.requestSupport` (Task 14).
- Produces: `approveSupportAction` (`grantId`, `tenantId`, `minutes`) → `approve_support_access_v1`; `revokeSupportAction` (`grantId`, `tenantId`, `reason`) → `revoke_support_grant_v1`.

- [ ] **Step 1: Approve and revoke actions**

Append to `apps/platform-admin/app/_lib/actions/support.ts`:
```ts
export async function approveSupportAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const grantId = uuid(form, "grantId");
  const invalid = missing(grantId);
  if (invalid) return invalid;
  return (await runOperatorAction({
    action: "support.approve", fn: "approve_support_access_v1",
    args: { p_grant_id: grantId!, p_minutes: integer(form, "minutes") ?? 60 },
    tenantId: uuid(form, "tenantId"), targetKind: "support_grant", targetId: grantId,
  })).result;
}

export async function revokeSupportAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const grantId = uuid(form, "grantId");
  const invalid = missing(grantId);
  if (invalid) return invalid;
  return (await runOperatorAction({
    action: "support.revoke", fn: "revoke_support_grant_v1",
    args: { p_grant_id: grantId!, p_reason: text(form, "reason") },
    tenantId: uuid(form, "tenantId"), targetKind: "support_grant", targetId: grantId,
  })).result;
}
```

- [ ] **Step 2: Copy**

`apps/platform-admin/app/_lib/health-support-copy.ts`:
```ts
export const healthCopy = {
  title: ["Health", "الحالة التشغيلية"],
  description: ["Observed instance and integration health, and alerts derived from stored evidence.",
    "حالة النسخ والتكاملات كما رُصدت، والتنبيهات المستخلصة من البيانات المخزنة."],
  scope: ["Only stored observations are shown. Uptime, latency and delivery rates are not collected, so none are displayed. An observation older than 30 minutes is marked stale.",
    "تُعرض الملاحظات المخزنة فقط. لا تُجمع نسب التشغيل أو زمن الاستجابة أو التسليم، لذا لا تُعرض. الملاحظة الأقدم من ٣٠ دقيقة تُعلَّم بأنها قديمة."],
  alerts: ["Alerts", "التنبيهات"], noAlerts: ["No alerts from stored evidence.", "لا توجد تنبيهات من البيانات المخزنة."],
  observations: ["Observations", "الملاحظات"], status: ["Status", "الحالة"], subject: ["Subject", "الموضوع"],
  kind: ["Kind", "النوع"], tenant: ["Tenant", "المستأجر"], signal: ["Signal", "المؤشر"], observed: ["Observed", "وقت الرصد"],
  freshness: ["Freshness", "الحداثة"], kinds: { instance: ["Instance", "نسخة"], integration: ["Integration", "تكامل"] },
  queues: ["Queues", "قوائم الانتظار"], queuedJobs: ["Queued jobs", "مهام في الانتظار"], failedJobs: ["Failed jobs", "مهام فاشلة"],
  waitingRuns: ["Provisioning waiting", "تهيئة بانتظار"],
} as const;

export const supportCopy = {
  title: ["Support access", "وصول الدعم"],
  description: ["Read-only, time-limited access to one tenant, approved by a second administrator and visible to the tenant.",
    "وصول للقراءة فقط ومحدود المدة إلى مستأجر واحد، بموافقة مسؤول ثانٍ ومرئي للمستأجر."],
  rules: ["There is no impersonation: the operator stays themselves, cannot change anything, and access ends at expiry, on revocation, or when their operator access is removed.",
    "لا يوجد انتحال للهوية: يبقى المشغّل بهويته، ولا يمكنه تعديل أي شيء، وينتهي الوصول عند انقضاء المدة أو الإلغاء أو إزالة صلاحيته."],
  status: ["Status", "الحالة"], tenant: ["Tenant", "المستأجر"], requestedBy: ["Requested by", "طلبه"],
  approvedBy: ["Approved by", "وافق عليه"], ticket: ["Ticket", "التذكرة"], reason: ["Reason", "السبب"],
  scope: ["Scope", "النطاق"], readOnly: ["Read only", "قراءة فقط"], expires: ["Ends", "ينتهي"],
  requested: ["Requested", "وقت الطلب"], actions: ["Actions", "الإجراءات"],
  approve: ["Approve", "موافقة"], approveTitle: ["Approve this support access?", "الموافقة على وصول الدعم هذا؟"],
  approveBody: ["Access starts now and ends after the duration you set. You cannot approve your own request.",
    "يبدأ الوصول الآن وينتهي بعد المدة التي تحددها. لا يمكنك الموافقة على طلبك."],
  duration: ["Duration (minutes, 5–480)", "المدة (بالدقائق، ٥–٤٨٠)"], approved: ["Support access approved.", "تمت الموافقة على وصول الدعم."],
  revoke: ["End access", "إنهاء الوصول"], revokeTitle: ["End this support access now?", "إنهاء وصول الدعم الآن؟"],
  revoked: ["Support access ended.", "انتهى وصول الدعم."],
  tenantField: ["Tenant", "المستأجر"],
} as const;
```
Register in `copy.test.ts`: `import * as healthSupport from "./health-support-copy";`.

- [ ] **Step 3: Health page**

`apps/platform-admin/app/[locale]/(console)/health/page.tsx`:
```tsx
import { Badge } from "@wlbp/ui-foundation";
import Link from "next/link";
import { copyFor, formCopy, say, statusCopy } from "../../../_lib/copy";
import { healthCopy as c } from "../../../_lib/health-support-copy";
import { listHref, parseListParams } from "../../../_lib/list-params";
import { callOperator } from "../../../_lib/operator-api";
import { getOperator } from "../../../_lib/operator-page";
import { pageLocale } from "../../../_lib/page-locale";
import { PageHeader } from "../../../_lib/shell/page-header";
import { DataTable } from "../../../_lib/ui/data-table";
import { FilterBar, SelectFilter } from "../../../_lib/ui/filter-bar";
import { Pagination } from "../../../_lib/ui/pagination";
import { EmptyState, Unknown, UnavailableState } from "../../../_lib/ui/states";
import { StatusBadge } from "../../../_lib/ui/status-badge";
import { TimeValue } from "../../../_lib/ui/time";
import { overviewCopy } from "../copy";

export const dynamic = "force-dynamic";

const spec = {
  filters: { status: ["failing", "degraded", "unknown", "stale", "healthy"], kind: ["instance", "integration"] },
  pageSize: 50,
} as const;

export default async function HealthPage({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await pageLocale(params);
  if (!(await getOperator(locale))) return null;
  const list = parseListParams(await searchParams, spec);
  const path = `/${locale}/health`;
  const [alerts, health] = await Promise.all([
    callOperator("list_alerts_v1"),
    callOperator("list_health_v1", {
      p_status: list.filters.status, p_subject_kind: list.filters.kind, p_limit: list.pageSize, p_offset: list.offset,
    }),
  ]);
  const p = (path: string) => `/${locale}/${path}`;

  return (
    <>
      <PageHeader locale={locale} title={say(locale, c.title)} description={say(locale, c.description)}
        actions={<>
          <Link href={p("jobs?status=queued")}>{say(locale, c.queuedJobs)}</Link>
          <Link href={p("jobs?status=failed")}>{say(locale, c.failedJobs)}</Link>
          <Link href={p("provisioning?state=waiting")}>{say(locale, c.waitingRuns)}</Link>
        </>} />
      <p className="notice">{say(locale, c.scope)}</p>

      <section className="section" aria-labelledby="alerts-title">
        <div className="section-header"><h2 id="alerts-title">{say(locale, c.alerts)}</h2></div>
        {!alerts.ok ? <UnavailableState locale={locale} code={alerts.code} />
          : alerts.data.length === 0 ? <EmptyState locale={locale} title={say(locale, c.noAlerts)} />
          : (
            <DataTable id="alerts-table" locale={locale} caption={say(locale, c.alerts)}
              columns={[{ label: say(locale, c.status) }, { label: say(locale, c.kind) }, { label: say(locale, c.tenant) },
                { label: say(locale, c.signal) }, { label: say(locale, c.observed) }]}
              rows={alerts.data.map((a, index) => ({
                key: `${a.kind}:${a.subject_id}:${index}`,
                cells: [
                  <Badge key="s" tone={a.severity === "critical" ? "danger" : "warning"}>
                    {say(locale, a.severity === "critical" ? overviewCopy.severityCritical : overviewCopy.severityWarning)}
                  </Badge>,
                  say(locale, overviewCopy.alertKinds[a.kind as keyof typeof overviewCopy.alertKinds] ?? overviewCopy.alerts),
                  a.tenant_id ? <Link key="t" href={p(`tenants/${a.tenant_id}`)}><bdi>{a.tenant_name}</bdi></Link> : <Unknown key="t" locale={locale} kind="none" />,
                  a.code ? <bdi key="c">{a.code}</bdi> : <Unknown key="c" locale={locale} kind="none" />,
                  <TimeValue key="o" locale={locale} value={a.observed_at} empty="notReported" />,
                ],
              }))} />
          )}
      </section>

      <section className="section" aria-labelledby="obs-title">
        <div className="section-header"><h2 id="obs-title">{say(locale, c.observations)}</h2></div>
        <FilterBar locale={locale} path={path}>
          <SelectFilter name="status" label={say(locale, c.status)} value={list.filters.status} allLabel={say(locale, formCopy.all)}
            options={spec.filters.status.map((s) => [s, copyFor(statusCopy, s, locale)] as const)} />
          <SelectFilter name="kind" label={say(locale, c.kind)} value={list.filters.kind} allLabel={say(locale, formCopy.all)}
            options={spec.filters.kind.map((k) => [k, say(locale, c.kinds[k])] as const)} />
        </FilterBar>
        {!health.ok ? <UnavailableState locale={locale} code={health.code} />
          : health.data.length === 0 ? <EmptyState locale={locale} filtered={Object.keys(list.filters).length > 0} />
          : (
            <>
              <DataTable id="health-table" locale={locale} caption={say(locale, c.observations)}
                columns={[{ label: say(locale, c.subject) }, { label: say(locale, c.tenant) }, { label: say(locale, c.signal) },
                  { label: say(locale, c.status) }, { label: say(locale, c.freshness) }, { label: say(locale, c.observed) }]}
                rows={health.data.map((h, index) => ({
                  key: `${h.instance_id ?? h.subject_key}:${h.signal}:${index}`,
                  cells: [
                    h.instance_id
                      ? <Link key="i" href={p(`instances/${h.instance_id}`)}>{say(locale, c.kinds.instance)} <bdi>{h.instance_id.slice(0, 8)}</bdi></Link>
                      : <>{say(locale, c.kinds.integration)} <bdi>{h.subject_key}</bdi></>,
                    h.tenant_name ? <bdi key="t">{h.tenant_name}</bdi> : <Unknown key="t" locale={locale} kind="none" />,
                    <bdi key="s">{h.subject_key} · {h.signal}</bdi>,
                    <><StatusBadge locale={locale} status={h.status} />{h.error_code ? <span className="secondary"><bdi>{h.error_code}</bdi></span> : null}</>,
                    <StatusBadge key="f" locale={locale} status={h.freshness} />,
                    <TimeValue key="o" locale={locale} value={h.observed_at} empty="notObserved" staleAfterMinutes={30} />,
                  ],
                }))} />
              <Pagination locale={locale} page={list.page} pageSize={list.pageSize} total={Number(health.data[0]?.total_count ?? 0)}
                href={(page) => listHref(path, list, { page })} />
            </>
          )}
      </section>
    </>
  );
}
```
An unobserved instance arrives from `list_health_v1` with `status = "unknown"` and `freshness = "never"`, rendered as "Not observed" / "Never observed", never as healthy.

- [ ] **Step 4: Support access page**

`apps/platform-admin/app/[locale]/(console)/support/page.tsx`:
```tsx
import { TextField } from "@wlbp/ui-foundation";
import Link from "next/link";
import { actionCopy as a } from "../../../_lib/action-copy";
import { approveSupportAction, requestSupportAction, revokeSupportAction } from "../../../_lib/actions/support";
import { copyFor, formCopy, say, statusCopy } from "../../../_lib/copy";
import { supportCopy as c } from "../../../_lib/health-support-copy";
import { listHref, parseListParams } from "../../../_lib/list-params";
import { callOperator } from "../../../_lib/operator-api";
import { atLeast, getOperator } from "../../../_lib/operator-page";
import { pageLocale } from "../../../_lib/page-locale";
import { PageHeader } from "../../../_lib/shell/page-header";
import { ActionDialog } from "../../../_lib/ui/action-dialog";
import { DataTable } from "../../../_lib/ui/data-table";
import { FilterBar, SelectFilter } from "../../../_lib/ui/filter-bar";
import { Pagination } from "../../../_lib/ui/pagination";
import { SelectField } from "../../../_lib/ui/select-field";
import { EmptyState, Unknown, UnavailableState } from "../../../_lib/ui/states";
import { StatusBadge } from "../../../_lib/ui/status-badge";
import { TimeValue } from "../../../_lib/ui/time";

export const dynamic = "force-dynamic";

const statuses = ["pending", "active", "expired", "revoked"] as const;
const spec = { filters: { status: statuses, tenant: "uuid" }, pageSize: 25 } as const;

export default async function SupportPage({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await pageLocale(params);
  const operator = await getOperator(locale);
  if (!operator) return null;
  const list = parseListParams(await searchParams, spec);
  const path = `/${locale}/support`;
  const operatorRole = atLeast(operator.role, "operator");
  const [result, tenants] = await Promise.all([
    callOperator("list_support_grants_v2", {
      p_status: list.filters.status, p_tenant_id: list.filters.tenant, p_limit: list.pageSize, p_offset: list.offset,
    }),
    operatorRole ? callOperator("list_tenants_v1", { p_status: "active", p_sort: "name", p_limit: 100 }) : null,
  ]);

  return (
    <>
      <PageHeader locale={locale} title={say(locale, c.title)} description={say(locale, c.description)}
        actions={operatorRole && tenants?.ok && tenants.data.length ? (
          <ActionDialog locale={locale} action={requestSupportAction} trigger={say(locale, a.requestSupport.trigger)} triggerVariant="primary"
            title={say(locale, a.requestSupport.title)} description={say(locale, a.requestSupport.body)}
            submit={say(locale, a.requestSupport.submit)} successMessage={say(locale, a.requestSupport.done)} reason={{ minLength: 10 }}>
            <SelectField name="tenantId" label={say(locale, c.tenantField)} value={list.filters.tenant}
              options={tenants.data.map((t) => [t.tenant_id, t.name] as const)} />
            <TextField id="support-ticket" name="ticket" label={say(locale, a.fields.ticket)} required maxLength={120} />
            <label className="field"><span>{say(locale, a.fields.minutes)}</span>
              <input type="number" name="minutes" min={5} max={480} defaultValue={60} required />
              <small>{say(locale, a.fields.minutesHint)}</small></label>
          </ActionDialog>
        ) : null} />
      <p className="notice">{say(locale, c.rules)}</p>
      <FilterBar locale={locale} path={path}>
        <SelectFilter name="status" label={say(locale, c.status)} value={list.filters.status} allLabel={say(locale, formCopy.all)}
          options={statuses.map((s) => [s, copyFor(statusCopy, s, locale)] as const)} />
        {list.filters.tenant ? <input type="hidden" name="tenant" value={list.filters.tenant} /> : null}
      </FilterBar>
      {!result.ok ? <UnavailableState locale={locale} code={result.code} />
        : result.data.length === 0 ? <EmptyState locale={locale} filtered={Object.keys(list.filters).length > 0} />
        : (
          <>
            <DataTable id="grants-table" locale={locale} caption={say(locale, c.title)}
              columns={[{ label: say(locale, c.tenant) }, { label: say(locale, c.status) }, { label: say(locale, c.ticket) },
                { label: say(locale, c.requestedBy) }, { label: say(locale, c.approvedBy) }, { label: say(locale, c.scope) },
                { label: say(locale, c.expires) }, { label: say(locale, c.actions) }]}
              rows={result.data.map((g) => ({
                key: g.grant_id,
                cells: [
                  <Link key="t" href={`/${locale}/tenants/${g.tenant_id}#support`}><bdi>{g.tenant_name}</bdi></Link>,
                  <StatusBadge key="s" locale={locale} status={g.status} />,
                  <><bdi>{g.ticket_reference}</bdi><span className="secondary">{g.reason}</span></>,
                  <bdi key="r">{g.requested_by_email ?? "—"}</bdi>,
                  g.approved_by_email ? <bdi key="a">{g.approved_by_email}</bdi> : <Unknown key="a" locale={locale} kind="none" />,
                  say(locale, c.readOnly),
                  <TimeValue key="e" locale={locale} value={g.expires_at} empty="none" />,
                  <div key="x" className="page-actions">
                    {g.status === "pending" && atLeast(operator.role, "admin") ? (
                      <ActionDialog locale={locale} action={approveSupportAction} trigger={say(locale, c.approve)} triggerVariant="quiet"
                        title={say(locale, c.approveTitle)} description={say(locale, c.approveBody)} submit={say(locale, c.approve)}
                        successMessage={say(locale, c.approved)} hidden={{ grantId: g.grant_id, tenantId: g.tenant_id }}>
                        <label className="field"><span>{say(locale, c.duration)}</span>
                          <input type="number" name="minutes" min={5} max={480} defaultValue={60} required /></label>
                      </ActionDialog>
                    ) : null}
                    {(g.status === "pending" || g.status === "active") && operatorRole ? (
                      <ActionDialog locale={locale} action={revokeSupportAction} trigger={say(locale, c.revoke)} triggerVariant="quiet" danger
                        title={say(locale, c.revokeTitle)} submit={say(locale, c.revoke)} successMessage={say(locale, c.revoked)}
                        reason={{ minLength: 5 }} hidden={{ grantId: g.grant_id, tenantId: g.tenant_id }} />
                    ) : null}
                  </div>,
                ],
              }))} />
            <Pagination locale={locale} page={list.page} pageSize={list.pageSize} total={Number(result.data[0]?.total_count ?? 0)}
              href={(page) => listHref(path, list, { page })} />
          </>
        )}
    </>
  );
}
```

- [ ] **Step 5: Verify and commit**

Run:
```bash
rtk pnpm --filter @wlbp/platform-admin test:unit
rtk pnpm --filter @wlbp/platform-admin typecheck
rtk pnpm exec eslint apps/platform-admin --max-warnings=0
```
Expected: pass.
```bash
rtk git add apps/platform-admin/app/_lib/actions/support.ts apps/platform-admin/app/_lib/health-support-copy.ts \
  "apps/platform-admin/app/[locale]/(console)/health" "apps/platform-admin/app/[locale]/(console)/support" \
  apps/platform-admin/app/_lib/copy.test.ts
rtk git commit -m "Show observed health and alerts, and manage scoped support access"
```
