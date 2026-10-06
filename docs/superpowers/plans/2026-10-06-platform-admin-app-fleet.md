# Platform Admin Completion — Part B2: Overview and Fleet

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Global Constraints: [`2026-10-06-platform-admin-completion.md`](2026-10-06-platform-admin-completion.md). Conventions: [`2026-10-06-platform-admin-application.md`](2026-10-06-platform-admin-application.md). Depends on Part B1 (Tasks 9–12).

**Goal:** The overview, tenant directory and lifecycle, and the infrastructure screens (instances, domains, provisioning, jobs).

---

### Task 13: Overview — real counts, explicit unknowns, alerts, recent activity

**Files:**
- Create: `apps/platform-admin/app/_lib/page-locale.ts`
- Create: `apps/platform-admin/app/_lib/audit-copy.ts`
- Create: `apps/platform-admin/app/_lib/ui/audit-list.tsx`
- Create: `apps/platform-admin/app/_lib/ui/metric.tsx`
- Create: `apps/platform-admin/app/[locale]/(console)/copy.ts`
- Create: `apps/platform-admin/app/[locale]/(console)/page.tsx`
- Modify: `apps/platform-admin/app/_lib/copy.test.ts` (register `audit-copy` and the overview copy)

**Interfaces:**
- Produces:
  ```ts
  // page-locale.ts
  export async function pageLocale(params: Promise<{ locale: string }>): Promise<Locale>; // notFound() otherwise
  // audit-copy.ts
  export const auditActionCopy: Record<string, Copy>;  // "tenant.created" → label
  export const outcomeCopy: Record<"succeeded" | "failed" | "denied", Copy>;
  export type AuditRow = { event_id: string; created_at: string; operator_id: string; operator_email: string | null; action: string; outcome: string; tenant_id: string | null; tenant_name: string | null; instance_id: string | null; target_kind: string | null; target_id: string | null; reason: string | null; detail: Record<string, unknown> };
  // ui/audit-list.tsx
  export function AuditList(props: { locale: Locale; rows: readonly AuditRow[] }): JSX.Element;
  export function DetailSummary(props: { detail: Record<string, unknown> }): JSX.Element;
  // ui/metric.tsx
  export function Metric(props: { href: string; title: string; value: string; details?: readonly (readonly [label: string, value: string, href?: string])[] }): JSX.Element;
  ```

- [ ] **Step 1: Shared page helpers**

`apps/platform-admin/app/_lib/page-locale.ts`:
```ts
import { isLocale, type Locale } from "@wlbp/i18n";
import { notFound } from "next/navigation";

export async function pageLocale(params: Promise<{ locale: string }>): Promise<Locale> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return locale;
}
```

`apps/platform-admin/app/_lib/audit-copy.ts`:
```ts
import type { Copy } from "./copy";

export type AuditRow = {
  event_id: string; created_at: string; operator_id: string; operator_email: string | null;
  action: string; outcome: string; tenant_id: string | null; tenant_name: string | null;
  instance_id: string | null; target_kind: string | null; target_id: string | null;
  reason: string | null; detail: Record<string, unknown>;
};

export const outcomeCopy = {
  succeeded: ["Succeeded", "نجح"],
  failed: ["Failed", "فشل"],
  denied: ["Denied", "مرفوض"],
} as const satisfies Record<string, Copy>;

/** Action families for filtering; prefixes of the action code. */
export const auditFamilies = {
  tenant: ["Tenants", "المستأجرون"], subscription: ["Subscriptions", "الاشتراكات"], plan: ["Plans", "الخطط"],
  entitlement: ["Entitlements", "الميزات"], job: ["Jobs", "المهام"], provisioning: ["Provisioning", "التهيئة"],
  domain: ["Domains", "النطاقات"], release: ["Releases", "الإصدارات"], rollout: ["Rollouts", "عمليات النشر"],
  support: ["Support access", "وصول الدعم"], operator: ["Operators", "المشغّلون"],
  platform_flag: ["Platform flags", "إعدادات المنصة"], integration: ["Integrations", "التكاملات"],
  audit: ["Audit exports", "تصدير السجل"],
} as const satisfies Record<string, Copy>;

export const auditActionCopy: Record<string, Copy> = {
  "tenant.created": ["Registered a tenant", "سجّل مستأجرًا"],
  "tenant.renamed": ["Renamed a tenant", "أعاد تسمية مستأجر"],
  "tenant.suspended": ["Suspended a tenant", "علّق مستأجرًا"],
  "tenant.reactivated": ["Reactivated a tenant", "أعاد تفعيل مستأجر"],
  "tenant.closure_requested": ["Requested tenant closure", "طلب إغلاق مستأجر"],
  "plan.assigned": ["Assigned a plan", "عيّن خطة"],
  "plan.created": ["Created a plan", "أنشأ خطة"],
  "plan.updated": ["Changed a plan", "عدّل خطة"],
  "subscription.plan_assigned": ["Changed a subscription's plan", "غيّر خطة اشتراك"],
  "subscription.updated": ["Changed a subscription", "عدّل اشتراكًا"],
  "entitlement.overridden": ["Overrode a feature", "تجاوز إعداد ميزة"],
  "entitlement.override_cleared": ["Cleared a feature override", "ألغى تجاوز ميزة"],
  "job.enqueued": ["Queued a job", "أضاف مهمة إلى قائمة الانتظار"],
  "job.approved": ["Approved a job", "وافق على مهمة"],
  "job.cancelled": ["Cancelled a job", "ألغى مهمة"],
  "job.retried": ["Retried a job", "أعاد محاولة مهمة"],
  "provisioning.retried": ["Retried provisioning", "أعاد محاولة التهيئة"],
  "provisioning.deactivated": ["Deactivated an instance", "عطّل نسخة"],
  "provisioning.activation_requested": ["Requested activation", "طلب التفعيل"],
  "domain.added": ["Added a domain", "أضاف نطاقًا"],
  "release.registered": ["Registered a release", "سجّل إصدارًا"],
  "release.status_changed": ["Changed a release's availability", "غيّر إتاحة إصدار"],
  "rollout.created": ["Created a rollout", "أنشأ عملية نشر"],
  "rollout.started": ["Started a rollout", "بدأ عملية نشر"],
  "rollout.resumed": ["Resumed a rollout", "استأنف عملية نشر"],
  "rollout.paused": ["Paused a rollout", "أوقف عملية نشر مؤقتًا"],
  "rollout.cancelled": ["Cancelled a rollout", "ألغى عملية نشر"],
  "rollout.retried": ["Retried rollout targets", "أعاد محاولة أهداف النشر"],
  "rollout.rolled_back": ["Rolled back a rollout", "تراجع عن عملية نشر"],
  "support.requested": ["Requested support access", "طلب وصول الدعم"],
  "support.approved": ["Approved support access", "وافق على وصول الدعم"],
  "support.revoked": ["Ended support access", "أنهى وصول الدعم"],
  "operator.added": ["Added an operator", "أضاف مشغّلًا"],
  "operator.role_changed": ["Changed an operator's role", "غيّر دور مشغّل"],
  "operator.disabled": ["Disabled an operator", "عطّل مشغّلًا"],
  "operator.enabled": ["Re-enabled an operator", "أعاد تفعيل مشغّل"],
  "integration.references_saved": ["Changed secret references", "عدّل مراجع الأسرار"],
  "platform_flag.saved": ["Changed a platform flag", "عدّل إعداد منصة"],
  "audit.exported": ["Exported the audit log", "صدّر سجل التدقيق"],
};
```

`apps/platform-admin/app/_lib/ui/audit-list.tsx`:
```tsx
import type { Locale } from "@wlbp/i18n";
import { Badge } from "@wlbp/ui-foundation";
import { auditActionCopy, outcomeCopy, type AuditRow } from "../audit-copy";
import { copyFor, say } from "../copy";
import { TimeValue } from "./time";

/** Allow-listed keys only reach here (the database summarises detail). */
export function DetailSummary({ detail }: { detail: Record<string, unknown> }) {
  const entries = Object.entries(detail ?? {});
  if (!entries.length) return null;
  return (
    <span className="secondary">
      {entries.map(([key, value]) => (
        <bdi key={key}>{key}: {typeof value === "string" ? value : JSON.stringify(value)} </bdi>
      ))}
    </span>
  );
}

export function AuditList({ locale, rows }: { locale: Locale; rows: readonly AuditRow[] }) {
  return (
    <ol className="timeline">
      {rows.map((row) => (
        <li key={row.event_id}>
          <TimeValue locale={locale} value={row.created_at} />
          <div>
            <strong>{copyFor(auditActionCopy, row.action, locale)}</strong>{" "}
            {row.outcome !== "succeeded" ? (
              <Badge tone="danger">{say(locale, outcomeCopy[row.outcome as keyof typeof outcomeCopy] ?? outcomeCopy.failed)}</Badge>
            ) : null}
            <span className="secondary">
              <bdi>{row.operator_email ?? row.operator_id}</bdi>
              {row.tenant_name ? <> · <bdi>{row.tenant_name}</bdi></> : null}
              {row.reason ? <> · {row.reason}</> : null}
            </span>
            <DetailSummary detail={row.detail} />
          </div>
        </li>
      ))}
    </ol>
  );
}
```

`apps/platform-admin/app/_lib/ui/metric.tsx`:
```tsx
import Link from "next/link";

export function Metric({ href, title, value, details }: {
  href: string; title: string; value: string;
  details?: readonly (readonly [label: string, value: string, href?: string])[];
}) {
  return (
    <section className="metric" aria-label={title}>
      <h2><Link href={href}>{title}</Link></h2>
      <strong>{value}</strong>
      {details?.length ? (
        <ul>
          {details.map(([label, detailValue, detailHref]) => (
            <li key={label}>{detailHref ? <Link href={detailHref}>{label}: {detailValue}</Link> : <>{label}: {detailValue}</>}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
```
(`.metric` is a container here, not a link; the heading link is the primary target and each detail links to its filtered list.)

- [ ] **Step 2: Overview copy**

`apps/platform-admin/app/[locale]/(console)/copy.ts`:
```ts
export const overviewCopy = {
  title: ["Overview", "نظرة عامة"],
  description: ["Live state of the fleet from the control-plane database.", "الحالة الحالية للأسطول من قاعدة بيانات لوحة التحكم."],
  tenants: ["Tenants", "المستأجرون"],
  instances: ["Instances", "النسخ"],
  subscriptions: ["Subscriptions", "الاشتراكات"],
  provisioning: ["Provisioning", "التهيئة"],
  jobs: ["Jobs", "المهام"],
  health: ["Instance health", "حالة النسخ"],
  pending: ["Needs attention", "يتطلب الانتباه"],
  inProgress: ["In progress", "قيد التنفيذ"],
  waiting: ["Waiting on others", "بانتظار أطراف أخرى"],
  notObservedCount: ["Not observed", "لم تُرصد"],
  staleCount: ["Stale observations", "رصد قديم"],
  healthyCount: ["Healthy (current)", "سليمة (حديث)"],
  healthNote: ["Only stored observations are counted. An instance nobody has observed is counted as not observed, never as healthy.",
    "تُحتسب الملاحظات المخزّنة فقط. النسخة التي لم يرصدها أحد تُحتسب كغير مرصودة، وليست سليمة."],
  approvals: ["Destructive jobs awaiting approval", "مهام حساسة بانتظار الموافقة"],
  supportRequests: ["Support requests pending", "طلبات دعم معلّقة"],
  supportActive: ["Active support access", "وصول دعم نشط"],
  rolloutsPaused: ["Paused rollouts", "عمليات نشر متوقفة"],
  rolloutsRunning: ["Running rollouts", "عمليات نشر جارية"],
  domainsPending: ["Domains awaiting verification", "نطاقات بانتظار التحقق"],
  breakGlass: ["Active break-glass access", "وصول طوارئ نشط"],
  alerts: ["Alerts", "التنبيهات"],
  alertsAll: ["Open health and alerts", "فتح الحالة والتنبيهات"],
  alertsEmpty: ["No alerts from stored evidence.", "لا توجد تنبيهات من البيانات المخزنة."],
  activity: ["Recent operator activity", "آخر نشاط للمشغّلين"],
  activityAll: ["Open the audit log", "فتح سجل التدقيق"],
  severityCritical: ["Critical", "حرج"],
  severityWarning: ["Warning", "تحذير"],
  generatedAt: ["Read at", "وقت القراءة"],
  alertKinds: {
    provisioning_failed: ["Provisioning failed", "فشلت التهيئة"],
    job_failed: ["Job failed", "فشلت مهمة"],
    health_failing: ["Instance failing a health check", "نسخة فشلت في فحص الحالة"],
    rollout_paused: ["Rollout paused", "عملية نشر متوقفة"],
    stale_observation: ["Observation is stale", "الرصد قديم"],
    drift: ["Infrastructure drift", "انحراف في البنية"],
    approval_pending: ["Approval needed", "مطلوب موافقة"],
    support_pending: ["Support request waiting", "طلب دعم بانتظار"],
    break_glass_active: ["Break-glass access is active", "وصول الطوارئ نشط"],
  },
} as const;
```

Register both in `copy.test.ts`:
```ts
import * as audit from "./audit-copy";
import * as overview from "../[locale]/(console)/copy";
// modules: { shared, auth, audit, overview }
```

- [ ] **Step 3: Overview page**

`apps/platform-admin/app/[locale]/(console)/page.tsx`:
```tsx
import { formatNumber, type Locale } from "@wlbp/i18n";
import { Badge } from "@wlbp/ui-foundation";
import Link from "next/link";
import type { AuditRow } from "../../_lib/audit-copy";
import { copyFor, say, statusCopy, type Copy } from "../../_lib/copy";
import { callOperator } from "../../_lib/operator-api";
import { getOperator } from "../../_lib/operator-page";
import { pageLocale } from "../../_lib/page-locale";
import { PageHeader } from "../../_lib/shell/page-header";
import { AuditList } from "../../_lib/ui/audit-list";
import { Metric } from "../../_lib/ui/metric";
import { EmptyState, UnavailableState } from "../../_lib/ui/states";
import { TimeValue } from "../../_lib/ui/time";
import { overviewCopy as c } from "./copy";

export const dynamic = "force-dynamic";

type Counts = Record<string, number>;
type Overview = {
  generated_at: string;
  tenant_total: number; tenants: Counts;
  instance_total: number; instances: Counts;
  subscriptions: Counts; jobs: Counts;
  provisioning: { in_progress: number; waiting: number; failed: number; active: number };
  health: { failing: number; degraded: number; healthy: number; stale: number; unobserved: number; stale_after_minutes: number };
  pending: { job_approvals: number; support_requests: number; support_active: number; rollouts_paused: number;
    rollouts_running: number; domains_pending: number; break_glass_active: number };
  recent_activity: AuditRow[];
};

function alertHref(locale: Locale, kind: string, subject: string | null): string {
  switch (kind) {
    case "provisioning_failed": return `/${locale}/provisioning/${subject}`;
    case "job_failed": case "approval_pending": return `/${locale}/jobs/${subject}`;
    case "health_failing": case "stale_observation": case "drift": return `/${locale}/instances/${subject}`;
    case "rollout_paused": return `/${locale}/rollouts/${subject}`;
    case "support_pending": return `/${locale}/support?status=pending`;
    default: return `/${locale}/operators`;
  }
}

export default async function OverviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await pageLocale(params);
  if (!(await getOperator(locale))) return null;
  const [overviewResult, alertsResult] = await Promise.all([
    callOperator("get_overview_v1"),
    callOperator("list_alerts_v1"),
  ]);
  const header = <PageHeader locale={locale} title={say(locale, c.title)} description={say(locale, c.description)} />;
  if (!overviewResult.ok) return <>{header}<UnavailableState locale={locale} code={overviewResult.code} /></>;

  const o = overviewResult.data as unknown as Overview;
  const n = (value: number | undefined) => formatNumber(value ?? 0, locale);
  const status = (key: string) => copyFor(statusCopy, key, locale);
  const p = (path: string) => `/${locale}/${path}`;
  const line = (label: Copy | string, value: number | undefined, href: string) =>
    [typeof label === "string" ? label : say(locale, label), n(value), href] as const;

  return (
    <>
      {header}
      <p className="secondary">{say(locale, c.generatedAt)}: <TimeValue locale={locale} value={o.generated_at} /></p>

      <div className="metric-grid">
        <Metric href={p("tenants")} title={say(locale, c.tenants)} value={n(o.tenant_total)} details={[
          line(status("active"), o.tenants.active, p("tenants?status=active")),
          line(status("suspended"), o.tenants.suspended, p("tenants?status=suspended")),
          line(status("closed"), o.tenants.closed, p("tenants?status=closed")),
        ]} />
        <Metric href={p("instances")} title={say(locale, c.instances)} value={n(o.instance_total)} details={[
          line(status("active"), o.instances.active, p("instances?state=active")),
          line(status("provisioning"), o.instances.provisioning, p("instances?state=provisioning")),
          line(status("suspended"), o.instances.suspended, p("instances?state=suspended")),
        ]} />
        <Metric href={p("subscriptions")} title={say(locale, c.subscriptions)} value={n(o.subscriptions.active)} details={[
          line(status("trialing"), o.subscriptions.trialing, p("subscriptions?state=trialing")),
          line(status("past_due"), o.subscriptions.past_due, p("subscriptions?state=past_due")),
          line(status("cancelled"), o.subscriptions.cancelled, p("subscriptions?state=cancelled")),
          line(status("none"), o.subscriptions.none, p("subscriptions?state=none")),
        ]} />
        <Metric href={p("provisioning")} title={say(locale, c.provisioning)} value={n(o.provisioning.in_progress)} details={[
          line(c.waiting, o.provisioning.waiting, p("provisioning?state=waiting")),
          line(status("failed"), o.provisioning.failed, p("provisioning?state=failed")),
          line(status("active"), o.provisioning.active, p("provisioning?state=active")),
        ]} />
        <Metric href={p("jobs")} title={say(locale, c.jobs)} value={n(o.jobs.queued)} details={[
          line(status("running"), o.jobs.running, p("jobs?status=running")),
          line(status("failed"), o.jobs.failed, p("jobs?status=failed")),
        ]} />
        <Metric href={p("health")} title={say(locale, c.health)} value={n(o.health.failing)} details={[
          line(status("degraded"), o.health.degraded, p("health?status=degraded")),
          line(c.staleCount, o.health.stale, p("health?status=stale")),
          line(c.notObservedCount, o.health.unobserved, p("health?status=unknown")),
          line(c.healthyCount, o.health.healthy, p("health?status=healthy")),
        ]} />
      </div>
      <p className="notice">{say(locale, c.healthNote)}</p>

      <section className="section" aria-labelledby="pending-title">
        <div className="section-header"><h2 id="pending-title">{say(locale, c.pending)}</h2></div>
        <div className="metric-grid">
          <Metric href={p("jobs?status=awaiting_approval")} title={say(locale, c.approvals)} value={n(o.pending.job_approvals)} />
          <Metric href={p("support?status=pending")} title={say(locale, c.supportRequests)} value={n(o.pending.support_requests)} />
          <Metric href={p("support?status=active")} title={say(locale, c.supportActive)} value={n(o.pending.support_active)} />
          <Metric href={p("rollouts?status=paused")} title={say(locale, c.rolloutsPaused)} value={n(o.pending.rollouts_paused)} />
          <Metric href={p("rollouts?status=running")} title={say(locale, c.rolloutsRunning)} value={n(o.pending.rollouts_running)} />
          <Metric href={p("domains?status=pending")} title={say(locale, c.domainsPending)} value={n(o.pending.domains_pending)} />
          <Metric href={p("operators")} title={say(locale, c.breakGlass)} value={n(o.pending.break_glass_active)} />
        </div>
      </section>

      <section className="section" aria-labelledby="alerts-title">
        <div className="section-header">
          <h2 id="alerts-title">{say(locale, c.alerts)}</h2>
          <Link href={p("health")}>{say(locale, c.alertsAll)}</Link>
        </div>
        {!alertsResult.ok ? <UnavailableState locale={locale} code={alertsResult.code} />
          : alertsResult.data.length === 0 ? <EmptyState locale={locale} title={say(locale, c.alertsEmpty)} />
          : (
            <ul className="timeline">
              {alertsResult.data.slice(0, 8).map((alert) => (
                <li key={`${alert.kind}:${alert.subject_id}:${alert.code ?? ""}`}>
                  <TimeValue locale={locale} value={alert.observed_at} empty="notReported" />
                  <div>
                    <Badge tone={alert.severity === "critical" ? "danger" : "warning"}>
                      {say(locale, alert.severity === "critical" ? c.severityCritical : c.severityWarning)}
                    </Badge>{" "}
                    <Link href={alertHref(locale, alert.kind, alert.subject_id)}>
                      {say(locale, c.alertKinds[alert.kind as keyof typeof c.alertKinds] ?? c.alerts)}
                    </Link>
                    <span className="secondary">
                      {alert.tenant_name ? <bdi>{alert.tenant_name}</bdi> : null}
                      {alert.code ? <> · <bdi>{alert.code}</bdi></> : null}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
      </section>

      <section className="section" aria-labelledby="activity-title">
        <div className="section-header">
          <h2 id="activity-title">{say(locale, c.activity)}</h2>
          <Link href={p("audit")}>{say(locale, c.activityAll)}</Link>
        </div>
        {o.recent_activity.length ? <AuditList locale={locale} rows={o.recent_activity} /> : <EmptyState locale={locale} />}
      </section>
    </>
  );
}
```

- [ ] **Step 4: Verify placeholders are gone**

Run:
```bash
rtk grep -rn "later M1\|healthReady\|systemReady\|fleet-grid\|admin-intro" apps/platform-admin/app
rtk pnpm --filter @wlbp/platform-admin test:unit
rtk pnpm --filter @wlbp/platform-admin typecheck
```
Expected: grep prints nothing; tests and typecheck pass.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/platform-admin/app/_lib/page-locale.ts apps/platform-admin/app/_lib/audit-copy.ts \
  apps/platform-admin/app/_lib/ui/audit-list.tsx apps/platform-admin/app/_lib/ui/metric.tsx \
  "apps/platform-admin/app/[locale]/(console)/copy.ts" "apps/platform-admin/app/[locale]/(console)/page.tsx" \
  apps/platform-admin/app/_lib/copy.test.ts
rtk git commit -m "Replace the Platform Admin hero with a data-backed overview"
```

### Task 14: Tenants — directory, registration, detail, lifecycle

**Files:**
- Create: `apps/platform-admin/app/_lib/actions/guard.ts`
- Create: `apps/platform-admin/app/_lib/actions/tenants.ts`
- Create: `apps/platform-admin/app/_lib/actions/subscriptions.ts`
- Create: `apps/platform-admin/app/_lib/actions/domains.ts`
- Create: `apps/platform-admin/app/_lib/actions/support.ts`
- Create: `apps/platform-admin/app/[locale]/(console)/tenants/copy.ts`
- Create: `apps/platform-admin/app/[locale]/(console)/tenants/page.tsx`
- Create: `apps/platform-admin/app/[locale]/(console)/tenants/new/page.tsx`
- Create: `apps/platform-admin/app/[locale]/(console)/tenants/[tenantId]/page.tsx`
- Create: `apps/platform-admin/app/[locale]/(console)/tenants/[tenantId]/sections.tsx`
- Modify: `apps/platform-admin/app/_lib/copy.test.ts` (register tenants copy)

All tenant-scoped mutations live in `app/_lib/actions/*` so the tenant detail page and the list pages in Tasks 15, 16 and 18 share one implementation.

**Interfaces:**
- Produces server actions (all `(previous: ActionResult, form: FormData) => Promise<ActionResult>`; every form posts a hidden `locale`):

| Action | File | Form fields | RPC |
| --- | --- | --- | --- |
| `createTenantAction` | tenants | `name`, `brandKey`, `idempotencyKey` | `create_tenant_v2` → success `href` = tenant detail |
| `renameTenantAction` | tenants | `tenantId`, `name`, `expectedUpdatedAt` | `update_tenant_v1` |
| `setTenantStatusAction` | tenants | `tenantId`, `status`, `expectedStatus`, `reason` | `set_tenant_status_v1` |
| `requestTenantClosureAction` | tenants | `tenantId`, `confirmation`, `reason`, `idempotencyKey` | `request_tenant_closure_v1` |
| `assignSubscriptionAction` | subscriptions | `tenantId`, `planKey`, `ring`, `reason` | `assign_subscription_v1` |
| `updateSubscriptionAction` | subscriptions | `tenantId`, `state`, `endsAt` (datetime-local UTC), `ring`, `reason`, `expectedUpdatedAt` | `update_subscription_v1` |
| `setEntitlementOverrideAction` | subscriptions | `tenantId`, `featureKey`, `granted` (`yes`/`no`), `expiresAt`, `reason` | `set_entitlement_override_v1` |
| `clearEntitlementOverrideAction` | subscriptions | `tenantId`, `featureKey`, `reason` | `clear_entitlement_override_v1` |
| `addDomainAction` | domains | `tenantId`, `instanceId`, `hostname`, `application`, `idempotencyKey` | `add_tenant_domain_v1` |
| `requestDomainVerificationAction` | domains | `domainId`, `tenantId` | `request_domain_verification_v1` |
| `requestSupportAction` | support | `tenantId`, `ticket`, `reason`, `minutes` | `request_support_grant_v1` |

- [ ] **Step 1: Action guard and tenant actions**

`apps/platform-admin/app/_lib/actions/guard.ts`:
```ts
import "server-only";

import type { ActionResult } from "../operator-action";

/** A missing or malformed identifier is a stale page, not a database question. */
export function missing(...values: (string | undefined)[]): ActionResult | null {
  return values.some((value) => value === undefined) ? { kind: "error", code: "not_found" } : null;
}
```

`apps/platform-admin/app/_lib/actions/tenants.ts`:
```ts
"use server";

import { localeOf, text, uuid } from "../form-data";
import { runOperatorAction, type ActionResult } from "../operator-action";
import { missing } from "./guard";

export async function createTenantAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const locale = localeOf(form);
  const { result, data } = await runOperatorAction({
    action: "tenant.create",
    fn: "create_tenant_v2",
    args: {
      p_name: text(form, "name"),
      p_brand_key: text(form, "brandKey").toLowerCase(),
      p_idempotency_key: text(form, "idempotencyKey"),
    },
    targetKind: "tenant",
  });
  const tenantId = data?.[0]?.tenant_id;
  if (result.kind !== "success" || !tenantId) return result;
  return { ...result, href: `/${locale}/tenants/${tenantId}?result=tenant.created` };
}

export async function renameTenantAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const tenantId = uuid(form, "tenantId");
  const invalid = missing(tenantId);
  if (invalid) return invalid;
  return (await runOperatorAction({
    action: "tenant.rename",
    fn: "update_tenant_v1",
    args: { p_tenant_id: tenantId!, p_name: text(form, "name"), p_expected_updated_at: text(form, "expectedUpdatedAt") },
    tenantId, targetKind: "tenant", targetId: tenantId,
  })).result;
}

export async function setTenantStatusAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const tenantId = uuid(form, "tenantId");
  const invalid = missing(tenantId);
  if (invalid) return invalid;
  const status = text(form, "status");
  return (await runOperatorAction({
    action: status === "suspended" ? "tenant.suspend" : "tenant.reactivate",
    fn: "set_tenant_status_v1",
    args: { p_tenant_id: tenantId!, p_status: status, p_reason: text(form, "reason"), p_expected_status: text(form, "expectedStatus") },
    tenantId, targetKind: "tenant", targetId: tenantId,
  })).result;
}

export async function requestTenantClosureAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const tenantId = uuid(form, "tenantId");
  const invalid = missing(tenantId);
  if (invalid) return invalid;
  return (await runOperatorAction({
    action: "tenant.request_closure",
    fn: "request_tenant_closure_v1",
    args: {
      p_tenant_id: tenantId!, p_reason: text(form, "reason"),
      p_confirmation: text(form, "confirmation"), p_idempotency_key: text(form, "idempotencyKey"),
    },
    tenantId, targetKind: "tenant", targetId: tenantId,
  })).result;
}
```

- [ ] **Step 2: Subscription, domain and support actions**

`apps/platform-admin/app/_lib/actions/subscriptions.ts`:
```ts
"use server";

import { instant, text, uuid } from "../form-data";
import { runOperatorAction, type ActionResult } from "../operator-action";
import { missing } from "./guard";

export async function assignSubscriptionAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const tenantId = uuid(form, "tenantId");
  const invalid = missing(tenantId);
  if (invalid) return invalid;
  return (await runOperatorAction({
    action: "subscription.assign",
    fn: "assign_subscription_v1",
    args: { p_tenant_id: tenantId!, p_plan_key: text(form, "planKey"), p_rollout_ring: text(form, "ring"), p_reason: text(form, "reason") },
    tenantId, targetKind: "subscription", targetId: tenantId,
  })).result;
}

export async function updateSubscriptionAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const tenantId = uuid(form, "tenantId");
  const invalid = missing(tenantId);
  if (invalid) return invalid;
  return (await runOperatorAction({
    action: "subscription.update",
    fn: "update_subscription_v1",
    args: {
      p_tenant_id: tenantId!, p_state: text(form, "state"), p_ends_at: instant(form, "endsAt"),
      p_rollout_ring: text(form, "ring"), p_reason: text(form, "reason"),
      p_expected_updated_at: text(form, "expectedUpdatedAt"),
    },
    tenantId, targetKind: "subscription", targetId: tenantId,
  })).result;
}

export async function setEntitlementOverrideAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const tenantId = uuid(form, "tenantId");
  const invalid = missing(tenantId);
  if (invalid) return invalid;
  const featureKey = text(form, "featureKey").toLowerCase();
  return (await runOperatorAction({
    action: "entitlement.override",
    fn: "set_entitlement_override_v1",
    args: {
      p_tenant_id: tenantId!, p_feature_key: featureKey, p_granted: text(form, "granted") === "yes",
      p_expires_at: instant(form, "expiresAt"), p_reason: text(form, "reason"),
    },
    tenantId, targetKind: "entitlement", targetId: /^[a-z][a-z0-9_.]{1,60}$/u.test(featureKey) ? featureKey : undefined,
  })).result;
}

export async function clearEntitlementOverrideAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const tenantId = uuid(form, "tenantId");
  const invalid = missing(tenantId);
  if (invalid) return invalid;
  const featureKey = text(form, "featureKey");
  return (await runOperatorAction({
    action: "entitlement.clear_override",
    fn: "clear_entitlement_override_v1",
    args: { p_tenant_id: tenantId!, p_feature_key: featureKey, p_reason: text(form, "reason") },
    tenantId, targetKind: "entitlement", targetId: featureKey,
  })).result;
}
```

`apps/platform-admin/app/_lib/actions/domains.ts`:
```ts
"use server";

import { text, uuid } from "../form-data";
import { runOperatorAction, type ActionResult } from "../operator-action";
import { missing } from "./guard";

export async function addDomainAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const tenantId = uuid(form, "tenantId");
  const instanceId = uuid(form, "instanceId");
  const invalid = missing(tenantId, instanceId);
  if (invalid) return invalid;
  return (await runOperatorAction({
    action: "domain.add",
    fn: "add_tenant_domain_v1",
    args: {
      p_tenant_id: tenantId!, p_instance_id: instanceId!, p_hostname: text(form, "hostname").toLowerCase(),
      p_application: text(form, "application"), p_idempotency_key: text(form, "idempotencyKey"),
    },
    tenantId, targetKind: "domain",
  })).result;
}

export async function requestDomainVerificationAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const domainId = uuid(form, "domainId");
  const invalid = missing(domainId);
  if (invalid) return invalid;
  return (await runOperatorAction({
    action: "domain.request_verification",
    fn: "request_domain_verification_v1",
    args: { p_domain_id: domainId! },
    tenantId: uuid(form, "tenantId"), targetKind: "domain", targetId: domainId,
  })).result;
}
```

`apps/platform-admin/app/_lib/actions/support.ts` (Task 18 adds approve and revoke):
```ts
"use server";

import { integer, text, uuid } from "../form-data";
import { runOperatorAction, type ActionResult } from "../operator-action";
import { missing } from "./guard";

export async function requestSupportAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const tenantId = uuid(form, "tenantId");
  const invalid = missing(tenantId);
  if (invalid) return invalid;
  return (await runOperatorAction({
    action: "support.request",
    fn: "request_support_grant_v1",
    args: {
      p_tenant_id: tenantId!, p_reason: text(form, "reason"), p_ticket_reference: text(form, "ticket"),
      p_minutes: integer(form, "minutes"),
    },
    tenantId, targetKind: "support_grant",
  })).result;
}
```

- [ ] **Step 3: Tenants copy**

`apps/platform-admin/app/[locale]/(console)/tenants/copy.ts`:
```ts
export const tenantsCopy = {
  title: ["Tenants", "المستأجرون"],
  description: ["Every business on the platform, its plan and its instances.", "كل منشأة على المنصة وخطتها ونسخها."],
  register: ["Register tenant", "تسجيل مستأجر"],
  search: ["Search by name, brand key or ID", "ابحث بالاسم أو مفتاح العلامة أو المعرّف"],
  status: ["Status", "الحالة"],
  plan: ["Plan", "الخطة"],
  noPlan: ["No plan", "بلا خطة"],
  caption: ["Tenants", "المستأجرون"],
  name: ["Name", "الاسم"],
  instances: ["Instances (active / total)", "النسخ (النشطة / الكل)"],
  provisioning: ["Provisioning", "التهيئة"],
  created: ["Created", "تاريخ الإنشاء"],
  emptyTitle: ["No tenants yet", "لا يوجد مستأجرون بعد"],
  emptyBody: ["Register the first tenant to start provisioning.", "سجّل أول مستأجر لبدء التهيئة."],
  newTitle: ["Register a tenant", "تسجيل مستأجر"],
  newDescription: ["Creates the tenant, its brand and a first instance in the provisioning state. Nothing is deployed until provisioning is requested.",
    "يُنشئ المستأجر وعلامته ونسخة أولى بحالة التهيئة. لا يُنشر شيء حتى تُطلب التهيئة."],
  tenantName: ["Business name", "اسم المنشأة"],
  brandKey: ["Brand key", "مفتاح العلامة"],
  brandKeyHint: ["Lowercase letters, digits and single hyphens, e.g. north-clinic. Cannot be changed later.",
    "أحرف صغيرة وأرقام وشرطات مفردة، مثل north-clinic. لا يمكن تغييره لاحقًا."],
  created_ok: ["Tenant registered.", "تم تسجيل المستأجر."],
  sections: {
    identity: ["Identity", "الهوية"],
    lifecycle: ["Lifecycle", "دورة الحياة"],
    subscription: ["Plan and subscription", "الخطة والاشتراك"],
    entitlements: ["Features", "الميزات"],
    domains: ["Domains", "النطاقات"],
    instances: ["Instances", "النسخ"],
    provisioning: ["Provisioning", "التهيئة"],
    jobs: ["Jobs", "المهام"],
    support: ["Support access", "وصول الدعم"],
    audit: ["Audit history", "سجل التدقيق"],
  },
  id: ["Tenant ID", "معرّف المستأجر"],
  brands: ["Brand keys", "مفاتيح العلامات"],
  updated: ["Last changed", "آخر تعديل"],
  rename: ["Rename", "إعادة التسمية"],
  renameTitle: ["Rename tenant", "إعادة تسمية المستأجر"],
  renamed: ["Tenant renamed.", "تمت إعادة التسمية."],
  suspend: ["Suspend", "تعليق"],
  suspendTitle: ["Suspend this tenant?", "تعليق هذا المستأجر؟"],
  suspendBody: ["Their public site and booking stop resolving on the next request. Staff keep their accounts. You can reactivate later.",
    "يتوقف موقعهم العام والحجز عن العمل مع الطلب التالي. يحتفظ الموظفون بحساباتهم. يمكنك إعادة التفعيل لاحقًا."],
  suspended: ["Tenant suspended.", "تم تعليق المستأجر."],
  reactivate: ["Reactivate", "إعادة التفعيل"],
  reactivateTitle: ["Reactivate this tenant?", "إعادة تفعيل هذا المستأجر؟"],
  reactivateBody: ["Their public site resolves again on the next request.", "يعود موقعهم العام للعمل مع الطلب التالي."],
  reactivated: ["Tenant reactivated.", "تمت إعادة تفعيل المستأجر."],
  closure: ["Request closure", "طلب الإغلاق"],
  closureTitle: ["Request permanent closure?", "طلب الإغلاق النهائي؟"],
  closureBody: ["Queues a close job for each instance. A second administrator must approve each job, and nothing is deleted by this request.",
    "يضيف مهمة إغلاق لكل نسخة. يجب أن يوافق مسؤول ثانٍ على كل مهمة، ولا يُحذف شيء بهذا الطلب."],
  closureRequested: ["Closure requested. It waits for a second administrator's approval in Jobs.", "تم طلب الإغلاق. ينتظر موافقة مسؤول ثانٍ في المهام."],
  closureNeedsSuspend: ["Suspend the tenant before requesting closure.", "علّق المستأجر قبل طلب الإغلاق."],
  noSubscription: ["No subscription. Assign a plan to grant features.", "لا يوجد اشتراك. عيّن خطة لمنح الميزات."],
  ring: ["Rollout ring", "حلقة النشر"],
  started: ["Started", "البداية"],
  ends: ["Ends", "النهاية"],
  billingNote: ["Administrative record. No payment provider is connected for platform subscriptions, so nothing here reflects a charge or payment.",
    "سجل إداري. لا يوجد مزوّد دفع متصل باشتراكات المنصة، لذا لا يعكس شيء هنا عملية دفع."],
  feature: ["Feature", "الميزة"],
  granted: ["Granted", "ممنوحة"],
  source: ["Source", "المصدر"],
  expires: ["Expires", "تنتهي"],
  sources: { plan: ["Plan", "الخطة"], override: ["Override", "تجاوز يدوي"], trial: ["Trial", "تجريبي"] },
  noEntitlements: ["No features granted.", "لا توجد ميزات ممنوحة."],
  hostname: ["Hostname", "اسم النطاق"],
  application: ["Application", "التطبيق"],
  applications: { client: ["Public site", "الموقع العام"], dashboard: ["Business dashboard", "لوحة المنشأة"] },
  verification: ["Verification", "التحقق"],
  active: ["Serving", "قيد الخدمة"],
  instance: ["Instance", "النسخة"],
  release: ["Release (desired → running)", "الإصدار (المطلوب ← العامل)"],
  brandPublished: ["Brand published", "العلامة منشورة"],
  run: ["Run", "التشغيل"],
  state: ["State", "الحالة"],
  requestProvisioning: ["Request provisioning", "طلب التهيئة"],
  job: ["Job", "المهمة"],
  ticket: ["Ticket", "التذكرة"],
  allAudit: ["Open the full audit history", "فتح سجل التدقيق كاملًا"],
} as const;
```

Register in `copy.test.ts`: `import * as tenants from "../[locale]/(console)/tenants/copy";`.

- [ ] **Step 4: Shared dialog copy for tenant-scoped actions**

`apps/platform-admin/app/_lib/action-copy.ts` (used by the tenant detail page and by Tasks 15, 16, 18):
```ts
export const actionCopy = {
  assignPlan: {
    trigger: ["Change plan", "تغيير الخطة"],
    title: ["Change this tenant's plan", "تغيير خطة هذا المستأجر"],
    body: ["Features from the new plan are granted and features it lacks are removed. Manual overrides stay as they are.",
      "تُمنح ميزات الخطة الجديدة وتُزال الميزات غير المشمولة. تبقى التجاوزات اليدوية كما هي."],
    submit: ["Change plan", "تغيير الخطة"],
    done: ["Plan changed and features updated.", "تم تغيير الخطة وتحديث الميزات."],
  },
  updateSubscription: {
    trigger: ["Change status", "تغيير الحالة"],
    title: ["Change subscription status", "تغيير حالة الاشتراك"],
    body: ["Cancelling sets an end date on plan features; they stop working at that time.",
      "الإلغاء يضع تاريخ انتهاء لميزات الخطة؛ فتتوقف عند ذلك الوقت."],
    submit: ["Save status", "حفظ الحالة"],
    done: ["Subscription updated.", "تم تحديث الاشتراك."],
  },
  override: {
    trigger: ["Override a feature", "تجاوز ميزة"],
    title: ["Override a feature for this tenant", "تجاوز ميزة لهذا المستأجر"],
    body: ["An override wins over the plan until it expires or is cleared.", "يتغلّب التجاوز على الخطة حتى ينتهي أو يُلغى."],
    submit: ["Save override", "حفظ التجاوز"],
    done: ["Override saved.", "تم حفظ التجاوز."],
  },
  clearOverride: {
    trigger: ["Clear override", "إلغاء التجاوز"],
    title: ["Return this feature to the plan?", "إرجاع هذه الميزة إلى الخطة؟"],
    submit: ["Clear override", "إلغاء التجاوز"],
    done: ["Override cleared.", "تم إلغاء التجاوز."],
  },
  addDomain: {
    trigger: ["Add domain", "إضافة نطاق"],
    title: ["Add a domain", "إضافة نطاق"],
    body: ["The domain is added as pending and a verification job is queued. It serves traffic only after a worker verifies DNS.",
      "يُضاف النطاق كمعلّق وتُضاف مهمة تحقق. لا يخدم الزيارات إلا بعد أن يتحقق العامل من DNS."],
    submit: ["Add and queue verification", "إضافة وجدولة التحقق"],
    done: ["Domain added. Verification is queued.", "تمت إضافة النطاق. التحقق في قائمة الانتظار."],
  },
  verifyDomain: {
    submit: ["Queue verification", "جدولة التحقق"],
    done: ["Verification queued. Nothing is verified until the worker reports.", "تمت جدولة التحقق. لا يُعدّ موثّقًا حتى يُبلّغ العامل."],
  },
  requestSupport: {
    trigger: ["Request support access", "طلب وصول الدعم"],
    title: ["Request read-only support access", "طلب وصول دعم للقراءة فقط"],
    body: ["A second administrator must approve. Access is read-only, time-limited, shown to the tenant, and recorded.",
      "يجب أن يوافق مسؤول ثانٍ. الوصول للقراءة فقط ومحدود المدة ومعروض للمستأجر ومسجّل."],
    submit: ["Send request", "إرسال الطلب"],
    done: ["Request sent. It waits for approval.", "أُرسل الطلب. ينتظر الموافقة."],
  },
  fields: {
    plan: ["Plan", "الخطة"],
    ring: ["Rollout ring", "حلقة النشر"],
    state: ["Status", "الحالة"],
    endsAt: ["End date and time (UTC)", "تاريخ ووقت الانتهاء (بالتوقيت العالمي)"],
    feature: ["Feature key", "مفتاح الميزة"],
    grant: ["Override", "التجاوز"],
    grantYes: ["Grant the feature", "منح الميزة"],
    grantNo: ["Withhold the feature", "حجب الميزة"],
    expiresAt: ["Expires (UTC, optional)", "تنتهي (بالتوقيت العالمي، اختياري)"],
    hostname: ["Hostname", "اسم النطاق"],
    application: ["Application", "التطبيق"],
    instance: ["Instance", "النسخة"],
    ticket: ["Ticket reference", "مرجع التذكرة"],
    minutes: ["Requested duration (minutes)", "المدة المطلوبة (بالدقائق)"],
    minutesHint: ["Between 5 and 480. The approver sets the final duration.", "بين ٥ و٤٨٠. يحدد الموافِق المدة النهائية."],
  },
} as const;
```
Register in `copy.test.ts`: `import * as actions from "./action-copy";`.

- [ ] **Step 5: Tenant directory**

`apps/platform-admin/app/[locale]/(console)/tenants/page.tsx`:
```tsx
import { formatNumber } from "@wlbp/i18n";
import Link from "next/link";
import { copyFor, formCopy, say, statusCopy } from "../../../_lib/copy";
import { listHref, parseListParams } from "../../../_lib/list-params";
import { callOperator } from "../../../_lib/operator-api";
import { atLeast, getOperator } from "../../../_lib/operator-page";
import { pageLocale } from "../../../_lib/page-locale";
import { PageHeader } from "../../../_lib/shell/page-header";
import { DataTable } from "../../../_lib/ui/data-table";
import { FilterBar, SelectFilter } from "../../../_lib/ui/filter-bar";
import { Pagination } from "../../../_lib/ui/pagination";
import { EmptyState, Unknown, UnavailableState } from "../../../_lib/ui/states";
import { StatusBadge } from "../../../_lib/ui/status-badge";
import { TimeValue } from "../../../_lib/ui/time";
import { tenantsCopy as c } from "./copy";

export const dynamic = "force-dynamic";

const spec = {
  sorts: ["name", "-name", "created", "-created", "status"],
  defaultSort: "-created",
  filters: { status: ["active", "suspended", "closed"], plan: "text" },
  pageSize: 25,
} as const;

export default async function TenantsPage({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await pageLocale(params);
  const operator = await getOperator(locale);
  if (!operator) return null;
  const list = parseListParams(await searchParams, spec);
  const path = `/${locale}/tenants`;
  const [result, plans] = await Promise.all([
    callOperator("list_tenants_v1", {
      p_search: list.q || undefined, p_status: list.filters.status, p_plan_key: list.filters.plan,
      p_sort: list.sort, p_limit: list.pageSize, p_offset: list.offset,
    }),
    callOperator("list_plans_v1"),
  ]);
  const filtered = Boolean(list.q || Object.keys(list.filters).length);

  return (
    <>
      <PageHeader locale={locale} title={say(locale, c.title)} description={say(locale, c.description)}
        actions={atLeast(operator.role, "admin")
          ? <Link className="wlbp-button wlbp-button--primary" href={`${path}/new`}>{say(locale, c.register)}</Link>
          : null} />
      <FilterBar locale={locale} path={path} search={{ label: say(locale, c.search), value: list.q }}>
        <SelectFilter name="status" label={say(locale, c.status)} value={list.filters.status} allLabel={say(locale, formCopy.all)}
          options={spec.filters.status.map((s) => [s, copyFor(statusCopy, s, locale)] as const)} />
        <SelectFilter name="plan" label={say(locale, c.plan)} value={list.filters.plan} allLabel={say(locale, formCopy.all)}
          options={[["none", say(locale, c.noPlan)] as const,
            ...(plans.ok ? plans.data.map((p) => [p.key, p.name] as const) : [])]} />
      </FilterBar>
      {!result.ok ? <UnavailableState locale={locale} code={result.code} />
        : result.data.length === 0 ? (
          <EmptyState locale={locale} filtered={filtered}
            title={filtered ? undefined : say(locale, c.emptyTitle)} body={filtered ? undefined : say(locale, c.emptyBody)} />
        ) : (
          <>
            <DataTable id="tenants-table" locale={locale} caption={say(locale, c.caption)}
              sort={list.sort} sortHref={(sort) => listHref(path, list, { sort })}
              columns={[
                { label: say(locale, c.name), sort: "name" },
                { label: say(locale, c.status), sort: "status" },
                { label: say(locale, c.plan) },
                { label: say(locale, c.instances), numeric: true },
                { label: say(locale, c.provisioning) },
                { label: say(locale, c.created), sort: "created" },
              ]}
              rows={result.data.map((row) => ({
                key: row.tenant_id,
                cells: [
                  <><Link href={`${path}/${row.tenant_id}`}><bdi>{row.name}</bdi></Link><span className="secondary"><bdi>{row.brand_keys}</bdi></span></>,
                  <StatusBadge locale={locale} status={row.status} />,
                  row.plan_key ? <><bdi>{row.plan_key}</bdi> <StatusBadge locale={locale} status={row.subscription_state} /></> : <Unknown locale={locale} kind="none" />,
                  `${formatNumber(row.active_instances, locale)} / ${formatNumber(row.instance_count, locale)}`,
                  row.provisioning_state ? <StatusBadge locale={locale} status={row.provisioning_state} /> : <Unknown locale={locale} kind="none" />,
                  <TimeValue locale={locale} value={row.created_at} />,
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

- [ ] **Step 6: Tenant registration**

`apps/platform-admin/app/[locale]/(console)/tenants/new/page.tsx`:
```tsx
import { TextField } from "@wlbp/ui-foundation";
import { randomUUID } from "node:crypto";
import { say, stateCopy } from "../../../../_lib/copy";
import { createTenantAction } from "../../../../_lib/actions/tenants";
import { atLeast, getOperator } from "../../../../_lib/operator-page";
import { pageLocale } from "../../../../_lib/page-locale";
import { PageHeader } from "../../../../_lib/shell/page-header";
import { OperatorForm } from "../../../../_lib/ui/operator-form";
import { tenantsCopy as c } from "../copy";

export const dynamic = "force-dynamic";

export default async function NewTenantPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await pageLocale(params);
  const operator = await getOperator(locale);
  if (!operator) return null;
  return (
    <>
      <PageHeader locale={locale} title={say(locale, c.newTitle)} description={say(locale, c.newDescription)}
        breadcrumbs={[[say(locale, c.title), `/${locale}/tenants`], [say(locale, c.newTitle)]]} />
      <section className="section">
        {atLeast(operator.role, "admin") ? (
          <OperatorForm locale={locale} action={createTenantAction} submit={say(locale, c.register)}
            successMessage={say(locale, c.created_ok)}>
            {/* A fresh key per render: a double submit replays, a new visit creates. */}
            <input type="hidden" name="idempotencyKey" value={randomUUID()} />
            <TextField id="name" name="name" label={say(locale, c.tenantName)} required maxLength={160} />
            <TextField id="brandKey" name="brandKey" label={say(locale, c.brandKey)} description={say(locale, c.brandKeyHint)}
              required maxLength={63} autoComplete="off" />
          </OperatorForm>
        ) : <p className="notice">{say(locale, stateCopy.roleRequired)}</p>}
      </section>
    </>
  );
}
```
`TextField` has no `pattern` prop; the database validates the brand key and the error copy explains the format.

- [ ] **Step 7: Tenant detail sections**

`apps/platform-admin/app/[locale]/(console)/tenants/[tenantId]/sections.tsx`:
```tsx
import type { Locale } from "@wlbp/i18n";
import { TextField } from "@wlbp/ui-foundation";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import type { ReactNode } from "react";
import { actionCopy as a } from "../../../../_lib/action-copy";
import { requestDomainVerificationAction, addDomainAction } from "../../../../_lib/actions/domains";
import { requestSupportAction } from "../../../../_lib/actions/support";
import {
  assignSubscriptionAction, clearEntitlementOverrideAction, setEntitlementOverrideAction, updateSubscriptionAction,
} from "../../../../_lib/actions/subscriptions";
import { renameTenantAction, requestTenantClosureAction, setTenantStatusAction } from "../../../../_lib/actions/tenants";
import type { AuditRow } from "../../../../_lib/audit-copy";
import { copyFor, say, stateCopy, statusCopy } from "../../../../_lib/copy";
import { atLeast, type OperatorContext } from "../../../../_lib/operator-page";
import { ActionDialog } from "../../../../_lib/ui/action-dialog";
import { AuditList } from "../../../../_lib/ui/audit-list";
import { DataTable } from "../../../../_lib/ui/data-table";
import { Facts } from "../../../../_lib/ui/facts";
import { OperatorForm } from "../../../../_lib/ui/operator-form";
import { SelectField } from "../../../../_lib/ui/select-field";
import { EmptyState } from "../../../../_lib/ui/states";
import { StatusBadge } from "../../../../_lib/ui/status-badge";
import { TimeValue } from "../../../../_lib/ui/time";
import { tenantsCopy as c } from "../copy";

export type TenantDetail = {
  tenant: { id: string; name: string; status: string; created_at: string; updated_at: string };
  brands: { id: string; key: string; status: string }[];
  subscription: { plan_key: string; state: string; rollout_ring: string; started_at: string; ends_at: string | null; updated_at: string } | null;
  plan: { key: string; name: string; entitlements: string[]; active: boolean } | null;
  entitlements: { feature_key: string; granted: boolean; source: string; expires_at: string | null; updated_at: string }[];
  domains: { id: string; instance_id: string; hostname: string; application: string; kind: string; verification_status: string; verified_at: string | null; active: boolean }[];
  instances: { id: string; deployment_state: string; brand_published: boolean; desired_release: string | null; current_release: string | null; reported_at: string | null; created_at: string }[];
  provisioning_runs: { id: string; instance_id: string; slug: string; state: string; waiting_reason: string | null; last_error_code: string | null; updated_at: string }[];
  jobs: { id: string; kind: string; status: string; attempts: number; last_error_code: string | null; needs_approval: boolean; created_at: string }[];
  support_grants: { id: string; status: string; ticket_reference: string; scope: string; expires_at: string | null; requested_at: string }[];
  audit: AuditRow[];
};

type Props = { locale: Locale; detail: TenantDetail; operator: OperatorContext };

const rings = ["canary", "early", "general"] as const;

function Section({ id, title, actions, children }: { id: string; title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="section" id={id} aria-labelledby={`${id}-title`}>
      <div className="section-header"><h2 id={`${id}-title`}>{title}</h2>{actions ? <div className="page-actions">{actions}</div> : null}</div>
      {children}
    </section>
  );
}

export function IdentitySection({ locale, detail, operator }: Props) {
  const { tenant } = detail;
  return (
    <Section id="identity" title={say(locale, c.sections.identity)} actions={atLeast(operator.role, "operator") ? (
      <ActionDialog locale={locale} action={renameTenantAction} trigger={say(locale, c.rename)} title={say(locale, c.renameTitle)}
        submit={say(locale, c.rename)} successMessage={say(locale, c.renamed)}
        hidden={{ tenantId: tenant.id, expectedUpdatedAt: tenant.updated_at }}>
        <TextField id="rename-name" name="name" label={say(locale, c.tenantName)} defaultValue={tenant.name} required maxLength={160} />
      </ActionDialog>
    ) : null}>
      <Facts items={[
        [say(locale, c.name), <bdi key="n">{tenant.name}</bdi>],
        [say(locale, c.id), <bdi key="i">{tenant.id}</bdi>],
        [say(locale, c.brands), <bdi key="b">{detail.brands.map((b) => b.key).join(", ")}</bdi>],
        [say(locale, c.created), <TimeValue key="c" locale={locale} value={tenant.created_at} />],
        [say(locale, c.updated), <TimeValue key="u" locale={locale} value={tenant.updated_at} />],
      ]} />
    </Section>
  );
}

export function LifecycleSection({ locale, detail, operator }: Props) {
  const { tenant } = detail;
  const admin = atLeast(operator.role, "admin");
  return (
    <Section id="lifecycle" title={say(locale, c.sections.lifecycle)} actions={admin ? (
      <>
        {tenant.status === "active" ? (
          <ActionDialog locale={locale} action={setTenantStatusAction} trigger={say(locale, c.suspend)} danger
            title={say(locale, c.suspendTitle)} description={say(locale, c.suspendBody)} submit={say(locale, c.suspend)}
            successMessage={say(locale, c.suspended)} reason={{ minLength: 10 }}
            hidden={{ tenantId: tenant.id, status: "suspended", expectedStatus: tenant.status }} />
        ) : null}
        {tenant.status === "suspended" ? (
          <>
            <ActionDialog locale={locale} action={setTenantStatusAction} trigger={say(locale, c.reactivate)}
              title={say(locale, c.reactivateTitle)} description={say(locale, c.reactivateBody)} submit={say(locale, c.reactivate)}
              successMessage={say(locale, c.reactivated)} reason={{ minLength: 10 }}
              hidden={{ tenantId: tenant.id, status: "active", expectedStatus: tenant.status }} />
            <ActionDialog locale={locale} action={requestTenantClosureAction} trigger={say(locale, c.closure)} danger
              title={say(locale, c.closureTitle)} description={say(locale, c.closureBody)} submit={say(locale, c.closure)}
              successMessage={say(locale, c.closureRequested)} reason={{ minLength: 10 }} confirmText={tenant.name}
              hidden={{ tenantId: tenant.id, idempotencyKey: randomUUID() }} />
          </>
        ) : null}
      </>
    ) : null}>
      <Facts items={[[say(locale, c.status), <StatusBadge key="s" locale={locale} status={tenant.status} />]]} />
      {admin && tenant.status === "active" ? <p className="secondary">{say(locale, c.closureNeedsSuspend)}</p> : null}
      {!admin ? <p className="secondary">{say(locale, stateCopy.roleRequired)}</p> : null}
    </Section>
  );
}

export function SubscriptionSection({ locale, detail, operator, plans }: Props & { plans: { key: string; name: string; active: boolean }[] }) {
  const sub = detail.subscription;
  const admin = atLeast(operator.role, "admin");
  const ringOptions = rings.map((r) => [r, copyFor(statusCopy, r, locale)] as const);
  return (
    <Section id="subscription" title={say(locale, c.sections.subscription)} actions={admin ? (
      <>
        <ActionDialog locale={locale} action={assignSubscriptionAction} trigger={say(locale, a.assignPlan.trigger)}
          title={say(locale, a.assignPlan.title)} description={say(locale, a.assignPlan.body)} submit={say(locale, a.assignPlan.submit)}
          successMessage={say(locale, a.assignPlan.done)} reason={{ minLength: 5 }} hidden={{ tenantId: detail.tenant.id }}>
          <SelectField name="planKey" label={say(locale, a.fields.plan)} value={sub?.plan_key}
            options={plans.filter((p) => p.active).map((p) => [p.key, p.name] as const)} />
          <SelectField name="ring" label={say(locale, a.fields.ring)} value={sub?.rollout_ring ?? "general"} options={ringOptions} />
        </ActionDialog>
        {sub ? (
          <ActionDialog locale={locale} action={updateSubscriptionAction} trigger={say(locale, a.updateSubscription.trigger)}
            title={say(locale, a.updateSubscription.title)} description={say(locale, a.updateSubscription.body)}
            submit={say(locale, a.updateSubscription.submit)} successMessage={say(locale, a.updateSubscription.done)}
            reason={{ minLength: 5 }} hidden={{ tenantId: detail.tenant.id, expectedUpdatedAt: sub.updated_at }}>
            <SelectField name="state" label={say(locale, a.fields.state)} value={sub.state}
              options={["trialing", "active", "past_due", "cancelled"].map((s) => [s, copyFor(statusCopy, s, locale)] as const)} />
            <label className="field"><span>{say(locale, a.fields.endsAt)}</span>
              <input type="datetime-local" name="endsAt" defaultValue={sub.ends_at?.slice(0, 16)} /></label>
            <SelectField name="ring" label={say(locale, a.fields.ring)} value={sub.rollout_ring} options={ringOptions} />
          </ActionDialog>
        ) : null}
      </>
    ) : null}>
      <p className="notice">{say(locale, c.billingNote)}</p>
      {sub ? (
        <Facts items={[
          [say(locale, c.plan), <bdi key="p">{detail.plan?.name ?? sub.plan_key}</bdi>],
          [say(locale, c.status), <StatusBadge key="s" locale={locale} status={sub.state} />],
          [say(locale, c.ring), copyFor(statusCopy, sub.rollout_ring, locale)],
          [say(locale, c.started), <TimeValue key="st" locale={locale} value={sub.started_at} />],
          [say(locale, c.ends), <TimeValue key="e" locale={locale} value={sub.ends_at} empty="none" />],
        ]} />
      ) : <p>{say(locale, c.noSubscription)}</p>}
    </Section>
  );
}

export function EntitlementsSection({ locale, detail, operator }: Props) {
  const admin = atLeast(operator.role, "admin");
  return (
    <Section id="entitlements" title={say(locale, c.sections.entitlements)} actions={admin ? (
      <ActionDialog locale={locale} action={setEntitlementOverrideAction} trigger={say(locale, a.override.trigger)}
        title={say(locale, a.override.title)} description={say(locale, a.override.body)} submit={say(locale, a.override.submit)}
        successMessage={say(locale, a.override.done)} reason={{ minLength: 5 }} hidden={{ tenantId: detail.tenant.id }}>
        <TextField id="override-feature" name="featureKey" label={say(locale, a.fields.feature)} required maxLength={61} autoComplete="off" />
        <SelectField name="granted" label={say(locale, a.fields.grant)} value="yes"
          options={[["yes", say(locale, a.fields.grantYes)], ["no", say(locale, a.fields.grantNo)]]} />
        <label className="field"><span>{say(locale, a.fields.expiresAt)}</span><input type="datetime-local" name="expiresAt" /></label>
      </ActionDialog>
    ) : null}>
      {detail.entitlements.length === 0 ? <EmptyState locale={locale} title={say(locale, c.noEntitlements)} /> : (
        <DataTable id="entitlements-table" locale={locale} caption={say(locale, c.sections.entitlements)}
          columns={[{ label: say(locale, c.feature) }, { label: say(locale, c.granted) }, { label: say(locale, c.source) },
            { label: say(locale, c.expires) }, { label: "" }]}
          rows={detail.entitlements.map((e) => ({
            key: e.feature_key,
            cells: [
              <bdi key="f">{e.feature_key}</bdi>,
              say(locale, e.granted ? stateCopy.yes : stateCopy.no),
              say(locale, c.sources[e.source as keyof typeof c.sources] ?? c.sources.plan),
              <TimeValue key="x" locale={locale} value={e.expires_at} empty="none" />,
              admin && e.source === "override" ? (
                <ActionDialog key="clear" locale={locale} action={clearEntitlementOverrideAction} triggerVariant="quiet"
                  trigger={say(locale, a.clearOverride.trigger)} title={say(locale, a.clearOverride.title)}
                  submit={say(locale, a.clearOverride.submit)} successMessage={say(locale, a.clearOverride.done)}
                  reason={{ minLength: 5 }} hidden={{ tenantId: detail.tenant.id, featureKey: e.feature_key }} />
              ) : null,
            ],
          }))} />
      )}
    </Section>
  );
}

export function DomainsSection({ locale, detail, operator }: Props) {
  const operatorRole = atLeast(operator.role, "operator");
  return (
    <Section id="domains" title={say(locale, c.sections.domains)} actions={operatorRole && detail.instances.length ? (
      <ActionDialog locale={locale} action={addDomainAction} trigger={say(locale, a.addDomain.trigger)}
        title={say(locale, a.addDomain.title)} description={say(locale, a.addDomain.body)} submit={say(locale, a.addDomain.submit)}
        successMessage={say(locale, a.addDomain.done)} hidden={{ tenantId: detail.tenant.id, idempotencyKey: randomUUID() }}>
        <SelectField name="instanceId" label={say(locale, a.fields.instance)}
          options={detail.instances.map((i) => [i.id, `${i.id.slice(0, 8)} · ${copyFor(statusCopy, i.deployment_state, locale)}`] as const)} />
        <TextField id="domain-hostname" name="hostname" label={say(locale, a.fields.hostname)} required maxLength={253} autoComplete="off" />
        <SelectField name="application" label={say(locale, a.fields.application)}
          options={[["client", say(locale, c.applications.client)], ["dashboard", say(locale, c.applications.dashboard)]]} />
      </ActionDialog>
    ) : null}>
      {detail.domains.length === 0 ? <EmptyState locale={locale} /> : (
        <DataTable id="domains-table" locale={locale} caption={say(locale, c.sections.domains)}
          columns={[{ label: say(locale, c.hostname) }, { label: say(locale, c.application) },
            { label: say(locale, c.verification) }, { label: say(locale, c.active) }, { label: "" }]}
          rows={detail.domains.map((d) => ({
            key: d.id,
            cells: [
              <bdi key="h">{d.hostname}</bdi>,
              say(locale, c.applications[d.application as keyof typeof c.applications] ?? c.applications.client),
              <><StatusBadge locale={locale} status={d.verification_status} /> <TimeValue locale={locale} value={d.verified_at} empty="none" /></>,
              say(locale, d.active ? stateCopy.yes : stateCopy.no),
              operatorRole && d.verification_status !== "verified" ? (
                <OperatorForm key="v" locale={locale} action={requestDomainVerificationAction} submit={say(locale, a.verifyDomain.submit)}
                  successMessage={say(locale, a.verifyDomain.done)} className="inline-form">
                  <input type="hidden" name="domainId" value={d.id} />
                  <input type="hidden" name="tenantId" value={detail.tenant.id} />
                </OperatorForm>
              ) : null,
            ],
          }))} />
      )}
    </Section>
  );
}

export function InstancesSection({ locale, detail }: Omit<Props, "operator">) {
  return (
    <Section id="instances" title={say(locale, c.sections.instances)}>
      <DataTable id="instances-table" locale={locale} caption={say(locale, c.sections.instances)}
        columns={[{ label: say(locale, c.instance) }, { label: say(locale, c.state) }, { label: say(locale, c.release) },
          { label: say(locale, c.brandPublished) }]}
        rows={detail.instances.map((i) => ({
          key: i.id,
          cells: [
            <Link key="l" href={`/${locale}/instances/${i.id}`}><bdi>{i.id}</bdi></Link>,
            <StatusBadge key="s" locale={locale} status={i.deployment_state} />,
            <bdi key="r">{i.desired_release ?? "—"} → {i.current_release ?? say(locale, stateCopy.notReported)}</bdi>,
            say(locale, i.brand_published ? stateCopy.yes : stateCopy.no),
          ],
        }))} />
    </Section>
  );
}

export function ProvisioningSection({ locale, detail, operator }: Props) {
  return (
    <Section id="provisioning" title={say(locale, c.sections.provisioning)} actions={atLeast(operator.role, "operator") ? (
      <Link className="wlbp-button wlbp-button--secondary" href={`/${locale}/provisioning/new?tenant=${detail.tenant.id}`}>
        {say(locale, c.requestProvisioning)}
      </Link>
    ) : null}>
      {detail.provisioning_runs.length === 0 ? <EmptyState locale={locale} /> : (
        <DataTable id="runs-table" locale={locale} caption={say(locale, c.sections.provisioning)}
          columns={[{ label: say(locale, c.run) }, { label: say(locale, c.state) }, { label: say(locale, c.updated) }]}
          rows={detail.provisioning_runs.map((r) => ({
            key: r.id,
            cells: [
              <Link key="l" href={`/${locale}/provisioning/${r.id}`}><bdi>{r.slug}</bdi></Link>,
              <><StatusBadge locale={locale} status={r.waiting_reason ? "waiting" : r.state} />
                {r.last_error_code ? <span className="secondary"><bdi>{r.last_error_code}</bdi></span> : null}</>,
              <TimeValue key="t" locale={locale} value={r.updated_at} />,
            ],
          }))} />
      )}
    </Section>
  );
}

export function JobsSection({ locale, detail }: Omit<Props, "operator">) {
  return (
    <Section id="jobs" title={say(locale, c.sections.jobs)}>
      {detail.jobs.length === 0 ? <EmptyState locale={locale} /> : (
        <DataTable id="jobs-table" locale={locale} caption={say(locale, c.sections.jobs)}
          columns={[{ label: say(locale, c.job) }, { label: say(locale, c.state) }, { label: say(locale, c.created) }]}
          rows={detail.jobs.map((j) => ({
            key: j.id,
            cells: [
              <Link key="l" href={`/${locale}/jobs/${j.id}`}><bdi>{j.kind}</bdi></Link>,
              <StatusBadge key="s" locale={locale} status={j.needs_approval ? "awaiting_approval" : j.status} />,
              <TimeValue key="t" locale={locale} value={j.created_at} />,
            ],
          }))} />
      )}
    </Section>
  );
}

export function SupportSection({ locale, detail, operator }: Props) {
  return (
    <Section id="support" title={say(locale, c.sections.support)} actions={atLeast(operator.role, "operator") ? (
      <ActionDialog locale={locale} action={requestSupportAction} trigger={say(locale, a.requestSupport.trigger)}
        title={say(locale, a.requestSupport.title)} description={say(locale, a.requestSupport.body)}
        submit={say(locale, a.requestSupport.submit)} successMessage={say(locale, a.requestSupport.done)}
        reason={{ minLength: 10 }} hidden={{ tenantId: detail.tenant.id }}>
        <TextField id="support-ticket" name="ticket" label={say(locale, a.fields.ticket)} required maxLength={120} />
        <label className="field"><span>{say(locale, a.fields.minutes)}</span>
          <input type="number" name="minutes" min={5} max={480} defaultValue={60} required />
          <small>{say(locale, a.fields.minutesHint)}</small></label>
      </ActionDialog>
    ) : null}>
      {detail.support_grants.length === 0 ? <EmptyState locale={locale} /> : (
        <DataTable id="grants-table" locale={locale} caption={say(locale, c.sections.support)}
          columns={[{ label: say(locale, c.ticket) }, { label: say(locale, c.state) }, { label: say(locale, c.expires) }]}
          rows={detail.support_grants.map((g) => ({
            key: g.id,
            cells: [
              <Link key="l" href={`/${locale}/support?tenant=${detail.tenant.id}`}><bdi>{g.ticket_reference}</bdi></Link>,
              <StatusBadge key="s" locale={locale} status={g.status} />,
              <TimeValue key="t" locale={locale} value={g.expires_at} empty="none" />,
            ],
          }))} />
      )}
    </Section>
  );
}

export function AuditSection({ locale, detail }: Omit<Props, "operator">) {
  return (
    <Section id="audit" title={say(locale, c.sections.audit)}
      actions={<Link href={`/${locale}/audit?tenant=${detail.tenant.id}`}>{say(locale, c.allAudit)}</Link>}>
      {detail.audit.length ? <AuditList locale={locale} rows={detail.audit} /> : <EmptyState locale={locale} />}
    </Section>
  );
}
```

- [ ] **Step 8: Tenant detail page**

`apps/platform-admin/app/[locale]/(console)/tenants/[tenantId]/page.tsx`:
```tsx
import { StatusMessage } from "@wlbp/ui-foundation";
import Link from "next/link";
import { notFound } from "next/navigation";
import { say } from "../../../../_lib/copy";
import { callOperator } from "../../../../_lib/operator-api";
import { getOperator } from "../../../../_lib/operator-page";
import { pageLocale } from "../../../../_lib/page-locale";
import { PageHeader } from "../../../../_lib/shell/page-header";
import { UnavailableState } from "../../../../_lib/ui/states";
import { StatusBadge } from "../../../../_lib/ui/status-badge";
import { tenantsCopy as c } from "../copy";
import {
  AuditSection, DomainsSection, EntitlementsSection, IdentitySection, InstancesSection, JobsSection,
  LifecycleSection, ProvisioningSection, SubscriptionSection, SupportSection, type TenantDetail,
} from "./sections";

export const dynamic = "force-dynamic";

export default async function TenantPage({ params, searchParams }: {
  params: Promise<{ locale: string; tenantId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await pageLocale(params);
  const { tenantId } = await params;
  const operator = await getOperator(locale);
  if (!operator) return null;
  if (!/^[0-9a-f-]{36}$/u.test(tenantId)) notFound();
  const [result, plans] = await Promise.all([
    callOperator("get_tenant_v1", { p_tenant_id: tenantId }),
    callOperator("list_plans_v1"),
  ]);
  if (!result.ok && result.code === "not_found") notFound();
  const crumbs = [[say(locale, c.title), `/${locale}/tenants`]] as const;
  if (!result.ok) {
    return <><PageHeader locale={locale} title={say(locale, c.title)} breadcrumbs={crumbs} /><UnavailableState locale={locale} code={result.code} /></>;
  }
  const detail = result.data as unknown as TenantDetail;
  const created = (await searchParams).result === "tenant.created";
  const props = { locale, detail, operator };
  const sectionIds = Object.keys(c.sections) as (keyof typeof c.sections)[];

  return (
    <>
      <PageHeader locale={locale} title={detail.tenant.name} breadcrumbs={[...crumbs, [detail.tenant.name]]}
        actions={<StatusBadge locale={locale} status={detail.tenant.status} />} />
      {created ? <StatusMessage tone="positive">{say(locale, c.created_ok)}</StatusMessage> : null}
      <nav className="section-nav" aria-label={detail.tenant.name}>
        {sectionIds.map((id) => <Link key={id} href={`#${id}`}>{say(locale, c.sections[id])}</Link>)}
      </nav>
      <IdentitySection {...props} />
      <LifecycleSection {...props} />
      <SubscriptionSection {...props} plans={plans.ok ? plans.data : []} />
      <EntitlementsSection {...props} />
      <DomainsSection {...props} />
      <InstancesSection locale={locale} detail={detail} />
      <ProvisioningSection {...props} />
      <JobsSection locale={locale} detail={detail} />
      <SupportSection {...props} />
      <AuditSection locale={locale} detail={detail} />
    </>
  );
}
```
The section `id`s in `sections.tsx` (`identity`, `lifecycle`, `subscription`, `entitlements`, `domains`, `instances`, `provisioning`, `jobs`, `support`, `audit`) match the keys of `tenantsCopy.sections`, so the in-page links resolve.

- [ ] **Step 9: Verify and commit**

Run:
```bash
rtk pnpm --filter @wlbp/platform-admin test:unit
rtk pnpm --filter @wlbp/platform-admin typecheck
rtk pnpm exec eslint apps/platform-admin --max-warnings=0
```
Expected: pass. Then:
```bash
rtk git add apps/platform-admin/app/_lib/actions apps/platform-admin/app/_lib/action-copy.ts \
  "apps/platform-admin/app/[locale]/(console)/tenants" apps/platform-admin/app/_lib/copy.test.ts
rtk git commit -m "Let operators find, register and manage tenants"
```

### Task 15: Instances, domains, provisioning, jobs

**Files:**
- Create: `apps/platform-admin/app/_lib/actions/operations.ts`
- Create: `apps/platform-admin/app/_lib/operations-copy.ts`
- Create: `apps/platform-admin/app/[locale]/(console)/instances/page.tsx`, `instances/[instanceId]/page.tsx`
- Create: `apps/platform-admin/app/[locale]/(console)/domains/page.tsx`
- Create: `apps/platform-admin/app/[locale]/(console)/provisioning/page.tsx`, `provisioning/new/page.tsx`, `provisioning/[runId]/page.tsx`
- Create: `apps/platform-admin/app/[locale]/(console)/jobs/page.tsx`, `jobs/[jobId]/page.tsx`
- Modify: `apps/platform-admin/app/_lib/copy.test.ts` (register `operations-copy`)

These four areas share one copy module (`operations-copy.ts`) because they share most of their vocabulary: steps, workers, jobs, drift.

**Interfaces:**
- Consumes: `addDomainAction`, `requestDomainVerificationAction` (Task 14).
- Produces server actions in `actions/operations.ts`:

| Action | Form fields | RPC |
| --- | --- | --- |
| `requestProvisioningAction` | `target` (`tenantId|instanceId`), `slug`, `planKey`, `releaseId`, `defaultLocale`, `timezone`, `currency`, `clientHostname`, `dashboardHostname`, `idempotencyKey` | `list_releases_v1` (resolve) → `request_provisioning_v1`; rejected reasons returned as `{ kind: "error", code: "settings_invalid", reasons }`; success `href` = run detail |
| `retryRunAction` | `runId`, `tenantId` | `retry_provisioning_run_v1` |
| `activateRunAction` | `runId`, `tenantId` | `activate_provisioned_instance_v1`; blocked reasons returned as error `reasons` with code `transition_not_allowed` |
| `deactivateRunAction` | `runId`, `tenantId`, `reason` | `deactivate_provisioned_instance_v1` |
| `cancelJobAction` / `retryJobAction` | `jobId`, `tenantId`, `reason` | `cancel_job_v1` / `retry_job_v1` |
| `approveJobAction` | `jobId`, `tenantId` | `approve_operator_job_v1` |

- [ ] **Step 1: Operations actions**

`apps/platform-admin/app/_lib/actions/operations.ts`:
```ts
"use server";

import { callOperator } from "../operator-api";
import { asUuid, localeOf, optional, text, uuid } from "../form-data";
import { runOperatorAction, type ActionResult } from "../operator-action";
import { missing } from "./guard";

export async function requestProvisioningAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const locale = localeOf(form);
  const [tenantRaw, instanceRaw] = text(form, "target").split("|");
  const tenantId = asUuid(tenantRaw);
  const instanceId = asUuid(instanceRaw);
  const releaseId = uuid(form, "releaseId");
  const invalid = missing(tenantId, instanceId, releaseId);
  if (invalid) return invalid;

  // The release supplies the version and contract range; the form never does.
  const releases = await callOperator("list_releases_v1", { p_status: "available", p_limit: 100 });
  if (!releases.ok) return { kind: "error", code: releases.code };
  const release = releases.data.find((row) => row.release_id === releaseId);
  if (!release) return { kind: "error", code: "release_invalid" };

  const domains = [
    ["client", optional(form, "clientHostname")],
    ["dashboard", optional(form, "dashboardHostname")],
  ].flatMap(([application, hostname]) => (hostname ? [{ application, hostname: hostname.toLowerCase() }] : []));

  const { result, data } = await runOperatorAction({
    action: "provisioning.request",
    fn: "request_provisioning_v1",
    args: {
      p_tenant_id: tenantId!, p_instance_id: instanceId!, p_slug: text(form, "slug").toLowerCase(),
      p_plan_key: text(form, "planKey"), p_desired_release: release.version,
      p_config_schema_version: release.config_schema_version,
      p_backend_contract_min: release.backend_contract_min, p_backend_contract_max: release.backend_contract_max,
      p_request: { default_locale: text(form, "defaultLocale"), timezone: text(form, "timezone"),
        currency: text(form, "currency").toUpperCase(), domains },
      p_idempotency_key: text(form, "idempotencyKey"),
    },
    tenantId, targetKind: "provisioning_run",
  });
  if (result.kind !== "success") return result;
  const row = data?.[0];
  if (row?.rejected?.length) return { kind: "error", code: "settings_invalid", reasons: row.rejected };
  return { ...result, href: `/${locale}/provisioning/${row?.run_id}` };
}

export async function retryRunAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const runId = uuid(form, "runId");
  const invalid = missing(runId);
  if (invalid) return invalid;
  return (await runOperatorAction({
    action: "provisioning.retry", fn: "retry_provisioning_run_v1", args: { p_run_id: runId! },
    tenantId: uuid(form, "tenantId"), targetKind: "provisioning_run", targetId: runId,
  })).result;
}

export async function activateRunAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const runId = uuid(form, "runId");
  const invalid = missing(runId);
  if (invalid) return invalid;
  const { result, data } = await runOperatorAction({
    action: "provisioning.activate", fn: "activate_provisioned_instance_v1", args: { p_run_id: runId! },
    tenantId: uuid(form, "tenantId"), targetKind: "provisioning_run", targetId: runId,
  });
  const row = data?.[0];
  if (result.kind === "success" && row && !row.activated) {
    return { kind: "error", code: "transition_not_allowed", reasons: row.blocked };
  }
  return result;
}

export async function deactivateRunAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const runId = uuid(form, "runId");
  const invalid = missing(runId);
  if (invalid) return invalid;
  return (await runOperatorAction({
    action: "provisioning.deactivate", fn: "deactivate_provisioned_instance_v1",
    args: { p_run_id: runId!, p_reason: text(form, "reason") },
    tenantId: uuid(form, "tenantId"), targetKind: "provisioning_run", targetId: runId,
  })).result;
}

export async function cancelJobAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const jobId = uuid(form, "jobId");
  const invalid = missing(jobId);
  if (invalid) return invalid;
  return (await runOperatorAction({
    action: "job.cancel", fn: "cancel_job_v1", args: { p_job_id: jobId!, p_reason: text(form, "reason") },
    tenantId: uuid(form, "tenantId"), targetKind: "job", targetId: jobId,
  })).result;
}

export async function retryJobAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const jobId = uuid(form, "jobId");
  const invalid = missing(jobId);
  if (invalid) return invalid;
  return (await runOperatorAction({
    action: "job.retry", fn: "retry_job_v1", args: { p_job_id: jobId!, p_reason: text(form, "reason") },
    tenantId: uuid(form, "tenantId"), targetKind: "job", targetId: jobId,
  })).result;
}

export async function approveJobAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const jobId = uuid(form, "jobId");
  const invalid = missing(jobId);
  if (invalid) return invalid;
  return (await runOperatorAction({
    action: "job.approve", fn: "approve_operator_job_v1", args: { p_job_id: jobId! },
    tenantId: uuid(form, "tenantId"), targetKind: "job", targetId: jobId,
  })).result;
}
```

- [ ] **Step 2: Operations copy**

`apps/platform-admin/app/_lib/operations-copy.ts`:
```ts
export const operationsCopy = {
  instances: {
    title: ["Instances", "النسخ"],
    description: ["What each instance should run, what it last reported, and whether its infrastructure has drifted.",
      "ما يجب أن تشغّله كل نسخة، وما أبلغت عنه آخر مرة، وما إذا انحرفت بنيتها."],
    search: ["Search by tenant or instance ID", "ابحث بالمستأجر أو معرّف النسخة"],
    state: ["State", "الحالة"], ring: ["Ring", "الحلقة"], drift: ["Drift", "الانحراف"],
    driftOnly: ["Drifted only", "المنحرفة فقط"], noDrift: ["No drift", "بلا انحراف"],
    tenant: ["Tenant", "المستأجر"], instance: ["Instance", "النسخة"],
    release: ["Desired → reported release", "الإصدار المطلوب ← المُبلّغ"],
    infrastructure: ["Infrastructure (failing / drifted / total)", "البنية (متعطلة / منحرفة / الكل)"],
    health: ["Health", "الحالة التشغيلية"],
    releaseState: ["Release", "الإصدار"], configSchema: ["Configuration schema", "مخطط الإعدادات"],
    tier: ["Customization tier", "مستوى التخصيص"], contract: ["Supported backend contract", "عقد الخادم المدعوم"],
    environment: ["Environment verified", "تم التحقق من البيئة"], reportedAt: ["Last reported", "آخر إبلاغ"],
    resources: ["Infrastructure resources", "موارد البنية"],
    provider: ["Provider", "المزوّد"], resource: ["Resource", "المورد"], externalId: ["External ID", "المعرّف الخارجي"],
    desired: ["Desired", "المطلوب"], observed: ["Observed", "المرصود"], observedAt: ["Observed at", "وقت الرصد"],
    attempts: ["Attempts", "المحاولات"], lastSuccess: ["Last success", "آخر نجاح"], lastError: ["Last error", "آخر خطأ"],
    drifted: ["Drifted", "منحرف"], inSync: ["Matches", "مطابق"],
    noResources: ["No provider has reported a resource for this instance.", "لم يُبلّغ أي مزوّد عن مورد لهذه النسخة."],
    signals: ["Health signals", "مؤشرات الحالة"], signal: ["Signal", "المؤشر"],
    domains: ["Domains", "النطاقات"], runs: ["Provisioning runs", "عمليات التهيئة"],
  },
  domains: {
    title: ["Domains", "النطاقات"],
    description: ["Every hostname, its verification state and what the provider last reported about its certificate.",
      "كل اسم نطاق، وحالة التحقق، وآخر ما أبلغ به المزوّد عن شهادته."],
    search: ["Search by hostname or tenant", "ابحث باسم النطاق أو المستأجر"],
    hostname: ["Hostname", "اسم النطاق"], tenant: ["Tenant", "المستأجر"], application: ["Application", "التطبيق"],
    verification: ["Verification", "التحقق"], certificate: ["Certificate", "الشهادة"], serving: ["Serving", "قيد الخدمة"],
    pendingJob: ["Verification job", "مهمة التحقق"],
    certificateNote: ["Certificate status comes only from the domain worker. \"Not reported\" means no worker has checked it.",
      "تأتي حالة الشهادة من عامل النطاقات فقط. «لم يُبلّغ عنه» تعني أن أي عامل لم يفحصها."],
  },
  provisioning: {
    title: ["Provisioning", "التهيئة"],
    description: ["Each run is a resumable sequence of steps. Waiting is not failing.", "كل عملية سلسلة خطوات قابلة للاستئناف. الانتظار ليس فشلًا."],
    request: ["Request provisioning", "طلب التهيئة"],
    search: ["Search by slug or tenant", "ابحث بالمعرّف أو المستأجر"],
    state: ["State", "الحالة"], inProgress: ["In progress", "قيد التنفيذ"], waiting: ["Waiting on others", "بانتظار أطراف أخرى"],
    tenant: ["Tenant", "المستأجر"], slug: ["Slug", "المعرّف"], steps: ["Steps done", "الخطوات المنجزة"],
    release: ["Release", "الإصدار"], updated: ["Updated", "آخر تحديث"],
    newTitle: ["Request provisioning", "طلب التهيئة"],
    newDescription: ["Validates everything first and returns every problem at once. Steps that call GitHub or Vercel run only when those workers are deployed with credentials.",
      "يتحقق من كل شيء أولًا ويعيد كل المشكلات دفعة واحدة. الخطوات التي تستدعي GitHub أو Vercel لا تعمل إلا عند نشر تلك العمّال مع بيانات اعتمادها."],
    target: ["Instance to provision", "النسخة المطلوب تهيئتها"],
    noTargets: ["No instance is waiting to be provisioned. Register a tenant first.", "لا توجد نسخة بانتظار التهيئة. سجّل مستأجرًا أولًا."],
    noReleases: ["No release is registered. Register one under Releases first.", "لا يوجد إصدار مسجّل. سجّل إصدارًا من صفحة الإصدارات أولًا."],
    slugHint: ["Names the repository and projects. 3–40 lowercase letters, digits or hyphens.", "يُستخدم لتسمية المستودع والمشاريع. ٣–٤٠ حرفًا صغيرًا أو أرقامًا أو شرطات."],
    plan: ["Plan", "الخطة"], releaseField: ["Release", "الإصدار"],
    defaultLocale: ["Default language", "اللغة الافتراضية"], timezone: ["Time zone", "المنطقة الزمنية"],
    timezoneHint: ["IANA name, e.g. Asia/Riyadh.", "اسم IANA، مثل Asia/Riyadh."],
    currency: ["Currency", "العملة"], clientHostname: ["Public site domain (optional)", "نطاق الموقع العام (اختياري)"],
    dashboardHostname: ["Business dashboard domain (optional)", "نطاق لوحة المنشأة (اختياري)"],
    submitted: ["Provisioning requested.", "تم طلب التهيئة."],
    run: ["Run", "التشغيل"], waitingReason: ["Waiting for", "بانتظار"], lastError: ["Last error", "آخر خطأ"],
    requestedBy: ["Requested by", "طلبه"], contract: ["Backend contract", "عقد الخادم"],
    activatedAt: ["Activated", "تاريخ التفعيل"], deactivatedAt: ["Deactivated", "تاريخ التعطيل"],
    step: ["Step", "الخطوة"], provider: ["Provider", "المزوّد"], status: ["Status", "الحالة"],
    attempts: ["Attempts", "المحاولات"], started: ["Started", "البداية"], lastSuccess: ["Succeeded at", "وقت النجاح"],
    retryAfter: ["Next attempt", "المحاولة التالية"], timeline: ["Timeline", "الخط الزمني"],
    retry: ["Retry failed steps", "إعادة محاولة الخطوات الفاشلة"],
    retryTitle: ["Retry this run?", "إعادة محاولة هذه العملية؟"],
    retryBody: ["Only failed or abandoned steps restart. Steps that succeeded keep their results.", "تُعاد الخطوات الفاشلة أو المتروكة فقط. تحتفظ الخطوات الناجحة بنتائجها."],
    retried: ["Failed steps were reset and will be picked up by their workers.", "أُعيد ضبط الخطوات الفاشلة وسيستلمها العمّال."],
    activate: ["Activate instance", "تفعيل النسخة"],
    activateTitle: ["Activate this instance?", "تفعيل هذه النسخة؟"],
    activateBody: ["Activation checks every requirement now and lists anything that blocks it.", "يتحقق التفعيل من كل المتطلبات الآن ويعرض ما يمنعه."],
    activated: ["Instance activated.", "تم تفعيل النسخة."],
    deactivate: ["Deactivate", "تعطيل"],
    deactivateTitle: ["Deactivate this instance?", "تعطيل هذه النسخة؟"],
    deactivateBody: ["Marks its resources as no longer wanted and suspends the instance. Nothing is deleted.", "يعلّم مواردها كغير مطلوبة ويعلّق النسخة. لا يُحذف شيء."],
    deactivated: ["Instance deactivated.", "تم تعطيل النسخة."],
    externalWorker: ["Runs when the {worker} worker is deployed with its credentials. Until then this step stays pending.",
      "تعمل عند نشر عامل {worker} مع بيانات اعتماده. حتى ذلك الحين تبقى الخطوة معلّقة."],
  },
  jobs: {
    title: ["Jobs", "المهام"],
    description: ["Privileged work is queued here first. A queued job has not run.", "يُضاف كل عمل حساس هنا أولًا. المهمة في قائمة الانتظار لم تُنفّذ بعد."],
    status: ["Status", "الحالة"], kind: ["Kind", "النوع"], tenant: ["Tenant", "المستأجر"],
    attempts: ["Attempts", "المحاولات"], error: ["Last error", "آخر خطأ"], requestedBy: ["Requested by", "طلبها"],
    approvedBy: ["Approved by", "وافق عليها"], created: ["Created", "تاريخ الإنشاء"], completed: ["Completed", "اكتملت"],
    started: ["Started", "بدأت"], reason: ["Reason", "السبب"], parameters: ["Parameters", "المعاملات"],
    events: ["Events", "الأحداث"], lockedUntil: ["Claimed until", "مستلمة حتى"],
    cancel: ["Cancel job", "إلغاء المهمة"], cancelTitle: ["Cancel this job?", "إلغاء هذه المهمة؟"],
    cancelBody: ["A cancelled job will not run. A running job cannot be cancelled.", "لن تُنفّذ المهمة الملغاة. لا يمكن إلغاء مهمة قيد التنفيذ."],
    cancelled: ["Job cancelled.", "تم إلغاء المهمة."],
    retry: ["Retry job", "إعادة محاولة المهمة"], retryTitle: ["Queue this job again?", "إعادة جدولة هذه المهمة؟"],
    retried: ["Job queued again.", "أُعيدت جدولة المهمة."],
    approve: ["Approve", "موافقة"], approveTitle: ["Approve this destructive job?", "الموافقة على هذه المهمة الحساسة؟"],
    approveBody: ["You are the second administrator. Once approved, a worker may carry it out.", "أنت المسؤول الثاني. بعد الموافقة يمكن لعامل تنفيذها."],
    approved: ["Job approved.", "تمت الموافقة على المهمة."],
    workerNote: ["Runs when the {worker} worker claims it. This page shows only what has actually happened.",
      "تُنفّذ عندما يستلمها عامل {worker}. تعرض هذه الصفحة ما حدث فعلًا فقط."],
  },
  kinds: {
    provision_instance: ["Provision instance", "تهيئة نسخة"], seed_repository: ["Seed repository", "تهيئة المستودع"],
    provision_domains: ["Provision domains", "تهيئة النطاقات"], publish_release: ["Publish release", "نشر إصدار"],
    rotate_secret: ["Rotate secret", "تدوير سر"], suspend_instance: ["Suspend instance", "تعليق نسخة"],
    close_instance: ["Close instance", "إغلاق نسخة"], reconcile_drift: ["Reconcile drift", "معالجة الانحراف"],
    verify_domain: ["Verify domain", "التحقق من نطاق"], check_integration: ["Check integration", "فحص تكامل"],
  },
  workers: {
    provisioning: ["provisioning", "التهيئة"], github: ["GitHub", "GitHub"], vercel: ["Vercel", "Vercel"],
    resend: ["Resend", "Resend"], domain: ["domain", "النطاقات"], release: ["release", "الإصدارات"],
    integration: ["integration check", "فحص التكاملات"], infrastructure: ["infrastructure", "البنية"],
    reconciliation: ["reconciliation", "المعالجة"],
  },
  stepNames: {
    validate_request: ["Validate request", "التحقق من الطلب"], create_tenant_records: ["Create records", "إنشاء السجلات"],
    seed_repository: ["Create repository", "إنشاء المستودع"], commit_configuration: ["Commit configuration", "حفظ الإعدادات"],
    protect_repository: ["Protect repository", "حماية المستودع"], create_projects: ["Create projects", "إنشاء المشاريع"],
    configure_mail: ["Configure email", "تهيئة البريد"], configure_environment: ["Configure environment", "تهيئة البيئة"],
    deploy_applications: ["Deploy applications", "نشر التطبيقات"], verify_domains: ["Verify domains", "التحقق من النطاقات"],
    health_check: ["Health check", "فحص الحالة"], generate_agent_pack: ["Generate agent pack", "إنشاء حزمة الوكيل"],
  },
} as const;

/** Which worker a job kind or step provider waits for. */
export const workerForKind: Record<string, keyof typeof operationsCopy.workers> = {
  provision_instance: "provisioning", seed_repository: "github", provision_domains: "domain",
  verify_domain: "domain", publish_release: "release", check_integration: "integration",
  reconcile_drift: "reconciliation", suspend_instance: "infrastructure", close_instance: "infrastructure",
  rotate_secret: "infrastructure",
};
```
Register in `copy.test.ts`: `import * as operations from "./operations-copy";` (`assertCopyTree` checks arrays and recurses objects; the plain-string `workerForKind` map passes untouched).

- [ ] **Step 3: Instances list**

`apps/platform-admin/app/[locale]/(console)/instances/page.tsx`:
```tsx
import { formatNumber } from "@wlbp/i18n";
import { Badge } from "@wlbp/ui-foundation";
import Link from "next/link";
import { copyFor, formCopy, say, stateCopy, statusCopy } from "../../../_lib/copy";
import { listHref, parseListParams } from "../../../_lib/list-params";
import { callOperator } from "../../../_lib/operator-api";
import { getOperator } from "../../../_lib/operator-page";
import { operationsCopy } from "../../../_lib/operations-copy";
import { pageLocale } from "../../../_lib/page-locale";
import { PageHeader } from "../../../_lib/shell/page-header";
import { DataTable } from "../../../_lib/ui/data-table";
import { FilterBar, SelectFilter } from "../../../_lib/ui/filter-bar";
import { Pagination } from "../../../_lib/ui/pagination";
import { EmptyState, Unknown, UnavailableState } from "../../../_lib/ui/states";
import { StatusBadge } from "../../../_lib/ui/status-badge";
import { TimeValue } from "../../../_lib/ui/time";

export const dynamic = "force-dynamic";

const c = operationsCopy.instances;
const spec = {
  filters: { state: ["provisioning", "active", "suspended", "closed"], ring: ["canary", "early", "general"], drift: ["yes", "no"] },
  pageSize: 25,
} as const;

export default async function InstancesPage({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await pageLocale(params);
  if (!(await getOperator(locale))) return null;
  const list = parseListParams(await searchParams, spec);
  const path = `/${locale}/instances`;
  const result = await callOperator("list_instances_v1", {
    p_search: list.q || undefined, p_state: list.filters.state, p_ring: list.filters.ring,
    p_drift: list.filters.drift === undefined ? undefined : list.filters.drift === "yes",
    p_limit: list.pageSize, p_offset: list.offset,
  });
  const status = (s: string) => copyFor(statusCopy, s, locale);

  return (
    <>
      <PageHeader locale={locale} title={say(locale, c.title)} description={say(locale, c.description)} />
      <FilterBar locale={locale} path={path} search={{ label: say(locale, c.search), value: list.q }}>
        <SelectFilter name="state" label={say(locale, c.state)} value={list.filters.state} allLabel={say(locale, formCopy.all)}
          options={spec.filters.state.map((s) => [s, status(s)] as const)} />
        <SelectFilter name="ring" label={say(locale, c.ring)} value={list.filters.ring} allLabel={say(locale, formCopy.all)}
          options={spec.filters.ring.map((s) => [s, status(s)] as const)} />
        <SelectFilter name="drift" label={say(locale, c.drift)} value={list.filters.drift} allLabel={say(locale, formCopy.all)}
          options={[["yes", say(locale, c.driftOnly)], ["no", say(locale, c.noDrift)]]} />
      </FilterBar>
      {!result.ok ? <UnavailableState locale={locale} code={result.code} />
        : result.data.length === 0 ? <EmptyState locale={locale} filtered={Boolean(list.q || Object.keys(list.filters).length)} />
        : (
          <>
            <DataTable id="instances-table" locale={locale} caption={say(locale, c.title)}
              columns={[{ label: say(locale, c.tenant) }, { label: say(locale, c.instance) }, { label: say(locale, c.state) },
                { label: say(locale, c.ring) }, { label: say(locale, c.release) }, { label: say(locale, c.infrastructure), numeric: true },
                { label: say(locale, c.health) }]}
              rows={result.data.map((row) => ({
                key: row.instance_id,
                cells: [
                  <Link key="t" href={`/${locale}/tenants/${row.tenant_id}`}><bdi>{row.tenant_name}</bdi></Link>,
                  <Link key="i" href={`${path}/${row.instance_id}`}><bdi>{row.instance_id.slice(0, 8)}</bdi></Link>,
                  <StatusBadge key="s" locale={locale} status={row.deployment_state} />,
                  row.rollout_ring ? status(row.rollout_ring) : <Unknown locale={locale} kind="none" />,
                  <>
                    <bdi>{row.desired_release ?? "—"} → {row.current_release ?? say(locale, stateCopy.notReported)}</bdi>
                    {row.release_drifted ? <> <Badge tone="warning">{say(locale, c.drifted)}</Badge></> : null}
                  </>,
                  `${formatNumber(row.infrastructure_failing, locale)} / ${formatNumber(row.infrastructure_drifted, locale)} / ${formatNumber(row.infrastructure_total, locale)}`,
                  row.health_status
                    ? <><StatusBadge locale={locale} status={row.health_status} /> <TimeValue locale={locale} value={row.health_observed_at} staleAfterMinutes={30} /></>
                    : <Unknown locale={locale} />,
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

- [ ] **Step 4: Instance detail (desired versus observed)**

`apps/platform-admin/app/[locale]/(console)/instances/[instanceId]/page.tsx`:
```tsx
import { Badge } from "@wlbp/ui-foundation";
import Link from "next/link";
import { notFound } from "next/navigation";
import { copyFor, say, stateCopy, statusCopy } from "../../../../_lib/copy";
import { callOperator } from "../../../../_lib/operator-api";
import { getOperator } from "../../../../_lib/operator-page";
import { operationsCopy } from "../../../../_lib/operations-copy";
import { pageLocale } from "../../../../_lib/page-locale";
import { PageHeader } from "../../../../_lib/shell/page-header";
import { DataTable } from "../../../../_lib/ui/data-table";
import { Facts } from "../../../../_lib/ui/facts";
import { EmptyState, Unknown, UnavailableState } from "../../../../_lib/ui/states";
import { StatusBadge } from "../../../../_lib/ui/status-badge";
import { TimeValue } from "../../../../_lib/ui/time";

export const dynamic = "force-dynamic";

const c = operationsCopy.instances;

type InstanceDetail = {
  id: string; tenant_id: string; tenant_name: string; deployment_state: string; brand_published: boolean; created_at: string;
  release: { desired_release: string | null; current_release: string | null; config_schema_version: number;
    customization_tier: string; supported_backend_min: number; supported_backend_max: number;
    environment_verified: boolean; reported_at: string | null } | null;
  infrastructure: { id: string; provider: string; resource_kind: string; external_id: string;
    desired_state: Record<string, unknown>; observed_state: Record<string, unknown>; drifted: boolean;
    observed_at: string | null; attempts: number; last_success_at: string | null; last_error_code: string | null }[];
  health: { subject_key: string; signal: string; status: string; error_code: string | null; observed_at: string }[];
  domains: { id: string; hostname: string; application: string; verification_status: string; active: boolean }[];
  runs: { id: string; state: string; slug: string; updated_at: string }[];
};

export default async function InstancePage({ params }: { params: Promise<{ locale: string; instanceId: string }> }) {
  const locale = await pageLocale(params);
  const { instanceId } = await params;
  if (!(await getOperator(locale))) return null;
  if (!/^[0-9a-f-]{36}$/u.test(instanceId)) notFound();
  const result = await callOperator("get_instance_v1", { p_instance_id: instanceId });
  if (!result.ok && result.code === "not_found") notFound();
  const crumbs = [[say(locale, c.title), `/${locale}/instances`]] as const;
  if (!result.ok) return <><PageHeader locale={locale} title={say(locale, c.title)} breadcrumbs={crumbs} /><UnavailableState locale={locale} code={result.code} /></>;
  const d = result.data as unknown as InstanceDetail;
  const r = d.release;

  return (
    <>
      <PageHeader locale={locale} title={`${d.tenant_name} · ${d.id.slice(0, 8)}`} breadcrumbs={[...crumbs, [d.id.slice(0, 8)]]}
        actions={<StatusBadge locale={locale} status={d.deployment_state} />} />
      <section className="section" aria-labelledby="release-title">
        <div className="section-header"><h2 id="release-title">{say(locale, c.releaseState)}</h2></div>
        <Facts items={[
          [say(locale, c.tenant), <Link key="t" href={`/${locale}/tenants/${d.tenant_id}`}><bdi>{d.tenant_name}</bdi></Link>],
          [say(locale, c.release), r
            ? <bdi key="r">{r.desired_release ?? "—"} → {r.current_release ?? say(locale, stateCopy.notReported)}</bdi>
            : <Unknown key="r" locale={locale} kind="notReported" />],
          [say(locale, c.configSchema), r ? String(r.config_schema_version) : <Unknown key="c" locale={locale} kind="notReported" />],
          [say(locale, c.tier), r ? <bdi key="tier">{r.customization_tier}</bdi> : <Unknown key="tier" locale={locale} kind="notReported" />],
          [say(locale, c.contract), r ? `${r.supported_backend_min}–${r.supported_backend_max}` : <Unknown key="k" locale={locale} kind="notReported" />],
          [say(locale, c.environment), r ? say(locale, r.environment_verified ? stateCopy.yes : stateCopy.no) : <Unknown key="e" locale={locale} kind="notReported" />],
          [say(locale, c.reportedAt), <TimeValue key="at" locale={locale} value={r?.reported_at} empty="notReported" staleAfterMinutes={1440} />],
        ]} />
      </section>

      <section className="section" aria-labelledby="infra-title">
        <div className="section-header"><h2 id="infra-title">{say(locale, c.resources)}</h2></div>
        {d.infrastructure.length === 0 ? <EmptyState locale={locale} title={say(locale, c.noResources)} /> : d.infrastructure.map((f) => (
          <article key={f.id} className="section" aria-labelledby={`res-${f.id}`}>
            <div className="section-header">
              <h3 id={`res-${f.id}`}><bdi>{f.provider} · {f.resource_kind}</bdi></h3>
              <Badge tone={f.drifted ? "warning" : "positive"}>{say(locale, f.drifted ? c.drifted : c.inSync)}</Badge>
            </div>
            <Facts items={[
              [say(locale, c.externalId), <bdi key="x">{f.external_id}</bdi>],
              [say(locale, c.observedAt), <TimeValue key="o" locale={locale} value={f.observed_at} empty="notObserved" staleAfterMinutes={60} />],
              [say(locale, c.attempts), String(f.attempts)],
              [say(locale, c.lastSuccess), <TimeValue key="s" locale={locale} value={f.last_success_at} />],
              [say(locale, c.lastError), f.last_error_code ? <bdi key="e">{f.last_error_code}</bdi> : <Unknown key="e" locale={locale} kind="none" />],
            ]} />
            <div className="json-pair">
              <div><h4>{say(locale, c.desired)}</h4><pre>{JSON.stringify(f.desired_state, null, 2)}</pre></div>
              <div><h4>{say(locale, c.observed)}</h4><pre>{JSON.stringify(f.observed_state, null, 2)}</pre></div>
            </div>
          </article>
        ))}
      </section>

      <section className="section" aria-labelledby="signals-title">
        <div className="section-header"><h2 id="signals-title">{say(locale, c.signals)}</h2></div>
        {d.health.length === 0 ? <p><Unknown locale={locale} /></p> : (
          <DataTable id="signals-table" locale={locale} caption={say(locale, c.signals)}
            columns={[{ label: say(locale, c.signal) }, { label: say(locale, c.health) }, { label: say(locale, c.observedAt) }]}
            rows={d.health.map((h) => ({
              key: `${h.subject_key}:${h.signal}`,
              cells: [<bdi key="s">{h.subject_key} · {h.signal}</bdi>,
                <><StatusBadge locale={locale} status={h.status} />{h.error_code ? <span className="secondary"><bdi>{h.error_code}</bdi></span> : null}</>,
                <TimeValue key="t" locale={locale} value={h.observed_at} staleAfterMinutes={30} />],
            }))} />
        )}
      </section>

      <section className="section" aria-labelledby="links-title">
        <div className="section-header"><h2 id="links-title">{say(locale, c.domains)} · {say(locale, c.runs)}</h2></div>
        <ul>
          {d.domains.map((dom) => (
            <li key={dom.id}><bdi>{dom.hostname}</bdi> <StatusBadge locale={locale} status={dom.verification_status} /></li>
          ))}
          {d.runs.map((run) => (
            <li key={run.id}><Link href={`/${locale}/provisioning/${run.id}`}><bdi>{run.slug}</bdi></Link> {copyFor(statusCopy, run.state, locale)}</li>
          ))}
        </ul>
      </section>
    </>
  );
}
```
Observed/desired documents are stored secret-free by constraint (`contains_no_secret_v1`); they render as `dir="ltr"` code via `.json-pair pre`.

- [ ] **Step 5: Domains list**

`apps/platform-admin/app/[locale]/(console)/domains/page.tsx`:
```tsx
import Link from "next/link";
import { actionCopy as a } from "../../../_lib/action-copy";
import { requestDomainVerificationAction } from "../../../_lib/actions/domains";
import { copyFor, formCopy, say, stateCopy, statusCopy } from "../../../_lib/copy";
import { listHref, parseListParams } from "../../../_lib/list-params";
import { callOperator } from "../../../_lib/operator-api";
import { atLeast, getOperator } from "../../../_lib/operator-page";
import { operationsCopy } from "../../../_lib/operations-copy";
import { pageLocale } from "../../../_lib/page-locale";
import { PageHeader } from "../../../_lib/shell/page-header";
import { DataTable } from "../../../_lib/ui/data-table";
import { FilterBar, SelectFilter } from "../../../_lib/ui/filter-bar";
import { OperatorForm } from "../../../_lib/ui/operator-form";
import { Pagination } from "../../../_lib/ui/pagination";
import { EmptyState, Unknown, UnavailableState } from "../../../_lib/ui/states";
import { StatusBadge } from "../../../_lib/ui/status-badge";
import { TimeValue } from "../../../_lib/ui/time";

export const dynamic = "force-dynamic";

const c = operationsCopy.domains;
const spec = { filters: { status: ["pending", "verified", "failed"] }, pageSize: 25 } as const;

export default async function DomainsPage({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await pageLocale(params);
  const operator = await getOperator(locale);
  if (!operator) return null;
  const list = parseListParams(await searchParams, spec);
  const path = `/${locale}/domains`;
  const result = await callOperator("list_domains_v1", {
    p_search: list.q || undefined, p_status: list.filters.status, p_limit: list.pageSize, p_offset: list.offset,
  });
  const canQueue = atLeast(operator.role, "operator");

  return (
    <>
      <PageHeader locale={locale} title={say(locale, c.title)} description={say(locale, c.description)} />
      <p className="notice">{say(locale, c.certificateNote)}</p>
      <FilterBar locale={locale} path={path} search={{ label: say(locale, c.search), value: list.q }}>
        <SelectFilter name="status" label={say(locale, c.verification)} value={list.filters.status} allLabel={say(locale, formCopy.all)}
          options={spec.filters.status.map((s) => [s, copyFor(statusCopy, s, locale)] as const)} />
      </FilterBar>
      {!result.ok ? <UnavailableState locale={locale} code={result.code} />
        : result.data.length === 0 ? <EmptyState locale={locale} filtered={Boolean(list.q || list.filters.status)} />
        : (
          <>
            <DataTable id="domains-table" locale={locale} caption={say(locale, c.title)}
              columns={[{ label: say(locale, c.hostname) }, { label: say(locale, c.tenant) }, { label: say(locale, c.application) },
                { label: say(locale, c.verification) }, { label: say(locale, c.certificate) }, { label: say(locale, c.serving) },
                { label: say(locale, c.pendingJob) }]}
              rows={result.data.map((row) => ({
                key: row.domain_id,
                cells: [
                  <bdi key="h">{row.hostname}</bdi>,
                  <Link key="t" href={`/${locale}/tenants/${row.tenant_id}#domains`}><bdi>{row.tenant_name}</bdi></Link>,
                  <bdi key="a">{row.application}</bdi>,
                  <><StatusBadge locale={locale} status={row.verification_status} /> <TimeValue locale={locale} value={row.verified_at} empty="none" /></>,
                  row.certificate_status
                    ? <><bdi>{row.certificate_status}</bdi> <TimeValue locale={locale} value={row.certificate_observed_at} staleAfterMinutes={1440} /></>
                    : <Unknown locale={locale} kind="notReported" />,
                  say(locale, row.active ? stateCopy.yes : stateCopy.no),
                  row.pending_job_id
                    ? <Link key="j" href={`/${locale}/jobs/${row.pending_job_id}`}>{copyFor(statusCopy, "queued", locale)}</Link>
                    : canQueue && row.verification_status !== "verified" ? (
                      <OperatorForm key="q" locale={locale} action={requestDomainVerificationAction} submit={say(locale, a.verifyDomain.submit)}
                        successMessage={say(locale, a.verifyDomain.done)} className="inline-form">
                        <input type="hidden" name="domainId" value={row.domain_id} />
                        <input type="hidden" name="tenantId" value={row.tenant_id} />
                      </OperatorForm>
                    ) : <Unknown locale={locale} kind="none" />,
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
Adding a domain needs a tenant and instance, so it lives on the tenant detail page (Task 14, Domains section).

- [ ] **Step 6: Provisioning runs list**

`apps/platform-admin/app/[locale]/(console)/provisioning/page.tsx`:
```tsx
import { formatNumber } from "@wlbp/i18n";
import Link from "next/link";
import { copyFor, formCopy, reasonCopy, say, statusCopy } from "../../../_lib/copy";
import { listHref, parseListParams } from "../../../_lib/list-params";
import { callOperator } from "../../../_lib/operator-api";
import { atLeast, getOperator } from "../../../_lib/operator-page";
import { operationsCopy } from "../../../_lib/operations-copy";
import { pageLocale } from "../../../_lib/page-locale";
import { PageHeader } from "../../../_lib/shell/page-header";
import { DataTable } from "../../../_lib/ui/data-table";
import { FilterBar, SelectFilter } from "../../../_lib/ui/filter-bar";
import { Pagination } from "../../../_lib/ui/pagination";
import { EmptyState, UnavailableState } from "../../../_lib/ui/states";
import { StatusBadge } from "../../../_lib/ui/status-badge";
import { TimeValue } from "../../../_lib/ui/time";

export const dynamic = "force-dynamic";

const c = operationsCopy.provisioning;
const spec = { filters: { state: ["in_progress", "waiting", "failed", "active", "deactivated"] }, pageSize: 25 } as const;

export default async function ProvisioningPage({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await pageLocale(params);
  const operator = await getOperator(locale);
  if (!operator) return null;
  const list = parseListParams(await searchParams, spec);
  const path = `/${locale}/provisioning`;
  const result = await callOperator("list_provisioning_runs_v1", {
    p_state: list.filters.state, p_search: list.q || undefined, p_limit: list.pageSize, p_offset: list.offset,
  });
  const stateLabel = (s: string) => s === "in_progress" ? say(locale, c.inProgress) : s === "waiting" ? say(locale, c.waiting) : copyFor(statusCopy, s, locale);

  return (
    <>
      <PageHeader locale={locale} title={say(locale, c.title)} description={say(locale, c.description)}
        actions={atLeast(operator.role, "operator")
          ? <Link className="wlbp-button wlbp-button--primary" href={`${path}/new`}>{say(locale, c.request)}</Link> : null} />
      <FilterBar locale={locale} path={path} search={{ label: say(locale, c.search), value: list.q }}>
        <SelectFilter name="state" label={say(locale, c.state)} value={list.filters.state} allLabel={say(locale, formCopy.all)}
          options={spec.filters.state.map((s) => [s, stateLabel(s)] as const)} />
      </FilterBar>
      {!result.ok ? <UnavailableState locale={locale} code={result.code} />
        : result.data.length === 0 ? <EmptyState locale={locale} filtered={Boolean(list.q || list.filters.state)} />
        : (
          <>
            <DataTable id="runs-table" locale={locale} caption={say(locale, c.title)}
              columns={[{ label: say(locale, c.slug) }, { label: say(locale, c.tenant) }, { label: say(locale, c.state) },
                { label: say(locale, c.steps), numeric: true }, { label: say(locale, c.release) }, { label: say(locale, c.updated) }]}
              rows={result.data.map((row) => ({
                key: row.run_id,
                cells: [
                  <Link key="s" href={`${path}/${row.run_id}`}><bdi>{row.slug}</bdi></Link>,
                  <Link key="t" href={`/${locale}/tenants/${row.tenant_id}`}><bdi>{row.tenant_name}</bdi></Link>,
                  <>
                    <StatusBadge locale={locale} status={row.waiting_reason ? "waiting" : row.state} />
                    {row.waiting_reason ? <span className="secondary">{copyFor(reasonCopy, `waiting_${row.waiting_reason}`, locale)}</span> : null}
                    {row.last_error_code ? <span className="secondary"><bdi>{row.last_error_code}</bdi></span> : null}
                  </>,
                  `${formatNumber(row.steps_succeeded, locale)} / ${formatNumber(row.steps_total, locale)}`,
                  <bdi key="r">{row.desired_release}</bdi>,
                  <TimeValue key="u" locale={locale} value={row.updated_at} />,
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

- [ ] **Step 7: Request provisioning**

`apps/platform-admin/app/[locale]/(console)/provisioning/new/page.tsx`:
```tsx
import { TextField } from "@wlbp/ui-foundation";
import { randomUUID } from "node:crypto";
import { requestProvisioningAction } from "../../../../_lib/actions/operations";
import { say, stateCopy } from "../../../../_lib/copy";
import { callOperator } from "../../../../_lib/operator-api";
import { atLeast, getOperator } from "../../../../_lib/operator-page";
import { operationsCopy } from "../../../../_lib/operations-copy";
import { pageLocale } from "../../../../_lib/page-locale";
import { PageHeader } from "../../../../_lib/shell/page-header";
import { OperatorForm } from "../../../../_lib/ui/operator-form";
import { SelectField } from "../../../../_lib/ui/select-field";
import { EmptyState, UnavailableState } from "../../../../_lib/ui/states";

export const dynamic = "force-dynamic";

const c = operationsCopy.provisioning;

export default async function RequestProvisioningPage({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await pageLocale(params);
  const operator = await getOperator(locale);
  if (!operator) return null;
  const preselectTenant = (await searchParams).tenant;
  const header = <PageHeader locale={locale} title={say(locale, c.newTitle)} description={say(locale, c.newDescription)}
    breadcrumbs={[[say(locale, c.title), `/${locale}/provisioning`], [say(locale, c.newTitle)]]} />;
  if (!atLeast(operator.role, "operator")) return <>{header}<p className="notice">{say(locale, stateCopy.roleRequired)}</p></>;

  const [instances, plans, releases] = await Promise.all([
    callOperator("list_instances_v1", { p_state: "provisioning", p_limit: 100 }),
    callOperator("list_plans_v1"),
    callOperator("list_releases_v1", { p_status: "available", p_limit: 100 }),
  ]);
  if (!instances.ok || !plans.ok || !releases.ok) {
    const code = !instances.ok ? instances.code : !plans.ok ? plans.code : !releases.ok ? releases.code : "unavailable";
    return <>{header}<UnavailableState locale={locale} code={code} /></>;
  }
  if (instances.data.length === 0) return <>{header}<EmptyState locale={locale} title={say(locale, c.noTargets)} /></>;
  if (releases.data.length === 0) return <>{header}<EmptyState locale={locale} title={say(locale, c.noReleases)} /></>;

  const preselected = instances.data.find((i) => i.tenant_id === preselectTenant);
  return (
    <>
      {header}
      <section className="section">
        <OperatorForm locale={locale} action={requestProvisioningAction} submit={say(locale, c.request)} successMessage={say(locale, c.submitted)}>
          <input type="hidden" name="idempotencyKey" value={randomUUID()} />
          <div className="form-grid">
            <div className="full">
              <SelectField name="target" label={say(locale, c.target)}
                value={preselected ? `${preselected.tenant_id}|${preselected.instance_id}` : undefined}
                options={instances.data.map((i) => [`${i.tenant_id}|${i.instance_id}`, `${i.tenant_name} · ${i.instance_id.slice(0, 8)}`] as const)} />
            </div>
            <TextField id="slug" name="slug" label={say(locale, c.slug)} description={say(locale, c.slugHint)} required minLength={3} maxLength={40} autoComplete="off" />
            <SelectField name="planKey" label={say(locale, c.plan)} options={plans.data.filter((p) => p.active).map((p) => [p.key, p.name] as const)} />
            <SelectField name="releaseId" label={say(locale, c.releaseField)}
              options={releases.data.map((r) => [r.release_id, `${r.version} · ${r.channel}`] as const)} />
            <SelectField name="defaultLocale" label={say(locale, c.defaultLocale)} value={locale} options={[["en", "English"], ["ar", "العربية"]]} />
            <TextField id="timezone" name="timezone" label={say(locale, c.timezone)} description={say(locale, c.timezoneHint)} defaultValue="Asia/Riyadh" required />
            <TextField id="currency" name="currency" label={say(locale, c.currency)} defaultValue="SAR" required minLength={3} maxLength={3} />
            <TextField id="clientHostname" name="clientHostname" label={say(locale, c.clientHostname)} maxLength={253} autoComplete="off" />
            <TextField id="dashboardHostname" name="dashboardHostname" label={say(locale, c.dashboardHostname)} maxLength={253} autoComplete="off" />
          </div>
        </OperatorForm>
      </section>
    </>
  );
}
```
Validation is the database's: `request_provisioning_v1` returns every rejection at once (e.g. `github_installation_missing`, `slug_taken`), and `OperatorForm` lists them through `reasonCopy`.

- [ ] **Step 8: Provisioning run detail**

`apps/platform-admin/app/[locale]/(console)/provisioning/[runId]/page.tsx`:
```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { activateRunAction, deactivateRunAction, retryRunAction } from "../../../../_lib/actions/operations";
import { copyFor, fill, reasonCopy, say, statusCopy } from "../../../../_lib/copy";
import { callOperator } from "../../../../_lib/operator-api";
import { atLeast, getOperator } from "../../../../_lib/operator-page";
import { operationsCopy } from "../../../../_lib/operations-copy";
import { pageLocale } from "../../../../_lib/page-locale";
import { PageHeader } from "../../../../_lib/shell/page-header";
import { ActionDialog } from "../../../../_lib/ui/action-dialog";
import { DetailSummary } from "../../../../_lib/ui/audit-list";
import { DataTable } from "../../../../_lib/ui/data-table";
import { Facts } from "../../../../_lib/ui/facts";
import { Unknown, UnavailableState } from "../../../../_lib/ui/states";
import { StatusBadge } from "../../../../_lib/ui/status-badge";
import { TimeValue } from "../../../../_lib/ui/time";

export const dynamic = "force-dynamic";

const c = operationsCopy.provisioning;

type Step = { step_key: string; order: number; provider: string | null; required: boolean; status: string; attempts: number;
  max_attempts: number; external_id: string | null; waiting_reason: string | null; error_code: string | null;
  retry_after: string | null; locked_until: string | null; started_at: string | null; last_success_at: string | null; updated_at: string };
type Run = { id: string; tenant_id: string; tenant_name: string; instance_id: string; slug: string; plan_key: string; state: string;
  waiting_reason: string | null; last_error_code: string | null; desired_release: string; config_schema_version: number;
  backend_contract_min: number; backend_contract_max: number; requested_by_email: string | null; activated_at: string | null;
  deactivated_at: string | null; deactivation_reason: string | null; created_at: string; updated_at: string;
  steps: Step[]; timeline: { at: string; event: string; step_key: string | null; attempt: number | null; error_code: string | null; detail: Record<string, unknown> }[] };

const externalProviders = new Set(["github", "vercel", "resend"]);

export default async function RunPage({ params }: { params: Promise<{ locale: string; runId: string }> }) {
  const locale = await pageLocale(params);
  const { runId } = await params;
  const operator = await getOperator(locale);
  if (!operator) return null;
  if (!/^[0-9a-f-]{36}$/u.test(runId)) notFound();
  const result = await callOperator("get_provisioning_run_detail_v1", { p_run_id: runId });
  if (!result.ok && result.code === "not_found") notFound();
  const crumbs = [[say(locale, c.title), `/${locale}/provisioning`]] as const;
  if (!result.ok) return <><PageHeader locale={locale} title={say(locale, c.title)} breadcrumbs={crumbs} /><UnavailableState locale={locale} code={result.code} /></>;
  const run = result.data as unknown as Run;
  const hidden = { runId: run.id, tenantId: run.tenant_id };
  const finished = run.state === "active" || run.state === "deactivated";
  const hasFailure = run.state === "failed" || run.steps.some((s) => s.status === "failed");
  const stepName = (key: string) => say(locale, operationsCopy.stepNames[key as keyof typeof operationsCopy.stepNames] ?? [key, key]);

  return (
    <>
      <PageHeader locale={locale} title={run.slug} breadcrumbs={[...crumbs, [run.slug]]}
        actions={<>
          <StatusBadge locale={locale} status={run.waiting_reason ? "waiting" : run.state} />
          {atLeast(operator.role, "operator") && !finished && hasFailure ? (
            <ActionDialog locale={locale} action={retryRunAction} trigger={say(locale, c.retry)} title={say(locale, c.retryTitle)}
              description={say(locale, c.retryBody)} submit={say(locale, c.retry)} successMessage={say(locale, c.retried)} hidden={hidden} />
          ) : null}
          {atLeast(operator.role, "operator") && !finished ? (
            <ActionDialog locale={locale} action={activateRunAction} trigger={say(locale, c.activate)} title={say(locale, c.activateTitle)}
              description={say(locale, c.activateBody)} submit={say(locale, c.activate)} successMessage={say(locale, c.activated)} hidden={hidden} />
          ) : null}
          {atLeast(operator.role, "admin") && run.state !== "deactivated" ? (
            <ActionDialog locale={locale} action={deactivateRunAction} trigger={say(locale, c.deactivate)} danger
              title={say(locale, c.deactivateTitle)} description={say(locale, c.deactivateBody)} submit={say(locale, c.deactivate)}
              successMessage={say(locale, c.deactivated)} reason={{ minLength: 10 }} hidden={hidden} />
          ) : null}
        </>} />

      <section className="section" aria-labelledby="run-facts">
        <h2 id="run-facts" className="sr-only">{say(locale, c.run)}</h2>
        <Facts items={[
          [say(locale, c.tenant), <Link key="t" href={`/${locale}/tenants/${run.tenant_id}`}><bdi>{run.tenant_name}</bdi></Link>],
          [say(locale, c.waitingReason), run.waiting_reason ? copyFor(reasonCopy, `waiting_${run.waiting_reason}`, locale) : <Unknown key="w" locale={locale} kind="none" />],
          [say(locale, c.lastError), run.last_error_code ? <bdi key="e">{run.last_error_code}</bdi> : <Unknown key="e" locale={locale} kind="none" />],
          [say(locale, c.release), <bdi key="r">{run.desired_release}</bdi>],
          [say(locale, c.contract), `${run.backend_contract_min}–${run.backend_contract_max}`],
          [say(locale, c.requestedBy), <bdi key="b">{run.requested_by_email ?? "—"}</bdi>],
          [say(locale, c.activatedAt), <TimeValue key="a" locale={locale} value={run.activated_at} />],
          [say(locale, c.deactivatedAt), <>{<TimeValue locale={locale} value={run.deactivated_at} />} {run.deactivation_reason}</>],
        ]} />
      </section>

      <section className="section" aria-labelledby="steps-title">
        <div className="section-header"><h2 id="steps-title">{say(locale, c.steps)}</h2></div>
        <DataTable id="steps-table" locale={locale} caption={say(locale, c.steps)}
          columns={[{ label: say(locale, c.step) }, { label: say(locale, c.provider) }, { label: say(locale, c.status) },
            { label: say(locale, c.attempts), numeric: true }, { label: say(locale, c.started) }, { label: say(locale, c.lastSuccess) },
            { label: say(locale, c.retryAfter) }]}
          rows={run.steps.map((s) => ({
            key: s.step_key,
            cells: [
              <>{stepName(s.step_key)}<span className="secondary"><bdi>{s.step_key}</bdi>{s.external_id ? <> · <bdi>{s.external_id}</bdi></> : null}</span></>,
              s.provider ? <bdi key="p">{s.provider}</bdi> : <Unknown key="p" locale={locale} kind="none" />,
              <>
                <StatusBadge locale={locale} status={s.status} />
                {s.waiting_reason ? <span className="secondary">{copyFor(reasonCopy, `waiting_${s.waiting_reason}`, locale)}</span> : null}
                {s.error_code ? <span className="secondary"><bdi>{s.error_code}</bdi></span> : null}
                {s.status === "pending" && s.provider && externalProviders.has(s.provider) ? (
                  <span className="secondary">{fill(locale, c.externalWorker, { worker: say(locale, operationsCopy.workers[s.provider as "github" | "vercel" | "resend"]) })}</span>
                ) : null}
              </>,
              `${s.attempts} / ${s.max_attempts}`,
              <TimeValue key="st" locale={locale} value={s.started_at} />,
              <TimeValue key="ok" locale={locale} value={s.last_success_at} />,
              <TimeValue key="ra" locale={locale} value={s.retry_after} empty="none" />,
            ],
          }))} />
      </section>

      <section className="section" aria-labelledby="timeline-title">
        <div className="section-header"><h2 id="timeline-title">{say(locale, c.timeline)}</h2></div>
        <ol className="timeline">
          {run.timeline.map((e, index) => (
            <li key={`${e.at}:${index}`}>
              <TimeValue locale={locale} value={e.at} />
              <div>
                <strong>{copyFor(statusCopy, e.event, locale)}</strong> <bdi>{e.event}</bdi>
                {e.step_key ? <> · {stepName(e.step_key)}</> : null}
                {e.attempt !== null ? <> · #{e.attempt}</> : null}
                {e.error_code ? <span className="secondary"><bdi>{e.error_code}</bdi></span> : null}
                <DetailSummary detail={e.detail} />
              </div>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
```

- [ ] **Step 9: Jobs list**

`apps/platform-admin/app/[locale]/(console)/jobs/page.tsx`:
```tsx
import Link from "next/link";
import { copyFor, formCopy, say, statusCopy } from "../../../_lib/copy";
import { listHref, parseListParams } from "../../../_lib/list-params";
import { callOperator } from "../../../_lib/operator-api";
import { getOperator } from "../../../_lib/operator-page";
import { operationsCopy } from "../../../_lib/operations-copy";
import { pageLocale } from "../../../_lib/page-locale";
import { PageHeader } from "../../../_lib/shell/page-header";
import { DataTable } from "../../../_lib/ui/data-table";
import { FilterBar, SelectFilter } from "../../../_lib/ui/filter-bar";
import { Pagination } from "../../../_lib/ui/pagination";
import { EmptyState, Unknown, UnavailableState } from "../../../_lib/ui/states";
import { StatusBadge } from "../../../_lib/ui/status-badge";
import { TimeValue } from "../../../_lib/ui/time";

export const dynamic = "force-dynamic";

const c = operationsCopy.jobs;
const kinds = Object.keys(operationsCopy.kinds) as (keyof typeof operationsCopy.kinds)[];
const spec = {
  filters: { status: ["queued", "running", "failed", "succeeded", "cancelled", "awaiting_approval"], kind: kinds, tenant: "uuid" },
  pageSize: 25,
} as const;

export default async function JobsPage({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await pageLocale(params);
  if (!(await getOperator(locale))) return null;
  const list = parseListParams(await searchParams, spec);
  const path = `/${locale}/jobs`;
  const result = await callOperator("list_jobs_v1", {
    p_status: list.filters.status, p_kind: list.filters.kind, p_tenant_id: list.filters.tenant,
    p_limit: list.pageSize, p_offset: list.offset,
  });
  const kindLabel = (k: string) => say(locale, operationsCopy.kinds[k as keyof typeof operationsCopy.kinds] ?? [k, k]);

  return (
    <>
      <PageHeader locale={locale} title={say(locale, c.title)} description={say(locale, c.description)} />
      <FilterBar locale={locale} path={path}>
        <SelectFilter name="status" label={say(locale, c.status)} value={list.filters.status} allLabel={say(locale, formCopy.all)}
          options={spec.filters.status.map((s) => [s, copyFor(statusCopy, s, locale)] as const)} />
        <SelectFilter name="kind" label={say(locale, c.kind)} value={list.filters.kind} allLabel={say(locale, formCopy.all)}
          options={kinds.map((k) => [k, kindLabel(k)] as const)} />
        {list.filters.tenant ? <input type="hidden" name="tenant" value={list.filters.tenant} /> : null}
      </FilterBar>
      {!result.ok ? <UnavailableState locale={locale} code={result.code} />
        : result.data.length === 0 ? <EmptyState locale={locale} filtered={Object.keys(list.filters).length > 0} />
        : (
          <>
            <DataTable id="jobs-table" locale={locale} caption={say(locale, c.title)}
              columns={[{ label: say(locale, c.kind) }, { label: say(locale, c.status) }, { label: say(locale, c.tenant) },
                { label: say(locale, c.attempts), numeric: true }, { label: say(locale, c.requestedBy) }, { label: say(locale, c.created) }]}
              rows={result.data.map((row) => ({
                key: row.job_id,
                cells: [
                  <Link key="k" href={`${path}/${row.job_id}`}>{kindLabel(row.kind)}</Link>,
                  <>
                    <StatusBadge locale={locale} status={row.needs_approval ? "awaiting_approval" : row.status} />
                    {row.last_error_code ? <span className="secondary"><bdi>{row.last_error_code}</bdi></span> : null}
                  </>,
                  row.tenant_id ? <Link key="t" href={`/${locale}/tenants/${row.tenant_id}`}><bdi>{row.tenant_name}</bdi></Link> : <Unknown key="t" locale={locale} kind="none" />,
                  String(row.attempts),
                  <bdi key="r">{row.requested_by_email ?? "—"}</bdi>,
                  <TimeValue key="c" locale={locale} value={row.created_at} />,
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

- [ ] **Step 10: Job detail**

`apps/platform-admin/app/[locale]/(console)/jobs/[jobId]/page.tsx`:
```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { approveJobAction, cancelJobAction, retryJobAction } from "../../../../_lib/actions/operations";
import { copyFor, fill, say, statusCopy } from "../../../../_lib/copy";
import { callOperator } from "../../../../_lib/operator-api";
import { atLeast, getOperator } from "../../../../_lib/operator-page";
import { operationsCopy, workerForKind } from "../../../../_lib/operations-copy";
import { pageLocale } from "../../../../_lib/page-locale";
import { PageHeader } from "../../../../_lib/shell/page-header";
import { ActionDialog } from "../../../../_lib/ui/action-dialog";
import { DetailSummary } from "../../../../_lib/ui/audit-list";
import { Facts } from "../../../../_lib/ui/facts";
import { Unknown, UnavailableState } from "../../../../_lib/ui/states";
import { StatusBadge } from "../../../../_lib/ui/status-badge";
import { TimeValue } from "../../../../_lib/ui/time";

export const dynamic = "force-dynamic";

const c = operationsCopy.jobs;

type Job = { id: string; kind: string; status: string; tenant_id: string | null; tenant_name: string | null; instance_id: string | null;
  attempts: number; last_error_code: string | null; parameters: Record<string, unknown>; requested_by_email: string | null;
  approved_by_email: string | null; reason: string | null; needs_approval: boolean; locked_until: string | null;
  created_at: string; started_at: string | null; updated_at: string; completed_at: string | null; cancelled_at: string | null;
  events: { event: string; attempt: number | null; error_code: string | null; actor_email: string | null; at: string }[] };

export default async function JobPage({ params }: { params: Promise<{ locale: string; jobId: string }> }) {
  const locale = await pageLocale(params);
  const { jobId } = await params;
  const operator = await getOperator(locale);
  if (!operator) return null;
  if (!/^[0-9a-f-]{36}$/u.test(jobId)) notFound();
  const result = await callOperator("get_job_v1", { p_job_id: jobId });
  if (!result.ok && result.code === "not_found") notFound();
  const crumbs = [[say(locale, c.title), `/${locale}/jobs`]] as const;
  if (!result.ok) return <><PageHeader locale={locale} title={say(locale, c.title)} breadcrumbs={crumbs} /><UnavailableState locale={locale} code={result.code} /></>;
  const job = result.data as unknown as Job;
  const title = say(locale, operationsCopy.kinds[job.kind as keyof typeof operationsCopy.kinds] ?? [job.kind, job.kind]);
  const hidden = { jobId: job.id, tenantId: job.tenant_id ?? "" };
  const worker = say(locale, operationsCopy.workers[workerForKind[job.kind] ?? "infrastructure"]);
  const canOperate = atLeast(operator.role, "operator");

  return (
    <>
      <PageHeader locale={locale} title={title} breadcrumbs={[...crumbs, [title]]}
        actions={<>
          <StatusBadge locale={locale} status={job.needs_approval ? "awaiting_approval" : job.status} />
          {job.needs_approval && atLeast(operator.role, "admin") ? (
            <ActionDialog locale={locale} action={approveJobAction} trigger={say(locale, c.approve)} triggerVariant="primary"
              title={say(locale, c.approveTitle)} description={say(locale, c.approveBody)} submit={say(locale, c.approve)}
              successMessage={say(locale, c.approved)} hidden={hidden} />
          ) : null}
          {canOperate && job.status === "failed" ? (
            <ActionDialog locale={locale} action={retryJobAction} trigger={say(locale, c.retry)} title={say(locale, c.retryTitle)}
              submit={say(locale, c.retry)} successMessage={say(locale, c.retried)} reason={{ minLength: 5 }} hidden={hidden} />
          ) : null}
          {canOperate && (job.status === "queued" || job.status === "failed") ? (
            <ActionDialog locale={locale} action={cancelJobAction} trigger={say(locale, c.cancel)} danger
              title={say(locale, c.cancelTitle)} description={say(locale, c.cancelBody)} submit={say(locale, c.cancel)}
              successMessage={say(locale, c.cancelled)} reason={{ minLength: 5 }} hidden={hidden} />
          ) : null}
        </>} />
      {job.status === "queued" ? <p className="notice notice--warning">{fill(locale, c.workerNote, { worker })}</p> : null}
      <section className="section" aria-labelledby="job-facts">
        <h2 id="job-facts" className="sr-only">{title}</h2>
        <Facts items={[
          [say(locale, c.tenant), job.tenant_id ? <Link key="t" href={`/${locale}/tenants/${job.tenant_id}`}><bdi>{job.tenant_name}</bdi></Link> : <Unknown key="t" locale={locale} kind="none" />],
          [say(locale, c.attempts), String(job.attempts)],
          [say(locale, c.error), job.last_error_code ? <bdi key="e">{job.last_error_code}</bdi> : <Unknown key="e" locale={locale} kind="none" />],
          [say(locale, c.requestedBy), <bdi key="r">{job.requested_by_email ?? "—"}</bdi>],
          [say(locale, c.approvedBy), job.approved_by_email ? <bdi key="a">{job.approved_by_email}</bdi> : <Unknown key="a" locale={locale} kind="none" />],
          [say(locale, c.reason), job.reason ?? <Unknown key="re" locale={locale} kind="none" />],
          [say(locale, c.created), <TimeValue key="c" locale={locale} value={job.created_at} />],
          [say(locale, c.started), <TimeValue key="s" locale={locale} value={job.started_at} />],
          [say(locale, c.lockedUntil), <TimeValue key="l" locale={locale} value={job.locked_until} empty="none" />],
          [say(locale, c.completed), <TimeValue key="d" locale={locale} value={job.completed_at} />],
          [say(locale, c.parameters), <DetailSummary key="p" detail={job.parameters} />],
        ]} />
      </section>
      <section className="section" aria-labelledby="job-events">
        <div className="section-header"><h2 id="job-events">{say(locale, c.events)}</h2></div>
        <ol className="timeline">
          {job.events.map((e, index) => (
            <li key={`${e.at}:${index}`}>
              <TimeValue locale={locale} value={e.at} />
              <div>
                <strong>{copyFor(statusCopy, e.event, locale)}</strong>
                {e.attempt !== null ? <> · #{e.attempt}</> : null}
                {e.actor_email ? <> · <bdi>{e.actor_email}</bdi></> : null}
                {e.error_code ? <span className="secondary"><bdi>{e.error_code}</bdi></span> : null}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
```

- [ ] **Step 11: Verify and commit**

Run:
```bash
rtk pnpm --filter @wlbp/platform-admin test:unit
rtk pnpm --filter @wlbp/platform-admin typecheck
rtk pnpm exec eslint apps/platform-admin --max-warnings=0
rtk pnpm --filter @wlbp/platform-admin build
```
Expected: pass; the build lists `/[locale]/instances`, `/[locale]/instances/[instanceId]`, `/[locale]/domains`, `/[locale]/provisioning`, `/[locale]/provisioning/new`, `/[locale]/provisioning/[runId]`, `/[locale]/jobs` and `/[locale]/jobs/[jobId]`.

```bash
rtk git add apps/platform-admin/app/_lib/actions/operations.ts apps/platform-admin/app/_lib/operations-copy.ts \
  "apps/platform-admin/app/[locale]/(console)/instances" "apps/platform-admin/app/[locale]/(console)/domains" \
  "apps/platform-admin/app/[locale]/(console)/provisioning" "apps/platform-admin/app/[locale]/(console)/jobs" \
  apps/platform-admin/app/_lib/copy.ts apps/platform-admin/app/_lib/copy.test.ts
rtk git commit -m "Show instances, domains, provisioning runs and jobs with their real state"
```
