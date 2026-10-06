import type { Locale } from "@wlbp/i18n";

/** English and Arabic, always together. A missing language is a type error. */
export type Copy = readonly [en: string, ar: string];

export function say(locale: Locale, copy: Copy): string {
  return locale === "ar" ? copy[1] : copy[0];
}

export function fill(
  locale: Locale,
  copy: Copy,
  values: Record<string, string>,
): string {
  return say(locale, copy).replace(
    /\{(\w+)\}/gu,
    (_, key: string) => values[key] ?? "",
  );
}

const unknownStatus: Copy = ["Unknown status", "حالة غير معروفة"];

export function copyFor(
  map: Record<string, Copy>,
  key: string | null | undefined,
  locale: Locale,
): string {
  return say(locale, (key && map[key]) || unknownStatus);
}

const arabicScript = /[؀-ۿ]/u;

/** Throws on the first entry that is not a complete [en, ar] pair. */
export function assertCopyTree(tree: unknown, path: string): void {
  if (Array.isArray(tree)) {
    const [en, ar] = tree as unknown[];
    if (
      tree.length !== 2 ||
      typeof en !== "string" ||
      typeof ar !== "string" ||
      !en.trim() ||
      !arabicScript.test(ar)
    ) {
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
  signedInAs: [
    "Signed in as {email} · {role}",
    "تم تسجيل الدخول باسم {email} · {role}",
  ],
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
  emptyFiltered: [
    "No records match these filters.",
    "لا توجد سجلات تطابق عوامل التصفية هذه.",
  ],
  unavailableTitle: [
    "This information could not be loaded",
    "تعذّر تحميل هذه المعلومات",
  ],
  unavailableBody: [
    "Nothing is shown in its place. Try again; if it keeps failing, check the database connection.",
    "لا يُعرض أي بديل عنها. حاول مرة أخرى، وإذا استمر الخطأ فتحقق من اتصال قاعدة البيانات.",
  ],
  deniedTitle: [
    "You do not have access to the control plane",
    "ليست لديك صلاحية الوصول إلى لوحة التحكم",
  ],
  deniedBody: [
    "Your account is not an active operator, or your operator access has expired. Ask a platform administrator.",
    "حسابك ليس مشغّلًا نشطًا، أو انتهت صلاحية وصولك. تواصل مع مسؤول المنصة.",
  ],
  configurationTitle: ["Platform Admin is not configured", "لم تتم تهيئة إدارة المنصة"],
  configurationBody: [
    "The database address and publishable key are missing from this environment.",
    "عنوان قاعدة البيانات والمفتاح العام غير موجودين في هذه البيئة.",
  ],
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
  roleRequired: [
    "Your role can view this but not change it. Ask an administrator.",
    "يمكن لدورك عرض هذا دون تعديله. تواصل مع مسؤول.",
  ],
  loading: ["Loading…", "جارٍ التحميل…"],
  waitingForWorker: [
    "Queued — waiting for the {worker} worker to claim it. Nothing has run yet.",
    "في قائمة الانتظار — بانتظار أن يستلمها عامل {worker}. لم يُنفّذ شيء بعد.",
  ],
} as const satisfies Record<string, unknown>;

export const formCopy = {
  dismissMessage: ["Dismiss message", "إخفاء الرسالة"],
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
  reasonHint: [
    "Recorded in the audit log. At least {n} characters.",
    "يُسجَّل في سجل التدقيق. {n} أحرف على الأقل.",
  ],
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
  stepUpBody: [
    "This action needs a fresh verification. Enter the 6-digit code from your authenticator app; the action then continues.",
    "يتطلب هذا الإجراء تحققًا جديدًا. أدخل الرمز المكوّن من ٦ أرقام من تطبيق المصادقة، ثم يتابع الإجراء.",
  ],
  stepUpCode: ["6-digit code", "رمز من ٦ أرقام"],
  stepUpSubmit: ["Verify and continue", "تحقق وتابع"],
  stepUpInvalid: [
    "That code was not accepted. Wait for a new code and try again.",
    "لم يُقبل هذا الرمز. انتظر رمزًا جديدًا وحاول مرة أخرى.",
  ],
  stepUpNoFactor: [
    "No verified authenticator is enrolled on this account.",
    "لا يوجد تطبيق مصادقة موثّق على هذا الحساب.",
  ],
} as const satisfies Record<string, unknown>;

export const errorCopy: Record<string, Copy> = {
  policy_denied: [
    "Your role does not allow this action, or your session is no longer verified.",
    "دورك لا يسمح بهذا الإجراء، أو لم تعد جلستك موثّقة.",
  ],
  recent_authentication_required: [
    "This action needs a fresh verification.",
    "يتطلب هذا الإجراء تحققًا جديدًا.",
  ],
  not_found: ["That record no longer exists.", "هذا السجل لم يعد موجودًا."],
  stale_revision: [
    "Someone changed this record since you opened it. Reload and try again.",
    "غيّر شخص آخر هذا السجل منذ فتحه. أعد التحميل وحاول مرة أخرى.",
  ],
  reason_required: [
    "Give a reason that a reviewer can understand.",
    "اكتب سببًا يمكن للمراجع فهمه.",
  ],
  name_invalid: [
    "Enter a name of 1 to 160 characters.",
    "أدخل اسمًا من ١ إلى ١٦٠ حرفًا.",
  ],
  tenant_name_invalid: [
    "Enter a tenant name of 1 to 160 characters.",
    "أدخل اسم مستأجر من ١ إلى ١٦٠ حرفًا.",
  ],
  brand_key_invalid: [
    "Use lowercase letters, digits and single hyphens, e.g. north-clinic.",
    "استخدم أحرفًا صغيرة وأرقامًا وشرطات مفردة، مثل north-clinic.",
  ],
  confirmation_mismatch: [
    "The confirmation text does not match.",
    "نص التأكيد غير مطابق.",
  ],
  suspend_before_closure: [
    "Suspend the tenant before requesting closure.",
    "علّق المستأجر قبل طلب الإغلاق.",
  ],
  transition_not_allowed: [
    "That change is not allowed from the record's current state.",
    "هذا التغيير غير مسموح من الحالة الحالية للسجل.",
  ],
  job_running: [
    "A worker is running this job. Wait for it to finish.",
    "يعمل أحد العمّال على هذه المهمة. انتظر حتى تنتهي.",
  ],
  attempts_exhausted: [
    "This job has used all its attempts. Investigate before queuing it again.",
    "استنفدت هذه المهمة كل محاولاتها. تحقّق قبل إعادة جدولتها.",
  ],
  plan_exists: [
    "A plan with this key already exists.",
    "توجد خطة بهذا المفتاح بالفعل.",
  ],
  plan_invalid: [
    "Use a lowercase key of 2 to 41 characters.",
    "استخدم مفتاحًا بأحرف صغيرة من ٢ إلى ٤١ حرفًا.",
  ],
  plan_unknown: [
    "That plan does not exist or is inactive.",
    "هذه الخطة غير موجودة أو غير نشطة.",
  ],
  entitlement_invalid: [
    "Feature keys use lowercase letters, digits, dots and underscores.",
    "مفاتيح الميزات تستخدم أحرفًا صغيرة وأرقامًا ونقاطًا وشرطات سفلية.",
  ],
  ends_at_required: [
    "Choose an end date for this status.",
    "اختر تاريخ انتهاء لهذه الحالة.",
  ],
  expiry_invalid: [
    "Choose an expiry in the future within the allowed limit.",
    "اختر تاريخ انتهاء مستقبليًا ضمن الحد المسموح.",
  ],
  release_exists: ["That version is already registered.", "هذا الإصدار مسجّل بالفعل."],
  release_invalid: [
    "Check the version, commit, contract range and notes.",
    "تحقّق من رقم الإصدار والالتزام ونطاق العقد والملاحظات.",
  ],
  no_targets: [
    "No active instance matches this targeting.",
    "لا توجد نسخة نشطة تطابق هذا الاستهداف.",
  ],
  rollback_not_supported: [
    "This release was registered as irreversible. Ship a forward fix instead.",
    "سُجّل هذا الإصدار كغير قابل للتراجع. انشر إصلاحًا لاحقًا بدلًا من ذلك.",
  ],
  account_not_found: [
    "No account uses that email. The person must sign up or be invited first.",
    "لا يوجد حساب بهذا البريد. يجب أن يسجّل الشخص أو يُدعى أولًا.",
  ],
  operator_exists: ["That account is already an operator.", "هذا الحساب مشغّل بالفعل."],
  last_admin_protected: [
    "This would leave no administrator with verified MFA. Add another administrator first.",
    "سيؤدي هذا إلى عدم وجود مسؤول بمصادقة موثّقة. أضف مسؤولًا آخر أولًا.",
  ],
  self_grant_denied: [
    "You cannot grant break-glass access to yourself.",
    "لا يمكنك منح نفسك وصول الطوارئ.",
  ],
  second_operator_required: [
    "A different administrator must approve this.",
    "يجب أن يوافق مسؤول آخر على هذا.",
  ],
  self_approval_denied: [
    "You cannot approve your own request.",
    "لا يمكنك الموافقة على طلبك.",
  ],
  hostname_invalid: [
    "Enter a valid hostname such as book.example.com.",
    "أدخل اسم نطاق صالحًا مثل book.example.com.",
  ],
  domain_taken: ["That hostname is already in use.", "اسم النطاق هذا مستخدم بالفعل."],
  flag_invalid: [
    "Check the key, both messages and the time window.",
    "تحقّق من المفتاح والرسالتين والفترة الزمنية.",
  ],
  reference_invalid: [
    "Secret references are environment variable names such as GITHUB_APP_ID, never values.",
    "مراجع الأسرار هي أسماء متغيرات بيئة مثل GITHUB_APP_ID، وليست قيمًا.",
  ],
  idempotency_conflict: [
    "This form was already submitted for a different action. Reload the page.",
    "أُرسل هذا النموذج لإجراء مختلف. أعد تحميل الصفحة.",
  ],
  idempotency_key_invalid: [
    "This form expired. Reload the page.",
    "انتهت صلاحية هذا النموذج. أعد تحميل الصفحة.",
  ],
  secret_rejected: [
    "Something that looks like a secret was refused. Never paste credentials here.",
    "رُفض شيء يشبه سرًّا. لا تلصق بيانات اعتماد هنا أبدًا.",
  ],
  settings_invalid: ["One of the values is not allowed.", "إحدى القيم غير مسموح بها."],
  configuration_missing: [
    "Platform Admin is not configured in this environment.",
    "لم تتم تهيئة إدارة المنصة في هذه البيئة.",
  ],
  unavailable: [
    "The response could not be confirmed. Refresh and check the current state before retrying.",
    "تعذر تأكيد النتيجة. حدّث الصفحة وتحقق من الحالة الحالية قبل إعادة المحاولة.",
  ],
};

/** Validation, activation and prerequisite reasons returned as data. */
export const reasonCopy: Record<string, Copy> = {
  instance_unknown: ["The instance does not exist.", "النسخة غير موجودة."],
  instance_not_provisioning: [
    "The instance is already past provisioning.",
    "النسخة تجاوزت مرحلة التهيئة.",
  ],
  slug_invalid: [
    "Slug: 3–40 lowercase letters, digits or hyphens.",
    "المعرّف: ٣–٤٠ حرفًا صغيرًا أو أرقامًا أو شرطات.",
  ],
  slug_taken: [
    "That slug is used by another instance.",
    "هذا المعرّف مستخدم لنسخة أخرى.",
  ],
  locale_invalid: ["Choose English or Arabic.", "اختر الإنجليزية أو العربية."],
  timezone_invalid: ["Choose a valid IANA time zone.", "اختر منطقة زمنية صالحة."],
  currency_invalid: [
    "Use a three-letter currency code.",
    "استخدم رمز عملة من ثلاثة أحرف.",
  ],
  release_invalid: ["Choose a registered release.", "اختر إصدارًا مسجّلًا."],
  config_schema_invalid: [
    "The release has no valid configuration schema.",
    "لا يحتوي الإصدار على مخطط إعدادات صالح.",
  ],
  backend_contract_incompatible: [
    "The release cannot talk to the backend this fleet runs.",
    "لا يتوافق الإصدار مع الخادم الذي يعمل عليه الأسطول.",
  ],
  domains_invalid: ["One of the domains is malformed.", "أحد النطاقات غير صالح."],
  domain_taken: [
    "A domain is already used by another tenant.",
    "أحد النطاقات مستخدم لمستأجر آخر.",
  ],
  github_installation_missing: [
    "The GitHub App is not installed for this tenant.",
    "تطبيق GitHub غير مثبّت لهذا المستأجر.",
  ],
  steps_incomplete: [
    "Required steps have not all succeeded.",
    "لم تنجح كل الخطوات المطلوبة.",
  ],
  waiting_customer_dns: [
    "Waiting for the customer's DNS change.",
    "بانتظار تغيير DNS لدى العميل.",
  ],
  waiting_external_approval: [
    "Waiting for an external approval.",
    "بانتظار موافقة خارجية.",
  ],
  waiting_provider_rate_limit: [
    "Waiting for a provider rate limit.",
    "بانتظار انتهاء حدّ معدل المزوّد.",
  ],
  waiting_provider_outage: [
    "Waiting for a provider outage to end.",
    "بانتظار انتهاء انقطاع المزوّد.",
  ],
  waiting_worker_not_implemented: [
    "Waiting for a worker that is not deployed.",
    "بانتظار عامل غير منشور.",
  ],
  release_state_missing: [
    "No release state is recorded.",
    "لا توجد حالة إصدار مسجّلة.",
  ],
  environment_unverified: [
    "The deployed environment has not been verified.",
    "لم يتم التحقق من بيئة النشر.",
  ],
  release_mismatch: [
    "The running release differs from the desired one.",
    "الإصدار العامل يختلف عن الإصدار المطلوب.",
  ],
  domains_unverified: [
    "A production domain is not verified.",
    "أحد نطاقات الإنتاج غير موثّق.",
  ],
  brand_not_published: [
    "The brand has not been published.",
    "لم تُنشر العلامة التجارية.",
  ],
  release_withdrawn: ["The release was withdrawn.", "سُحب الإصدار."],
  migrations_missing: [
    "Required database migrations are not applied.",
    "ترحيلات قاعدة البيانات المطلوبة غير مطبّقة.",
  ],
  migration_state_unknown: [
    "Applied migrations cannot be read.",
    "تعذّرت قراءة الترحيلات المطبّقة.",
  ],
  config_schema_regression: [
    "The instance uses a newer configuration schema.",
    "تستخدم النسخة مخطط إعدادات أحدث.",
  ],
  rollout_in_progress: [
    "Another rollout is already moving this instance.",
    "عملية نشر أخرى تنقل هذه النسخة بالفعل.",
  ],
  previous_release_unknown: [
    "The previous release is not registered, so it cannot be restored.",
    "الإصدار السابق غير مسجّل، لذا لا يمكن استعادته.",
  ],
};

export const statusCopy: Record<string, Copy> = {
  active: ["Active", "نشط"],
  suspended: ["Suspended", "معلّق"],
  closed: ["Closed", "مغلق"],
  provisioning: ["Provisioning", "قيد التهيئة"],
  none: ["No subscription", "بلا اشتراك"],
  trialing: ["Trial", "تجريبي"],
  past_due: ["Past due", "متأخر السداد"],
  cancelled: ["Cancelled", "ملغى"],
  requested: ["Requested", "مطلوب"],
  validated: ["Validated", "تم التحقق"],
  tenant_created: ["Records created", "أُنشئت السجلات"],
  repository_seeded: ["Repository seeded", "تمت تهيئة المستودع"],
  config_committed: ["Configuration committed", "تم حفظ الإعدادات"],
  projects_created: ["Projects created", "أُنشئت المشاريع"],
  environment_configured: ["Environment configured", "تمت تهيئة البيئة"],
  domain_pending: ["Waiting for domain", "بانتظار النطاق"],
  domain_deployed: ["Domain deployed", "تم نشر النطاق"],
  health_checked: ["Health checked", "تم فحص الحالة"],
  failed: ["Failed", "فشل"],
  deactivated: ["Deactivated", "معطّل"],
  pending: ["Pending", "معلّق الانتظار"],
  running: ["Running", "قيد التنفيذ"],
  waiting: ["Waiting", "بانتظار"],
  succeeded: ["Succeeded", "نجح"],
  skipped: ["Skipped", "متخطّى"],
  queued: ["Queued", "في قائمة الانتظار"],
  awaiting_approval: ["Awaiting approval", "بانتظار الموافقة"],
  draft: ["Draft", "مسودة"],
  paused: ["Paused", "متوقف مؤقتًا"],
  completed: ["Completed", "مكتمل"],
  rolled_back: ["Rolled back", "تم التراجع"],
  rollback_queued: ["Rollback queued", "التراجع في الانتظار"],
  healthy: ["Healthy", "سليم"],
  degraded: ["Degraded", "متراجع"],
  failing: ["Failing", "متعطل"],
  unknown: ["Not observed", "لم تُرصد"],
  stale: ["Stale", "قديمة"],
  fresh: ["Current", "حديثة"],
  never: ["Never observed", "لم تُرصد أبدًا"],
  not_configured: ["Not configured", "غير مهيأ"],
  configured: ["Configured, not checked", "مهيأ، لم يُفحص"],
  reachable: ["Reachable, not verified", "يمكن الوصول إليه، غير موثّق"],
  verified: ["Verified in operation", "موثّق أثناء التشغيل"],
  expired: ["Expired", "منتهي"],
  revoked: ["Revoked", "ملغى الوصول"],
  denied: ["Denied", "مرفوض"],
  available: ["Available", "متاح"],
  withdrawn: ["Withdrawn", "مسحوب"],
  internal: ["Internal", "داخلي"],
  candidate: ["Candidate", "مرشّح"],
  stable: ["Stable", "مستقر"],
  canary: ["Canary", "تجريبي مبكر"],
  early: ["Early", "مبكر"],
  general: ["General", "عام"],
  disabled: ["Disabled", "معطّل"],
  claimed: ["Claimed by a worker", "استلمها عامل"],
  retried: ["Retried", "أُعيدت المحاولة"],
  activation_blocked: ["Activation blocked", "مُنع التفعيل"],
  activated: ["Activated", "تم التفعيل"],
  reconciled: ["Reconciled", "تمت المعالجة"],
  enqueued: ["Queued", "أُضيفت للانتظار"],
  approved: ["Approved", "تمت الموافقة"],
};

export function statusTone(
  status: string | null | undefined,
): "neutral" | "positive" | "warning" | "danger" {
  switch (status) {
    case "active":
    case "succeeded":
    case "healthy":
    case "verified":
    case "completed":
    case "available":
    case "fresh":
    case "rolled_back":
      return "positive";
    case "failed":
    case "failing":
    case "suspended":
    case "denied":
    case "past_due":
    case "closed":
    case "withdrawn":
      return "danger";
    case "waiting":
    case "queued":
    case "paused":
    case "degraded":
    case "stale":
    case "pending":
    case "domain_pending":
    case "awaiting_approval":
    case "trialing":
    case "rollback_queued":
    case "reachable":
    case "configured":
    case "unknown":
    case "never":
    case "not_configured":
    case "running":
    case "provisioning":
      return "warning";
    default:
      return "neutral";
  }
}

export const roleCopy = {
  viewer: ["Viewer", "مشاهد"],
  operator: ["Operator", "مشغّل"],
  admin: ["Administrator", "مسؤول"],
  break_glass: ["Break-glass", "وصول الطوارئ"],
} as const satisfies Record<string, Copy>;
