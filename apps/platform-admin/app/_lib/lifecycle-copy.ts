import type { Copy } from "./copy";
export const lifecycleCopy = {
  configuration: ["Instance configuration", "إعدادات النسخة"],
  displayName: ["Display name", "اسم العرض"],
  editConfiguration: ["Edit configuration", "تعديل الإعدادات"],
  saveConfiguration: ["Save configuration", "حفظ الإعدادات"],
  configurationBody: [
    "Only the display name can be changed here. Release, provider and secret settings stay in their managed workflows.",
    "يمكن تغيير اسم العرض فقط هنا. تبقى إعدادات الإصدار والمزوّد والأسرار ضمن مساراتها المُدارة.",
  ],
  configurationSaved: ["Configuration saved.", "تم حفظ الإعدادات."],
  revision: ["Revision", "المراجعة"],
  lifecycle: ["Instance lifecycle", "دورة حياة النسخة"],
  deactivate: ["Deactivate", "إلغاء التفعيل"],
  deactivateBody: [
    "Suspend this instance and request inactive infrastructure. External provider completion is recorded separately.",
    "علّق هذه النسخة واطلب تعطيل بنيتها. يُسجّل اكتمال التنفيذ لدى المزوّد الخارجي بشكل مستقل.",
  ],
  deactivated: [
    "Instance suspended. Infrastructure deactivation is requested; inspect execution history for provider progress.",
    "تم تعليق النسخة وطلب تعطيل البنية. افحص سجل التنفيذ لمعرفة تقدم المزوّد.",
  ],
  closure: ["Request closure", "طلب الإغلاق"],
  closureBody: [
    "Both tenant and instance must be suspended. Type the instance ID to request independent approval. Closure stays queued until the worker verifies inactive infrastructure; records and history are retained.",
    "يجب تعليق المستأجر والنسخة. اكتب معرّف النسخة لطلب موافقة مستقلة. يظل الإغلاق في الانتظار حتى يتحقق العامل من تعطيل البنية؛ تُحفظ السجلات والتاريخ.",
  ],
  awaitingExecution: [
    "Closure requested and approved; awaiting verified worker execution.",
    "طُلب الإغلاق وتمت الموافقة؛ في انتظار تنفيذ موثّق من العامل.",
  ],
  closureRequested: [
    "Closure requested; awaiting independent approval and verified execution.",
    "طُلب الإغلاق؛ في انتظار موافقة مستقلة وتنفيذ موثّق.",
  ],
  prerequisites: [
    "Suspend the tenant and instance before requesting closure. An unfinished job can prevent the request.",
    "علّق المستأجر والنسخة قبل طلب الإغلاق. قد تمنع مهمة غير مكتملة تقديم الطلب.",
  ],
  closed: [
    "Closed instances are retained for inspection and cannot be changed.",
    "تُحفظ النسخ المغلقة للفحص ولا يمكن تغييرها.",
  ],
  addDomain: ["Add domain", "إضافة نطاق"],
  domainAdded: [
    "Domain added; verification is queued.",
    "أُضيف النطاق؛ التحقق في الانتظار.",
  ],
  hostname: ["Hostname", "اسم المضيف"],
  application: ["Application", "التطبيق"],
  client: ["Client", "العميل"],
  dashboard: ["Dashboard", "لوحة المستأجر"],
  verify: ["Request verification", "طلب التحقق"],
  verifyBody: [
    "Queue DNS and certificate verification. A queued request does not mean the domain is verified.",
    "ضع التحقق من DNS والشهادة في الانتظار. وجود طلب في الانتظار لا يعني أن النطاق موثّق.",
  ],
  verifyQueued: [
    "Verification requested; awaiting provider evidence.",
    "طُلب التحقق؛ في انتظار أدلة المزوّد.",
  ],
  retire: ["Retire domain", "إيقاف النطاق"],
  retireBody: [
    "Request an independent review of route retirement. An active production route requires a verified replacement for the same tenant, instance and application. Approval changes SQL routing; provider teardown is a separate workflow.",
    "اطلب مراجعة مستقلة لإيقاف المسار. يتطلب مسار الإنتاج النشط بديلًا موثّقًا للمستأجر والنسخة والتطبيق أنفسهم. تغيّر الموافقة توجيه قاعدة البيانات؛ إزالة موارد المزوّد مسار مستقل.",
  ],
  replacement: ["Replacement domain", "النطاق البديل"],
  retiredAt: ["Retired at", "وقت إيقاف النطاق"],
  retired: ["Retired", "متوقف"],
  retiredBody: [
    "This domain route is retired. Its record and replacement history are retained; verification and retirement are unavailable.",
    "أُوقف مسار هذا النطاق. يُحفظ سجله وتاريخ البديل؛ لا يتاح التحقق أو طلب الإيقاف مجددًا.",
  ],
  retirementUnreported: [
    "Retirement metadata is not reported for some domains, so they cannot be selected as replacements. The server checks current eligibility before accepting a request or decision.",
    "لم تُبلّغ بيانات الإيقاف لبعض النطاقات، لذا لا يمكن اختيارها كبدائل. يتحقق الخادم من الأهلية الحالية قبل قبول الطلب أو القرار.",
  ],
  noReplacement: [
    "No replacement (only when allowed)",
    "بدون بديل (عندما يكون مسموحًا فقط)",
  ],
  noEligibleReplacement: [
    "No verified replacement is available. Add and verify a production domain before retiring an active route.",
    "لا يتوفر بديل موثّق. أضف نطاق إنتاج وتحقق منه قبل إيقاف مسار نشط.",
  ],
  retirementRequested: [
    "Retirement requested; the current route remains until independent approval.",
    "طُلب إيقاف النطاق؛ يظل المسار الحالي حتى الموافقة المستقلة.",
  ],
  openReview: ["Open Review", "فتح المراجعة"],
  planImpact: [
    "Deactivating a plan stops new assignments. Existing subscribers and their entitlements are retained.",
    "إلغاء تفعيل الخطة يوقف التعيينات الجديدة. تُحفظ الاشتراكات الحالية واستحقاقاتها.",
  ],
} as const satisfies Record<string, Copy>;
export const reviewCopy = {
  title: ["Review", "المراجعة"],
  description: [
    "Operator approvals awaiting an independent administrator, with retained decision history.",
    "موافقات المشغّلين التي تنتظر مسؤولًا مستقلًا، مع الاحتفاظ بسجل القرارات.",
  ],
  status: ["Decision status", "حالة القرار"],
  kind: ["Request kind", "نوع الطلب"],
  allHistory: ["All history", "كل السجل"],
  allKinds: ["All request kinds", "كل أنواع الطلبات"],
  job: ["Job", "مهمة"],
  support: ["Support access", "وصول الدعم"],
  writeScope: ["Write access (unavailable)", "وصول للكتابة (غير متاح)"],
  tenant: ["Tenant", "المستأجر"],
  action: ["Requested action", "الإجراء المطلوب"],
  requester: ["Requester", "مقدّم الطلب"],
  requestedAt: ["Requested at", "وقت الطلب"],
  inspect: ["Inspect request", "فحص الطلب"],
  reason: ["Request reason", "سبب الطلب"],
  detail: ["Request details", "تفاصيل الطلب"],
  history: ["Decision history", "سجل القرارات"],
  pendingEmpty: ["No approvals waiting", "لا توجد موافقات في الانتظار"],
  historyEmpty: [
    "No decisions match these filters",
    "لا توجد قرارات تطابق هذه التصفية",
  ],
  noHistory: ["No decision recorded yet", "لم يُسجّل قرار بعد"],
  approve: ["Approve", "موافقة"],
  reject: ["Reject", "رفض"],
  decisionBody: [
    "A fresh administrator other than the requester must decide. Give a 10–500-character reason; the decision and original request stay in the audit history.",
    "يجب أن يتخذ القرار مسؤول موثّق حديثًا غير مقدّم الطلب. اكتب سببًا من ١٠ إلى ٥٠٠ حرف؛ يُحفظ القرار والطلب الأصلي في سجل التدقيق.",
  ],
  approved: [
    "Request approved. Inspect its job for execution progress; closure is not immediate.",
    "تمت الموافقة على الطلب. افحص مهمته لمعرفة تقدم التنفيذ؛ الإغلاق ليس فوريًا.",
  ],
  supportApproved: [
    "Read-only support access approved. Its scope, expiry and decision remain available for inspection.",
    "تمت الموافقة على وصول الدعم للقراءة فقط. يظل نطاقه ووقت انتهائه والقرار متاحًا للفحص.",
  ],
  retirementApproved: [
    "Domain routing retirement approved and recorded. Provider resources have not been removed by this decision.",
    "تمت الموافقة على إيقاف توجيه النطاق وتوثيقه. لم يزل هذا القرار موارد المزوّد.",
  ],
  rejected: [
    "Request rejected. The original request and decision remain in history.",
    "رُفض الطلب. يُحفظ الطلب الأصلي والقرار في السجل.",
  ],
  independent: [
    "A different administrator must decide; the requester cannot approve or reject their own request.",
    "يجب أن يتخذ القرار مسؤول آخر؛ لا يمكن لمقدّم الطلب الموافقة على طلبه أو رفضه.",
  ],
  readOnly: [
    "Only a fresh independent administrator can decide. Your role has read-only access to Review.",
    "يمكن لمسؤول مستقل موثّق حديثًا فقط اتخاذ القرار. يتيح دورك قراءة المراجعة فقط.",
  ],
  decided: [
    "This request has already been decided. Its history remains available.",
    "اتُّخذ قرار بشأن هذا الطلب بالفعل. يظل سجله متاحًا.",
  ],
  outcome: ["Outcome", "النتيجة"],
  operator: ["Operator", "المشغّل"],
  close_instance: ["Close instance", "إغلاق النسخة"],
  rotate_secret: ["Rotate secret", "تدوير السر"],
  retire_domain: ["Retire domain route", "إيقاف مسار النطاق"],
  support_access: ["Read-only support access", "وصول دعم للقراءة فقط"],
} as const satisfies Record<string, Copy>;
