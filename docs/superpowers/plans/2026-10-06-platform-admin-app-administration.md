# Platform Admin Completion — Part B4: Administration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Global Constraints: [`2026-10-06-platform-admin-completion.md`](2026-10-06-platform-admin-completion.md). Conventions: [`2026-10-06-platform-admin-application.md`](2026-10-06-platform-admin-application.md). Depends on Parts B1–B3 (Tasks 9–18).

**Goal:** Operator management and account security, the searchable audit log with controlled export, and platform settings with integration status.

---

### Task 19: Operators and account security

**Files:**
- Create: `apps/platform-admin/app/_lib/actions/operators.ts`
- Create: `apps/platform-admin/app/_lib/admin-copy.ts`
- Create: `apps/platform-admin/app/[locale]/(console)/operators/page.tsx`
- Create: `apps/platform-admin/app/[locale]/(console)/account/page.tsx`
- Create: `apps/platform-admin/app/[locale]/(console)/account/factors.tsx`
- Modify: `apps/platform-admin/app/_lib/copy.test.ts` (register `admin-copy`)

**Interfaces:**
- Produces server actions in `actions/operators.ts`:

| Action | Form fields | RPC |
| --- | --- | --- |
| `addOperatorAction` | `email`, `role`, `expiresAt` (datetime-local UTC, required for break-glass), `reason` | `add_operator_v1` |
| `setOperatorRoleAction` | `operatorId`, `role`, `expiresAt`, `reason` | `set_operator_role_v1` |
| `disableOperatorAction` / `enableOperatorAction` | `operatorId`, `reason` | `disable_operator_v1` / `enable_operator_v1` |

- [ ] **Step 1: Operator actions**

`apps/platform-admin/app/_lib/actions/operators.ts`:
```ts
"use server";

import { instant, text, uuid } from "../form-data";
import { runOperatorAction, type ActionResult } from "../operator-action";
import { missing } from "./guard";

export async function addOperatorAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  return (await runOperatorAction({
    action: "operator.add", fn: "add_operator_v1",
    args: { p_email: text(form, "email"), p_role: text(form, "role"), p_expires_at: instant(form, "expiresAt"), p_reason: text(form, "reason") },
    targetKind: "operator",
  })).result;
}

export async function setOperatorRoleAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const operatorId = uuid(form, "operatorId");
  const invalid = missing(operatorId);
  if (invalid) return invalid;
  return (await runOperatorAction({
    action: "operator.change_role", fn: "set_operator_role_v1",
    args: { p_operator_id: operatorId!, p_role: text(form, "role"), p_expires_at: instant(form, "expiresAt"), p_reason: text(form, "reason") },
    targetKind: "operator", targetId: operatorId,
  })).result;
}

export async function disableOperatorAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const operatorId = uuid(form, "operatorId");
  const invalid = missing(operatorId);
  if (invalid) return invalid;
  return (await runOperatorAction({
    action: "operator.disable", fn: "disable_operator_v1",
    args: { p_operator_id: operatorId!, p_reason: text(form, "reason") },
    targetKind: "operator", targetId: operatorId,
  })).result;
}

export async function enableOperatorAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const operatorId = uuid(form, "operatorId");
  const invalid = missing(operatorId);
  if (invalid) return invalid;
  return (await runOperatorAction({
    action: "operator.enable", fn: "enable_operator_v1",
    args: { p_operator_id: operatorId!, p_reason: text(form, "reason") },
    targetKind: "operator", targetId: operatorId,
  })).result;
}
```

- [ ] **Step 2: Administration copy**

`apps/platform-admin/app/_lib/admin-copy.ts`:
```ts
export const operatorsCopy = {
  title: ["Operators", "المشغّلون"],
  description: ["Who can use Platform Admin and at what level. Changes take effect on the person's next action.",
    "من يمكنه استخدام إدارة المنصة وبأي مستوى. تسري التغييرات مع الإجراء التالي للشخص."],
  roles: ["Viewer reads everything here. Operator also runs routine work (queue, retry, cancel, request support). Administrator also changes tenants, plans, releases, operators and settings. Break-glass is administrator access that expires within eight hours and must be granted by someone else.",
    "المشاهد يقرأ كل شيء هنا. المشغّل يضيف العمل الروتيني (جدولة، إعادة محاولة، إلغاء، طلب دعم). المسؤول يضيف تعديل المستأجرين والخطط والإصدارات والمشغّلين والإعدادات. وصول الطوارئ صلاحية مسؤول تنتهي خلال ثماني ساعات ويمنحها شخص آخر."],
  add: ["Add operator", "إضافة مشغّل"], addTitle: ["Add an operator", "إضافة مشغّل"],
  addBody: ["The person must already have an account (invited through Supabase Auth). They must enroll an authenticator before they can use any page.",
    "يجب أن يكون للشخص حساب مسبقًا (بدعوة عبر Supabase Auth). يجب أن يُعدّ تطبيق مصادقة قبل استخدام أي صفحة."],
  added: ["Operator added.", "تمت إضافة المشغّل."],
  email: ["Email", "البريد الإلكتروني"], role: ["Role", "الدور"],
  expiresAt: ["Access ends (UTC)", "ينتهي الوصول (بالتوقيت العالمي)"],
  expiresHint: ["Required for break-glass (at most 8 hours from now); optional otherwise.", "مطلوب لوصول الطوارئ (٨ ساعات كحد أقصى)؛ اختياري لغيره."],
  mfa: ["Authenticator", "تطبيق المصادقة"], verified: ["Verified", "موثّق"], missing: ["Not enrolled", "غير مُعدّ"],
  status: ["Status", "الحالة"], lastSignIn: ["Last sign-in", "آخر تسجيل دخول"], usable: ["Counts as a usable administrator", "يُحتسب مسؤولًا فعّالًا"],
  changeRole: ["Change role", "تغيير الدور"], changeRoleTitle: ["Change this operator's role", "تغيير دور هذا المشغّل"],
  roleChanged: ["Role changed.", "تم تغيير الدور."],
  disable: ["Revoke access", "إلغاء الوصول"], disableTitle: ["Revoke this operator's access?", "إلغاء وصول هذا المشغّل؟"],
  disableBody: ["Access ends on their next action and their support access is ended. The last usable administrator cannot be revoked.",
    "ينتهي الوصول مع إجرائه التالي ويُنهى وصول الدعم الخاص به. لا يمكن إلغاء وصول آخر مسؤول فعّال."],
  disabled: ["Access revoked.", "تم إلغاء الوصول."],
  enable: ["Restore access", "استعادة الوصول"], enableTitle: ["Restore this operator's access?", "استعادة وصول هذا المشغّل؟"],
  enabled: ["Access restored.", "تمت استعادة الوصول."],
  actions: ["Actions", "الإجراءات"], you: ["(you)", "(أنت)"],
  expires: ["Ends", "ينتهي"],
} as const;

export const accountCopy = {
  title: ["Your account", "حسابك"],
  description: ["Your operator standing and second factor.", "صلاحيتك كمشغّل وعاملك الثاني."],
  email: ["Email", "البريد الإلكتروني"], role: ["Role", "الدور"], expires: ["Access ends", "ينتهي الوصول"],
  lastVerified: ["Last authenticator verification", "آخر تحقق بتطبيق المصادقة"],
  minutesAgo: ["{n} minutes ago", "قبل {n} دقيقة"],
  stepUp: ["High-impact actions need a verification within the last {n} minutes; you are asked for a code when needed.",
    "تتطلب الإجراءات عالية الأثر تحققًا خلال آخر {n} دقيقة؛ يُطلب منك رمز عند الحاجة."],
  verifyNow: ["Verify now", "تحقق الآن"], verifiedNow: ["Verified. High-impact actions are available for the next few minutes.", "تم التحقق. الإجراءات عالية الأثر متاحة للدقائق القادمة."],
  factors: ["Authenticators", "تطبيقات المصادقة"], factorName: ["Name", "الاسم"], factorStatus: ["Status", "الحالة"],
  factorCreated: ["Added", "أُضيف"], loading: ["Loading authenticators…", "جارٍ تحميل تطبيقات المصادقة…"],
  loadFailed: ["Authenticators could not be loaded.", "تعذّر تحميل تطبيقات المصادقة."],
  recoveryTitle: ["If you lose your authenticator", "إذا فقدت تطبيق المصادقة"],
  recovery: [
    "Platform Admin has no self-service recovery, on purpose. Ask another administrator to revoke your operator access, then ask the platform owner to remove your authenticator factor from the Supabase project (Authentication → Users). Sign in again, enroll a new authenticator, and ask an administrator to restore your access. Every step is recorded.",
    "لا تتيح إدارة المنصة استعادة ذاتية، عن قصد. اطلب من مسؤول آخر إلغاء وصولك، ثم اطلب من مالك المنصة إزالة عامل المصادقة من مشروع Supabase (Authentication ← Users). سجّل الدخول مجددًا، وأعدّ تطبيق مصادقة جديدًا، واطلب من مسؤول استعادة وصولك. تُسجَّل كل خطوة.",
  ],
} as const;

export const auditCopy = {
  title: ["Audit log", "سجل التدقيق"],
  description: ["Every operator action, including refused and failed attempts. Entries cannot be edited or deleted.",
    "كل إجراء للمشغّلين، بما فيه المحاولات المرفوضة والفاشلة. لا يمكن تعديل السجلات أو حذفها."],
  search: ["Search actor, action, tenant, target or reason", "ابحث بالمنفّذ أو الإجراء أو المستأجر أو الهدف أو السبب"],
  family: ["Area", "المجال"], outcome: ["Outcome", "النتيجة"], from: ["From (UTC date)", "من (تاريخ)"], to: ["To (UTC date)", "إلى (تاريخ)"],
  time: ["Time", "الوقت"], actor: ["Operator", "المشغّل"], action: ["Action", "الإجراء"], target: ["Target", "الهدف"],
  tenant: ["Tenant", "المستأجر"], reason: ["Reason", "السبب"], detail: ["Detail", "التفاصيل"],
  export: ["Export CSV", "تصدير CSV"], exportTitle: ["Export the filtered audit log?", "تصدير سجل التدقيق المصفّى؟"],
  exportBody: ["Exports up to 5,000 rows matching the current filters, with redacted detail. The export itself is recorded.",
    "يصدّر حتى ٥٬٠٠٠ صف مطابق لعوامل التصفية الحالية، بتفاصيل منقّحة. يُسجَّل التصدير نفسه."],
  exported: ["Export downloaded.", "تم تنزيل التصدير."],
  filteredTenant: ["Showing one tenant only.", "عرض مستأجر واحد فقط."],
} as const;

export const settingsCopy = {
  title: ["Settings", "الإعدادات"],
  description: ["Fleet-wide flags and banners, and the status of each provider integration.", "الإعدادات والتنبيهات على مستوى الأسطول، وحالة كل تكامل مع المزوّدين."],
  flags: ["Platform flags", "إعدادات المنصة"], key: ["Key", "المفتاح"], kind: ["Kind", "النوع"], enabled: ["On", "مفعّل"],
  messageEn: ["Message (English)", "الرسالة (بالإنجليزية)"], messageAr: ["Message (Arabic)", "الرسالة (بالعربية)"],
  startsAt: ["Starts (UTC)", "يبدأ (بالتوقيت العالمي)"], endsAt: ["Ends (UTC)", "ينتهي (بالتوقيت العالمي)"],
  updated: ["Last changed", "آخر تعديل"], updatedBy: ["Changed by", "عدّله"],
  kinds: { feature: ["Feature flag", "مفتاح ميزة"], incident_banner: ["Incident banner shown to tenants", "تنبيه حادث يظهر للمستأجرين"],
    maintenance_window: ["Maintenance window", "نافذة صيانة"], kill_switch: ["Emergency kill switch", "مفتاح إيقاف طارئ"] },
  newFlag: ["New flag", "إعداد جديد"], editFlag: ["Edit", "تعديل"], flagTitle: ["Platform flag", "إعداد المنصة"],
  flagBody: ["Incident banners are shown to every tenant's customers in both languages. Messages are required in both languages or neither.",
    "تظهر تنبيهات الحوادث لعملاء كل مستأجر باللغتين. الرسالة مطلوبة باللغتين أو لا شيء."],
  flagSaved: ["Flag saved.", "تم حفظ الإعداد."], noFlags: ["No platform flags are set.", "لا توجد إعدادات منصة."],
  integrations: ["Integrations", "التكاملات"],
  integrationsNote: ["Status comes only from what a worker reported. \"Configured\" means a worker reported its credentials are present; \"reachable\" means a connection check succeeded; \"verified\" means a real operation succeeded. Secrets are never shown or stored here — only the names of the environment variables that hold them.",
    "تأتي الحالة مما أبلغ به العامل فقط. «مهيأ» تعني أن العامل أبلغ بوجود بيانات الاعتماد؛ «يمكن الوصول إليه» تعني نجاح فحص الاتصال؛ «موثّق» تعني نجاح عملية فعلية. لا تُعرض الأسرار ولا تُخزّن هنا — فقط أسماء متغيرات البيئة التي تحملها."],
  provider: ["Provider", "المزوّد"], status: ["Status", "الحالة"], references: ["Secret references", "مراجع الأسرار"],
  lastCheck: ["Last connection check", "آخر فحص اتصال"], verifiedAt: ["Last verified operation", "آخر عملية موثّقة"],
  check: ["Queue connection check", "جدولة فحص الاتصال"],
  checkQueued: ["Check queued. It runs when the integration worker claims it.", "تمت جدولة الفحص. يُنفّذ عندما يستلمه عامل التكاملات."],
  checkPending: ["Check queued — waiting for the integration worker", "الفحص في الانتظار — بانتظار عامل التكاملات"],
  editReferences: ["Edit references", "تعديل المراجع"], referencesTitle: ["Secret references", "مراجع الأسرار"],
  referencesHint: ["Environment variable names, one per line, e.g. VERCEL_API_TOKEN. Never paste a secret value.",
    "أسماء متغيرات البيئة، اسم في كل سطر، مثل VERCEL_API_TOKEN. لا تلصق قيمة سرية أبدًا."],
  referencesSaved: ["References saved.", "تم حفظ المراجع."],
  remaining: ["To verify live: deploy the worker with these variables set, then queue a connection check.",
    "للتحقق الفعلي: انشر العامل مع ضبط هذه المتغيرات، ثم جدول فحص الاتصال."],
} as const;
```
Register in `copy.test.ts`: `import * as admin from "./admin-copy";`.

- [ ] **Step 3: Operators page**

`apps/platform-admin/app/[locale]/(console)/operators/page.tsx`:
```tsx
import { TextField } from "@wlbp/ui-foundation";
import { addOperatorAction, disableOperatorAction, enableOperatorAction, setOperatorRoleAction } from "../../../_lib/actions/operators";
import { operatorsCopy as c } from "../../../_lib/admin-copy";
import { copyFor, roleCopy, say, stateCopy } from "../../../_lib/copy";
import { callOperator } from "../../../_lib/operator-api";
import { atLeast, getOperator } from "../../../_lib/operator-page";
import { pageLocale } from "../../../_lib/page-locale";
import { PageHeader } from "../../../_lib/shell/page-header";
import { ActionDialog } from "../../../_lib/ui/action-dialog";
import { DataTable } from "../../../_lib/ui/data-table";
import { SelectField } from "../../../_lib/ui/select-field";
import { EmptyState, UnavailableState } from "../../../_lib/ui/states";
import { RoleBadge, StatusBadge } from "../../../_lib/ui/status-badge";
import { TimeValue } from "../../../_lib/ui/time";

export const dynamic = "force-dynamic";

const roles = ["viewer", "operator", "admin", "break_glass"] as const;

export default async function OperatorsPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await pageLocale(params);
  const operator = await getOperator(locale);
  if (!operator) return null;
  const result = await callOperator("list_operators_v1");
  const admin = atLeast(operator.role, "admin");
  const roleOptions = roles.map((r) => [r, copyFor(roleCopy, r, locale)] as const);
  const roleFields = (role?: string, expires?: string | null) => (
    <>
      <SelectField name="role" label={say(locale, c.role)} value={role ?? "viewer"} options={roleOptions} />
      <label className="field"><span>{say(locale, c.expiresAt)}</span>
        <input type="datetime-local" name="expiresAt" defaultValue={expires?.slice(0, 16)} />
        <small>{say(locale, c.expiresHint)}</small></label>
    </>
  );

  return (
    <>
      <PageHeader locale={locale} title={say(locale, c.title)} description={say(locale, c.description)}
        actions={admin ? (
          <ActionDialog locale={locale} action={addOperatorAction} trigger={say(locale, c.add)} triggerVariant="primary"
            title={say(locale, c.addTitle)} description={say(locale, c.addBody)} submit={say(locale, c.add)}
            successMessage={say(locale, c.added)} reason={{ minLength: 5 }}>
            <TextField id="op-email" name="email" type="email" label={say(locale, c.email)} required autoComplete="off" />
            {roleFields()}
          </ActionDialog>
        ) : null} />
      <p className="notice">{say(locale, c.roles)}</p>
      {!admin ? <p className="secondary">{say(locale, stateCopy.roleRequired)}</p> : null}
      {!result.ok ? <UnavailableState locale={locale} code={result.code} />
        : result.data.length === 0 ? <EmptyState locale={locale} />
        : (
          <DataTable id="operators-table" locale={locale} caption={say(locale, c.title)}
            columns={[{ label: say(locale, c.email) }, { label: say(locale, c.role) }, { label: say(locale, c.mfa) },
              { label: say(locale, c.status) }, { label: say(locale, c.expires) }, { label: say(locale, c.lastSignIn) },
              { label: say(locale, c.actions) }]}
            rows={result.data.map((row) => {
              const self = row.operator_id === operator.operatorId;
              const expired = row.expires_at !== null && new Date(row.expires_at).getTime() <= Date.now();
              const state = row.disabled_at ? "disabled" : expired ? "expired" : "active";
              return {
                key: row.operator_id,
                cells: [
                  <><bdi>{row.email}</bdi>{self ? <> {say(locale, c.you)}</> : null}
                    {row.usable_admin ? <span className="secondary">{say(locale, c.usable)}</span> : null}</>,
                  <RoleBadge key="r" locale={locale} role={row.role} />,
                  say(locale, row.mfa_verified ? c.verified : c.missing),
                  <StatusBadge key="s" locale={locale} status={state} />,
                  <TimeValue key="e" locale={locale} value={row.expires_at} empty="none" />,
                  <TimeValue key="l" locale={locale} value={row.last_sign_in_at} />,
                  admin ? (
                    <div key="a" className="page-actions">
                      <ActionDialog locale={locale} action={setOperatorRoleAction} trigger={say(locale, c.changeRole)} triggerVariant="quiet"
                        title={say(locale, c.changeRoleTitle)} submit={say(locale, c.changeRole)} successMessage={say(locale, c.roleChanged)}
                        reason={{ minLength: 5 }} hidden={{ operatorId: row.operator_id }}>
                        {roleFields(row.role, row.expires_at)}
                      </ActionDialog>
                      {row.disabled_at ? (
                        <ActionDialog locale={locale} action={enableOperatorAction} trigger={say(locale, c.enable)} triggerVariant="quiet"
                          title={say(locale, c.enableTitle)} submit={say(locale, c.enable)} successMessage={say(locale, c.enabled)}
                          reason={{ minLength: 5 }} hidden={{ operatorId: row.operator_id }} />
                      ) : (
                        <ActionDialog locale={locale} action={disableOperatorAction} trigger={say(locale, c.disable)} triggerVariant="quiet" danger
                          title={say(locale, c.disableTitle)} description={say(locale, c.disableBody)} submit={say(locale, c.disable)}
                          successMessage={say(locale, c.disabled)} reason={{ minLength: 5 }} hidden={{ operatorId: row.operator_id }} />
                      )}
                    </div>
                  ) : null,
                ],
              };
            })} />
        )}
    </>
  );
}
```

- [ ] **Step 4: Account page and authenticator list**

`apps/platform-admin/app/[locale]/(console)/account/factors.tsx`:
```tsx
"use client";

import { formatDateTime, type Locale } from "@wlbp/i18n";
import { StatusMessage } from "@wlbp/ui-foundation";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { accountCopy as c, operatorsCopy } from "../../../_lib/admin-copy";
import { say } from "../../../_lib/copy";
import { getPlatformAdminBrowserClient } from "../../../_lib/supabase-browser";
import { StepUpPrompt } from "../../../_lib/ui/step-up-prompt";

type Factor = { id: string; friendly_name?: string; status: string; created_at: string };

export function Factors({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    void getPlatformAdminBrowserClient().auth.mfa.listFactors().then(({ data, error }) => {
      if (error || !data) setFailed(true);
      else setFactors(data.totp as Factor[]);
    });
  }, []);

  return (
    <>
      {failed ? <p role="alert">{say(locale, c.loadFailed)}</p>
        : factors === null ? <p role="status">{say(locale, c.loading)}</p>
        : (
          <ul>
            {factors.map((f) => (
              <li key={f.id}>
                <bdi>{f.friendly_name ?? f.id.slice(0, 8)}</bdi> · {say(locale, f.status === "verified" ? operatorsCopy.verified : operatorsCopy.missing)} ·{" "}
                {say(locale, c.factorCreated)} {formatDateTime(f.created_at, locale, "UTC")}
              </li>
            ))}
          </ul>
        )}
      {verified ? <StatusMessage tone="positive">{say(locale, c.verifiedNow)}</StatusMessage> : null}
      {verifying ? (
        <StepUpPrompt locale={locale} onVerified={() => { setVerifying(false); setVerified(true); router.refresh(); }} />
      ) : (
        <button type="button" className="wlbp-button wlbp-button--secondary" onClick={() => { setVerified(false); setVerifying(true); }}>
          {say(locale, c.verifyNow)}
        </button>
      )}
    </>
  );
}
```

`apps/platform-admin/app/[locale]/(console)/account/page.tsx`:
```tsx
import { formatNumber } from "@wlbp/i18n";
import { accountCopy as c } from "../../../_lib/admin-copy";
import { fill, say } from "../../../_lib/copy";
import { callOperator } from "../../../_lib/operator-api";
import { getOperator } from "../../../_lib/operator-page";
import { pageLocale } from "../../../_lib/page-locale";
import { PageHeader } from "../../../_lib/shell/page-header";
import { Facts } from "../../../_lib/ui/facts";
import { Unknown, UnavailableState } from "../../../_lib/ui/states";
import { RoleBadge } from "../../../_lib/ui/status-badge";
import { TimeValue } from "../../../_lib/ui/time";
import { Factors } from "./factors";

export const dynamic = "force-dynamic";

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await pageLocale(params);
  const operator = await getOperator(locale);
  if (!operator) return null;
  const context = await callOperator("get_operator_context_v1");
  const row = context.ok ? context.data[0] : undefined;
  const age = row?.aal2_age_seconds;

  return (
    <>
      <PageHeader locale={locale} title={say(locale, c.title)} description={say(locale, c.description)} />
      {!context.ok ? <UnavailableState locale={locale} code={context.code} /> : (
        <section className="section" aria-labelledby="standing-title">
          <h2 id="standing-title" className="sr-only">{say(locale, c.title)}</h2>
          <Facts items={[
            [say(locale, c.email), <bdi key="e">{operator.email}</bdi>],
            [say(locale, c.role), <RoleBadge key="r" locale={locale} role={operator.role} />],
            [say(locale, c.expires), <TimeValue key="x" locale={locale} value={operator.expiresAt} empty="none" />],
            [say(locale, c.lastVerified), age === null || age === undefined
              ? <Unknown key="v" locale={locale} kind="unknown" />
              : fill(locale, c.minutesAgo, { n: formatNumber(Math.floor(age / 60), locale) })],
          ]} />
          <p className="secondary">{fill(locale, c.stepUp, { n: formatNumber(operator.stepUpSeconds / 60, locale) })}</p>
        </section>
      )}
      <section className="section" aria-labelledby="factors-title">
        <div className="section-header"><h2 id="factors-title">{say(locale, c.factors)}</h2></div>
        <Factors locale={locale} />
      </section>
      <section className="section" aria-labelledby="recovery-title">
        <div className="section-header"><h2 id="recovery-title">{say(locale, c.recoveryTitle)}</h2></div>
        <p>{say(locale, c.recovery)}</p>
      </section>
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
rtk git add apps/platform-admin/app/_lib/actions/operators.ts apps/platform-admin/app/_lib/admin-copy.ts \
  "apps/platform-admin/app/[locale]/(console)/operators" "apps/platform-admin/app/[locale]/(console)/account" \
  apps/platform-admin/app/_lib/copy.test.ts
rtk git commit -m "Let admins manage operators safely and operators manage their own verification"
```

### Task 20: Audit log and controlled export

**Files:**
- Create: `apps/platform-admin/app/_lib/audit-csv.ts`, `audit-csv.test.ts`
- Create: `apps/platform-admin/app/_lib/actions/audit.ts`
- Create: `apps/platform-admin/app/[locale]/(console)/audit/page.tsx`

The export is a server action, not a download route, so the step-up dialog can interrupt and resume it like any other high-impact action.

**Interfaces:**
- Produces: `toCsv(rows: readonly AuditRow[]): string`; `auditRange(from?: string, to?: string): { from?: string; to?: string }` (civil UTC dates → `[from 00:00Z, to+1 00:00Z)`); `exportAuditAction` (fields `q`, `family`, `outcome`, `tenant`, `from`, `to`) → `export_audit_events_v1` → success with `download`.

- [ ] **Step 1: Write the failing CSV test**

`apps/platform-admin/app/_lib/audit-csv.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { auditRange, toCsv } from "./audit-csv";

const row = {
  event_id: "e1", created_at: "2026-10-06T10:00:00Z", operator_id: "o1", operator_email: "ops@example.invalid",
  action: "tenant.suspended", outcome: "succeeded", tenant_id: "t1", tenant_name: 'North, "Main"',
  instance_id: null, target_kind: "tenant", target_id: "t1", reason: "=HYPERLINK(\"x\")", detail: { from: "active" },
};

describe("toCsv", () => {
  it("writes a header and quotes every field", () => {
    const [header, line] = toCsv([row]).trim().split("\r\n");
    expect(header).toBe('"time","operator","action","outcome","tenant","target_kind","target_id","reason","detail"');
    expect(line).toContain('"North, ""Main"""');
  });
  it("neutralises spreadsheet formulas", () => {
    expect(toCsv([row])).toContain(`"'=HYPERLINK(""x"")"`);
  });
});

describe("auditRange", () => {
  it("turns civil dates into a half-open UTC range", () => {
    expect(auditRange("2026-10-01", "2026-10-06")).toEqual({ from: "2026-10-01T00:00:00.000Z", to: "2026-10-07T00:00:00.000Z" });
    expect(auditRange(undefined, undefined)).toEqual({});
  });
});
```

Run: `rtk pnpm --filter @wlbp/platform-admin test:unit`
Expected: FAIL — cannot resolve `./audit-csv`.

- [ ] **Step 2: Implement**

`apps/platform-admin/app/_lib/audit-csv.ts`:
```ts
import type { AuditRow } from "./audit-copy";

function cell(value: unknown): string {
  let text = value === null || value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value);
  // A leading =, +, - or @ is executed as a formula by spreadsheet software.
  if (/^[=+\-@\t\r]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/gu, '""')}"`;
}

export function toCsv(rows: readonly AuditRow[]): string {
  const header = ["time", "operator", "action", "outcome", "tenant", "target_kind", "target_id", "reason", "detail"];
  const lines = rows.map((r) => [
    r.created_at, r.operator_email ?? r.operator_id, r.action, r.outcome, r.tenant_name ?? r.tenant_id,
    r.target_kind, r.target_id, r.reason, r.detail,
  ].map(cell).join(","));
  return [header.map(cell).join(","), ...lines].join("\r\n") + "\r\n";
}

export function auditRange(from?: string, to?: string): { from?: string; to?: string } {
  const range: { from?: string; to?: string } = {};
  if (from) range.from = new Date(`${from}T00:00:00Z`).toISOString();
  if (to) {
    const end = new Date(`${to}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    range.to = end.toISOString();
  }
  return range;
}
```

`apps/platform-admin/app/_lib/actions/audit.ts`:
```ts
"use server";

import { auditRange, toCsv } from "../audit-csv";
import type { AuditRow } from "../audit-copy";
import { optional, uuid } from "../form-data";
import { runOperatorAction, type ActionResult } from "../operator-action";

const dates = /^\d{4}-\d{2}-\d{2}$/u;

export async function exportAuditAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const from = optional(form, "from");
  const to = optional(form, "to");
  const range = auditRange(from && dates.test(from) ? from : undefined, to && dates.test(to) ? to : undefined);
  const { result, data } = await runOperatorAction({
    action: "audit.export", fn: "export_audit_events_v1",
    args: {
      p_search: optional(form, "q"), p_action: optional(form, "family"), p_tenant_id: uuid(form, "tenant"),
      p_outcome: optional(form, "outcome"), p_from: range.from, p_to: range.to,
    },
    targetKind: "audit",
  });
  if (result.kind !== "success") return result;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/gu, "-");
  return { ...result, download: { filename: `audit-${stamp}.csv`, body: toCsv((data ?? []) as unknown as AuditRow[]) } };
}
```

Run: `rtk pnpm --filter @wlbp/platform-admin test:unit`
Expected: PASS.

- [ ] **Step 3: Audit page**

`apps/platform-admin/app/[locale]/(console)/audit/page.tsx`:
```tsx
import Link from "next/link";
import { exportAuditAction } from "../../../_lib/actions/audit";
import { auditCopy as c } from "../../../_lib/admin-copy";
import { auditActionCopy, auditFamilies, outcomeCopy, type AuditRow } from "../../../_lib/audit-copy";
import { auditRange } from "../../../_lib/audit-csv";
import { copyFor, formCopy, say } from "../../../_lib/copy";
import { listHref, parseListParams } from "../../../_lib/list-params";
import { callOperator } from "../../../_lib/operator-api";
import { atLeast, getOperator } from "../../../_lib/operator-page";
import { pageLocale } from "../../../_lib/page-locale";
import { PageHeader } from "../../../_lib/shell/page-header";
import { ActionDialog } from "../../../_lib/ui/action-dialog";
import { DetailSummary } from "../../../_lib/ui/audit-list";
import { DataTable } from "../../../_lib/ui/data-table";
import { FilterBar, SelectFilter } from "../../../_lib/ui/filter-bar";
import { Pagination } from "../../../_lib/ui/pagination";
import { EmptyState, Unknown, UnavailableState } from "../../../_lib/ui/states";
import { StatusBadge } from "../../../_lib/ui/status-badge";
import { TimeValue } from "../../../_lib/ui/time";

export const dynamic = "force-dynamic";

const families = Object.keys(auditFamilies) as (keyof typeof auditFamilies)[];
const outcomes = ["succeeded", "failed", "denied"] as const;
const spec = {
  filters: { family: families, outcome: outcomes, tenant: "uuid", from: "date", to: "date" },
  pageSize: 50,
} as const;

export default async function AuditPage({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await pageLocale(params);
  const operator = await getOperator(locale);
  if (!operator) return null;
  const list = parseListParams(await searchParams, spec);
  const path = `/${locale}/audit`;
  const range = auditRange(list.filters.from, list.filters.to);
  const result = await callOperator("list_audit_events_v1", {
    p_search: list.q || undefined, p_action: list.filters.family, p_tenant_id: list.filters.tenant,
    p_outcome: list.filters.outcome, p_from: range.from, p_to: range.to, p_limit: list.pageSize, p_offset: list.offset,
  });
  const exportFields = { q: list.q, ...list.filters };

  return (
    <>
      <PageHeader locale={locale} title={say(locale, c.title)} description={say(locale, c.description)}
        actions={atLeast(operator.role, "admin") ? (
          <ActionDialog locale={locale} action={exportAuditAction} trigger={say(locale, c.export)}
            title={say(locale, c.exportTitle)} description={say(locale, c.exportBody)} submit={say(locale, c.export)}
            successMessage={say(locale, c.exported)}
            hidden={Object.fromEntries(Object.entries(exportFields).filter(([, v]) => v))} />
        ) : null} />
      {list.filters.tenant ? <p className="notice">{say(locale, c.filteredTenant)} <Link href={listHref(path, list, { filters: { tenant: "" } })}>{say(locale, formCopy.clear)}</Link></p> : null}
      <FilterBar locale={locale} path={path} search={{ label: say(locale, c.search), value: list.q }}>
        <SelectFilter name="family" label={say(locale, c.family)} value={list.filters.family} allLabel={say(locale, formCopy.all)}
          options={families.map((f) => [f, say(locale, auditFamilies[f])] as const)} />
        <SelectFilter name="outcome" label={say(locale, c.outcome)} value={list.filters.outcome} allLabel={say(locale, formCopy.all)}
          options={outcomes.map((o) => [o, say(locale, outcomeCopy[o])] as const)} />
        <label>{say(locale, c.from)}<input type="date" name="from" defaultValue={list.filters.from} /></label>
        <label>{say(locale, c.to)}<input type="date" name="to" defaultValue={list.filters.to} /></label>
        {list.filters.tenant ? <input type="hidden" name="tenant" value={list.filters.tenant} /> : null}
      </FilterBar>
      {!result.ok ? <UnavailableState locale={locale} code={result.code} />
        : result.data.length === 0 ? <EmptyState locale={locale} filtered={Boolean(list.q || Object.keys(list.filters).length)} />
        : (
          <>
            <DataTable id="audit-table" locale={locale} caption={say(locale, c.title)}
              columns={[{ label: say(locale, c.time) }, { label: say(locale, c.actor) }, { label: say(locale, c.action) },
                { label: say(locale, c.outcome) }, { label: say(locale, c.target) }, { label: say(locale, c.tenant) },
                { label: say(locale, c.reason) }, { label: say(locale, c.detail) }]}
              rows={(result.data as unknown as AuditRow[]).map((row) => ({
                key: row.event_id,
                cells: [
                  <TimeValue key="t" locale={locale} value={row.created_at} />,
                  <bdi key="a">{row.operator_email ?? row.operator_id}</bdi>,
                  <>{copyFor(auditActionCopy, row.action, locale)}<span className="secondary"><bdi>{row.action}</bdi></span></>,
                  <StatusBadge key="o" locale={locale} status={row.outcome} />,
                  row.target_kind ? <bdi key="g">{row.target_kind}{row.target_id ? ` · ${row.target_id}` : ""}</bdi> : <Unknown key="g" locale={locale} kind="none" />,
                  row.tenant_id ? <Link key="n" href={`/${locale}/tenants/${row.tenant_id}`}><bdi>{row.tenant_name ?? row.tenant_id}</bdi></Link> : <Unknown key="n" locale={locale} kind="none" />,
                  row.reason ?? <Unknown key="r" locale={locale} kind="none" />,
                  <DetailSummary key="d" detail={row.detail} />,
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
`StatusBadge` maps `succeeded`/`failed`/`denied` through `statusCopy`, which already has all three.

- [ ] **Step 4: Verify and commit**

Run:
```bash
rtk pnpm --filter @wlbp/platform-admin test:unit
rtk pnpm --filter @wlbp/platform-admin typecheck
rtk pnpm exec eslint apps/platform-admin --max-warnings=0
```
Expected: pass.
```bash
rtk git add apps/platform-admin/app/_lib/audit-csv.ts apps/platform-admin/app/_lib/audit-csv.test.ts \
  apps/platform-admin/app/_lib/actions/audit.ts "apps/platform-admin/app/[locale]/(console)/audit"
rtk git commit -m "Make the operator audit log searchable and exportable under step-up"
```

### Task 21: Platform settings and integrations

**Files:**
- Create: `apps/platform-admin/app/_lib/actions/settings.ts`
- Create: `apps/platform-admin/app/[locale]/(console)/settings/page.tsx`

**Interfaces:**
- Produces: `saveFlagAction` (`key`, `kind`, `enabled` checkbox, `messageEn`, `messageAr`, `startsAt`, `endsAt`, `reason`) → `save_platform_flag_v1`; `saveReferencesAction` (`provider`, `references` lines) → `save_integration_references_v1`; `requestIntegrationCheckAction` (`provider`) → `request_integration_check_v1`.

- [ ] **Step 1: Settings actions**

`apps/platform-admin/app/_lib/actions/settings.ts`:
```ts
"use server";

import { instant, lines, optional, text } from "../form-data";
import { runOperatorAction, type ActionResult } from "../operator-action";

const providers = new Set(["github", "vercel", "resend", "stripe", "supabase"]);

export async function saveFlagAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const key = text(form, "key").toLowerCase();
  return (await runOperatorAction({
    action: "platform_flag.save", fn: "save_platform_flag_v1",
    args: {
      p_key: key, p_kind: text(form, "kind"), p_enabled: form.get("enabled") === "on",
      p_message_en: optional(form, "messageEn"), p_message_ar: optional(form, "messageAr"),
      p_starts_at: instant(form, "startsAt"), p_ends_at: instant(form, "endsAt"), p_reason: text(form, "reason"),
    },
    targetKind: "platform_flag", targetId: /^[a-z][a-z0-9_.]{1,60}$/u.test(key) ? key : undefined,
  })).result;
}

export async function saveReferencesAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const provider = text(form, "provider");
  if (!providers.has(provider)) return { kind: "error", code: "not_found" };
  return (await runOperatorAction({
    action: "integration.save_references", fn: "save_integration_references_v1",
    // Names only, upper-cased; the database refuses anything secret-shaped.
    args: { p_provider: provider, p_secret_references: lines(form, "references").map((r) => r.toUpperCase()) },
    targetKind: "integration", targetId: provider,
  })).result;
}

export async function requestIntegrationCheckAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const provider = text(form, "provider");
  if (!providers.has(provider)) return { kind: "error", code: "not_found" };
  return (await runOperatorAction({
    action: "integration.request_check", fn: "request_integration_check_v1", args: { p_provider: provider },
    targetKind: "integration", targetId: provider,
  })).result;
}
```

- [ ] **Step 2: Settings page**

`apps/platform-admin/app/[locale]/(console)/settings/page.tsx`:
```tsx
import type { Locale } from "@wlbp/i18n";
import { TextField } from "@wlbp/ui-foundation";
import Link from "next/link";
import { requestIntegrationCheckAction, saveFlagAction, saveReferencesAction } from "../../../_lib/actions/settings";
import { settingsCopy as c } from "../../../_lib/admin-copy";
import { say, stateCopy } from "../../../_lib/copy";
import { callOperator, type RpcRow } from "../../../_lib/operator-api";
import { atLeast, getOperator } from "../../../_lib/operator-page";
import { pageLocale } from "../../../_lib/page-locale";
import { PageHeader } from "../../../_lib/shell/page-header";
import { ActionDialog } from "../../../_lib/ui/action-dialog";
import { DataTable } from "../../../_lib/ui/data-table";
import { OperatorForm } from "../../../_lib/ui/operator-form";
import { SelectField } from "../../../_lib/ui/select-field";
import { EmptyState, Unknown, UnavailableState } from "../../../_lib/ui/states";
import { StatusBadge } from "../../../_lib/ui/status-badge";
import { TimeValue } from "../../../_lib/ui/time";

export const dynamic = "force-dynamic";

type Flag = RpcRow<"list_platform_flags_v1">;
const kinds = ["feature", "incident_banner", "maintenance_window", "kill_switch"] as const;

function FlagFields({ locale, flag }: { locale: Locale; flag?: Flag }) {
  return (
    <>
      {flag ? <input type="hidden" name="key" value={flag.key} />
        : <TextField id="flag-key" name="key" label={say(locale, c.key)} required maxLength={61} autoComplete="off" />}
      <SelectField name="kind" label={say(locale, c.kind)} value={flag?.kind ?? "incident_banner"}
        options={kinds.map((k) => [k, say(locale, c.kinds[k])] as const)} />
      <label className="checkbox"><input type="checkbox" name="enabled" defaultChecked={flag?.enabled ?? false} /> {say(locale, c.enabled)}</label>
      <label className="field"><span>{say(locale, c.messageEn)}</span>
        <textarea name="messageEn" lang="en" dir="ltr" maxLength={500} defaultValue={flag?.message_en ?? ""} /></label>
      <label className="field"><span>{say(locale, c.messageAr)}</span>
        <textarea name="messageAr" lang="ar" dir="rtl" maxLength={500} defaultValue={flag?.message_ar ?? ""} /></label>
      <div className="form-grid">
        <label className="field"><span>{say(locale, c.startsAt)}</span>
          <input type="datetime-local" name="startsAt" defaultValue={flag?.starts_at?.slice(0, 16)} /></label>
        <label className="field"><span>{say(locale, c.endsAt)}</span>
          <input type="datetime-local" name="endsAt" defaultValue={flag?.ends_at?.slice(0, 16)} /></label>
      </div>
    </>
  );
}

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await pageLocale(params);
  const operator = await getOperator(locale);
  if (!operator) return null;
  const [flags, integrations] = await Promise.all([callOperator("list_platform_flags_v1"), callOperator("list_integrations_v1")]);
  const admin = atLeast(operator.role, "admin");
  const canQueue = atLeast(operator.role, "operator");

  return (
    <>
      <PageHeader locale={locale} title={say(locale, c.title)} description={say(locale, c.description)} />
      {!admin ? <p className="notice">{say(locale, stateCopy.roleRequired)}</p> : null}

      <section className="section" aria-labelledby="flags-title">
        <div className="section-header">
          <h2 id="flags-title">{say(locale, c.flags)}</h2>
          {admin ? (
            <ActionDialog locale={locale} action={saveFlagAction} trigger={say(locale, c.newFlag)} title={say(locale, c.flagTitle)}
              description={say(locale, c.flagBody)} submit={say(locale, c.newFlag)} successMessage={say(locale, c.flagSaved)} reason={{ minLength: 5 }}>
              <FlagFields locale={locale} />
            </ActionDialog>
          ) : null}
        </div>
        {!flags.ok ? <UnavailableState locale={locale} code={flags.code} />
          : flags.data.length === 0 ? <EmptyState locale={locale} title={say(locale, c.noFlags)} />
          : (
            <DataTable id="flags-table" locale={locale} caption={say(locale, c.flags)}
              columns={[{ label: say(locale, c.key) }, { label: say(locale, c.kind) }, { label: say(locale, c.enabled) },
                { label: say(locale, c.messageEn) }, { label: say(locale, c.endsAt) }, { label: say(locale, c.updatedBy) }, { label: "" }]}
              rows={flags.data.map((flag) => ({
                key: flag.key,
                cells: [
                  <bdi key="k">{flag.key}</bdi>,
                  say(locale, c.kinds[flag.kind as keyof typeof c.kinds] ?? c.kinds.feature),
                  say(locale, flag.enabled ? stateCopy.yes : stateCopy.no),
                  flag.message_en ? <><span lang="en" dir="ltr">{flag.message_en}</span><span className="secondary" lang="ar" dir="rtl">{flag.message_ar}</span></> : <Unknown locale={locale} kind="none" />,
                  <TimeValue key="e" locale={locale} value={flag.ends_at} empty="none" />,
                  <><bdi>{flag.updated_by_email ?? "—"}</bdi> <TimeValue locale={locale} value={flag.updated_at} /></>,
                  admin ? (
                    <ActionDialog key="x" locale={locale} action={saveFlagAction} trigger={say(locale, c.editFlag)} triggerVariant="quiet"
                      title={say(locale, c.flagTitle)} description={say(locale, c.flagBody)} submit={say(locale, c.editFlag)}
                      successMessage={say(locale, c.flagSaved)} reason={{ minLength: 5 }}>
                      <FlagFields locale={locale} flag={flag} />
                    </ActionDialog>
                  ) : null,
                ],
              }))} />
          )}
      </section>

      <section className="section" aria-labelledby="integrations-title">
        <div className="section-header"><h2 id="integrations-title">{say(locale, c.integrations)}</h2></div>
        <p className="notice">{say(locale, c.integrationsNote)}</p>
        {!integrations.ok ? <UnavailableState locale={locale} code={integrations.code} /> : (
          <DataTable id="integrations-table" locale={locale} caption={say(locale, c.integrations)}
            columns={[{ label: say(locale, c.provider) }, { label: say(locale, c.status) }, { label: say(locale, c.references) },
              { label: say(locale, c.lastCheck) }, { label: say(locale, c.verifiedAt) }, { label: "" }]}
            rows={integrations.data.map((i) => ({
              key: i.provider,
              cells: [
                <bdi key="p">{i.provider}</bdi>,
                <>
                  <StatusBadge locale={locale} status={i.status} />
                  {i.status !== "verified" ? <span className="secondary">{say(locale, c.remaining)}</span> : null}
                </>,
                <bdi key="r">{i.secret_references.join(", ") || say(locale, stateCopy.none)}</bdi>,
                i.last_check_at
                  ? <><TimeValue locale={locale} value={i.last_check_at} /> <bdi>{i.last_check_outcome}{i.last_check_error_code ? ` · ${i.last_check_error_code}` : ""}</bdi></>
                  : <Unknown locale={locale} kind="never" />,
                <TimeValue key="v" locale={locale} value={i.verified_at} />,
                <div key="a" className="page-actions">
                  {i.pending_check_job_id
                    ? <Link href={`/${locale}/jobs/${i.pending_check_job_id}`}>{say(locale, c.checkPending)}</Link>
                    : canQueue ? (
                      <OperatorForm locale={locale} action={requestIntegrationCheckAction} submit={say(locale, c.check)}
                        successMessage={say(locale, c.checkQueued)} className="inline-form">
                        <input type="hidden" name="provider" value={i.provider} />
                      </OperatorForm>
                    ) : null}
                  {admin ? (
                    <ActionDialog locale={locale} action={saveReferencesAction} trigger={say(locale, c.editReferences)} triggerVariant="quiet"
                      title={say(locale, c.referencesTitle)} submit={say(locale, c.editReferences)} successMessage={say(locale, c.referencesSaved)}
                      hidden={{ provider: i.provider }}>
                      <label className="field"><span>{say(locale, c.references)}</span>
                        <textarea name="references" dir="ltr" rows={5} defaultValue={i.secret_references.join("\n")} />
                        <small>{say(locale, c.referencesHint)}</small></label>
                    </ActionDialog>
                  ) : null}
                </div>,
              ],
            }))} />
        )}
      </section>
    </>
  );
}
```
The status column never claims more than the stored evidence supports: `not_configured` / `configured` / `reachable` / `verified` / `failing` come from `list_integrations_v1`, and the "To verify live…" line names the remaining configuration whenever an integration is not verified.

- [ ] **Step 3: Full app verification and commit**

Run:
```bash
rtk pnpm --filter @wlbp/platform-admin test:unit
rtk pnpm --filter @wlbp/platform-admin typecheck
rtk pnpm exec eslint apps/platform-admin --max-warnings=0
rtk pnpm --filter @wlbp/platform-admin build
rtk pnpm check:boundaries
```
Expected: all pass. The build route list contains every route in the master plan's §2 route map.
```bash
rtk git add apps/platform-admin/app/_lib/actions/settings.ts "apps/platform-admin/app/[locale]/(console)/settings"
rtk git commit -m "Expose platform flags and honest integration status to operators"
```
