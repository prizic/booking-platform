import type { Copy } from "./copy";

export type AuditRow = {
  event_id: string;
  created_at: string;
  operator_id: string;
  operator_email: string | null;
  action: string;
  outcome: string;
  tenant_id: string | null;
  tenant_name: string | null;
  instance_id: string | null;
  target_kind: string | null;
  target_id: string | null;
  reason: string | null;
  detail: Record<string, unknown>;
};

export const outcomeCopy = {
  succeeded: ["Succeeded", "نجح"],
  failed: ["Failed", "فشل"],
  denied: ["Denied", "مرفوض"],
} as const satisfies Record<string, Copy>;

/** Action families for filtering; prefixes of the action code. */
export const auditFamilies = {
  tenant: ["Tenants", "المستأجرون"],
  subscription: ["Subscriptions", "الاشتراكات"],
  plan: ["Plans", "الخطط"],
  entitlement: ["Entitlements", "الميزات"],
  job: ["Jobs", "المهام"],
  provisioning: ["Provisioning", "التهيئة"],
  domain: ["Domains", "النطاقات"],
  release: ["Releases", "الإصدارات"],
  rollout: ["Rollouts", "عمليات النشر"],
  support: ["Support access", "وصول الدعم"],
  operator: ["Operators", "المشغّلون"],
  platform_flag: ["Platform flags", "إعدادات المنصة"],
  integration: ["Integrations", "التكاملات"],
  audit: ["Audit exports", "تصدير السجل"],
} as const satisfies Record<string, Copy>;

export const auditActionCopy: Record<string, Copy> = {
  // Failed attempts retain the requested operation, before a past-tense event exists.
  "tenant.create": ["Register a tenant", "تسجيل مستأجر"],
  "tenant.rename": ["Rename a tenant", "إعادة تسمية مستأجر"],
  "tenant.suspend": ["Suspend a tenant", "تعليق مستأجر"],
  "tenant.reactivate": ["Reactivate a tenant", "إعادة تفعيل مستأجر"],
  "tenant.request_closure": ["Request tenant closure", "طلب إغلاق مستأجر"],
  "plan.create": ["Create a plan", "إنشاء خطة"],
  "plan.update": ["Change a plan", "تعديل خطة"],
  "subscription.assign": ["Assign a subscription plan", "تعيين خطة اشتراك"],
  "subscription.update": ["Change a subscription", "تعديل اشتراك"],
  "entitlement.override": ["Override a feature", "تجاوز إعداد ميزة"],
  "entitlement.clear_override": ["Clear a feature override", "إلغاء تجاوز ميزة"],
  "job.approve": ["Approve a job", "الموافقة على مهمة"],
  "job.cancel": ["Cancel a job", "إلغاء مهمة"],
  "job.retry": ["Retry a job", "إعادة محاولة مهمة"],
  "provisioning.request": ["Request provisioning", "طلب التهيئة"],
  "provisioning.retry": ["Retry provisioning", "إعادة محاولة التهيئة"],
  "provisioning.activate": ["Activate an instance", "تفعيل نسخة"],
  "provisioning.deactivate": ["Deactivate an instance", "تعطيل نسخة"],
  "domain.add": ["Add a domain", "إضافة نطاق"],
  "domain.request_verification": ["Request domain verification", "طلب التحقق من نطاق"],
  "release.register": ["Register a release", "تسجيل إصدار"],
  "release.set_status": ["Change release availability", "تغيير إتاحة إصدار"],
  "rollout.create": ["Create a rollout", "إنشاء عملية نشر"],
  "rollout.start": ["Start a rollout", "بدء عملية نشر"],
  "rollout.pause": ["Pause a rollout", "إيقاف عملية نشر مؤقتًا"],
  "rollout.cancel": ["Cancel a rollout", "إلغاء عملية نشر"],
  "rollout.retry": ["Retry rollout targets", "إعادة محاولة أهداف النشر"],
  "rollout.rollback": ["Roll back a rollout", "التراجع عن عملية نشر"],
  "support.request": ["Request support access", "طلب وصول الدعم"],
  "support.approve": ["Approve support access", "الموافقة على وصول الدعم"],
  "support.revoke": ["End support access", "إنهاء وصول الدعم"],
  "operator.add": ["Add an operator", "إضافة مشغّل"],
  "operator.change_role": ["Change an operator's role", "تغيير دور مشغّل"],
  "operator.disable": ["Disable an operator", "تعطيل مشغّل"],
  "operator.enable": ["Re-enable an operator", "إعادة تفعيل مشغّل"],
  "integration.save_references": ["Change secret references", "تعديل مراجع الأسرار"],
  "integration.request_check": ["Request an integration check", "طلب فحص تكامل"],
  "platform_flag.save": ["Change a platform flag", "تعديل إعداد منصة"],
  "audit.export": ["Export the audit log", "تصدير سجل التدقيق"],
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
  "rollout.rollback_requested": [
    "Requested rollout rollback",
    "طلب التراجع عن عملية نشر",
  ],
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
