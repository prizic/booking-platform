import type { Locale } from "@wlbp/i18n";

export type TeamResourcesMessageKey =
  | "active"
  | "addResource"
  | "addResourceType"
  | "addStaff"
  | "backToWorkspace"
  | "backendUnavailable"
  | "cancelFuture"
  | "createEditUnavailable"
  | "createResource"
  | "createResourceType"
  | "createStaff"
  | "deactivate"
  | "deactivateReason"
  | "deactivateResolution"
  | "deactivationCancelled"
  | "deactivationDeferred"
  | "deactivationFailed"
  | "deactivationPending"
  | "deactivationReassigned"
  | "deactivationSucceeded"
  | "deferDeactivation"
  | "futureAllocations"
  | "identifierHint"
  | "internalNotes"
  | "invalidRequest"
  | "inactive"
  | "key"
  | "locationId"
  | "locationScopeSummary"
  | "locationScopeTitle"
  | "locations"
  | "maintenance"
  | "membershipId"
  | "name"
  | "notAuthorized"
  | "offeredHours"
  | "publicBio"
  | "publicName"
  | "reassignFuture"
  | "replacementStaff"
  | "replacementResource"
  | "resourceType"
  | "resourceTypeId"
  | "resourceLocationEligibility"
  | "resourceRequirement"
  | "resourceRequired"
  | "revisionConflict"
  | "resourcesEmpty"
  | "resourcesTitle"
  | "services"
  | "serviceId"
  | "setEligible"
  | "setIneligible"
  | "status"
  | "staffEmpty"
  | "staffTitle"
  | "stepUpSummary"
  | "stepUpTitle"
  | "submitDeactivation"
  | "submitResource"
  | "submitResourceType"
  | "submitStaff"
  | "saveResource"
  | "saveResourceType"
  | "saveStaff"
  | "updateEligibility"
  | "updateRequirement"
  | "saved"
  | "editingUnavailable"
  | "editResource"
  | "editResourceType"
  | "editStaff"
  | "summary"
  | "title";

export const teamResourcesCopy: Record<
  Locale,
  Record<TeamResourcesMessageKey, string>
> = {
  en: {
    active: "Active",
    addResource: "Add resource",
    addResourceType: "Add resource type",
    addStaff: "Add team member",
    backToWorkspace: "Back to workspace",
    backendUnavailable: "Team and resource data is temporarily unavailable.",
    cancelFuture: "Cancel future allocations and deactivate",
    createEditUnavailable:
      "Create or edit records with revision checks, then manage exact service and location eligibility.",
    createResource: "Create exclusive resource",
    createResourceType: "Create resource type",
    createStaff: "Create team member",
    deactivate: "Deactivate safely",
    deactivateReason: "Reason",
    deactivateResolution: "Future booking resolution",
    deactivationCancelled:
      "Future allocations were cancelled and the item was deactivated.",
    deactivationDeferred:
      "Deactivation was deferred; future allocations remain protected.",
    deactivationFailed: "The change was not applied. Review the fields and try again.",
    deactivationPending: "Deactivation pending",
    deactivationReassigned:
      "Future allocations were reassigned and the team member was deactivated.",
    deactivationSucceeded: "The item was deactivated.",
    deferDeactivation: "Keep active and defer deactivation",
    futureAllocations: "Future allocations",
    identifierHint: "Enter the UUID from the catalog workspace.",
    internalNotes: "Internal notes",
    invalidRequest: "Review the form fields and submit again.",
    inactive: "Inactive",
    key: "Stable key",
    locationId: "Location ID",
    locationScopeSummary:
      "This first management tracer does not widen location authority into tenant-wide access. Scoped editing needs its dedicated backend contract.",
    locationScopeTitle: "Location-scoped management is not connected yet",
    locations: "Locations",
    maintenance: "Maintenance",
    membershipId: "Membership ID (optional)",
    name: "Name",
    notAuthorized: "Your current access does not allow that change.",
    offeredHours: "Offered hours per week",
    publicBio: "Public bio",
    publicName: "Public name",
    reassignFuture: "Reassign future allocations and deactivate",
    replacementStaff: "Replacement team member",
    replacementResource: "Replacement resource",
    resourceType: "Resource type",
    resourceTypeId: "Resource type ID",
    resourceLocationEligibility: "Location eligibility",
    resourceRequirement: "Service resource requirement",
    resourceRequired: "Require this resource type",
    revisionConflict:
      "This record changed. Refresh the page, review the latest values, and try again.",
    resourcesEmpty: "No exclusive resources are configured.",
    resourcesTitle: "Exclusive resources",
    services: "Eligible services",
    serviceId: "Service ID",
    setEligible: "Eligible",
    setIneligible: "Not eligible",
    status: "Status",
    staffEmpty: "No team members are configured.",
    staffTitle: "Team",
    stepUpSummary: "Complete the required MFA step-up before managing team data.",
    stepUpTitle: "Additional verification required",
    submitDeactivation: "Apply safe resolution",
    submitResource: "Create resource",
    submitResourceType: "Create resource type",
    submitStaff: "Create team member",
    saveResource: "Save resource",
    saveResourceType: "Save resource type",
    saveStaff: "Save team member",
    updateEligibility: "Update exact eligibility",
    updateRequirement: "Update requirement",
    saved: "The change was saved.",
    editingUnavailable:
      "Editing needs current revision data. Refresh-safe editing will unlock when the management DTO provides it.",
    editResource: "Edit resource",
    editResourceType: "Edit resource type",
    editStaff: "Edit team member",
    summary:
      "Review eligibility, locations, maintenance state, and protected future allocations.",
    title: "Team and resources",
  },
  ar: {
    active: "نشط",
    addResource: "إضافة مورد",
    addResourceType: "إضافة نوع مورد",
    addStaff: "إضافة عضو فريق",
    backToWorkspace: "العودة إلى مساحة العمل",
    backendUnavailable: "بيانات الفريق والموارد غير متاحة مؤقتًا.",
    cancelFuture: "إلغاء التخصيصات المستقبلية وإلغاء التنشيط",
    createEditUnavailable:
      "أنشئ السجلات أو عدّلها مع التحقق من النسخة، ثم أدر أهلية الخدمة والموقع بدقة.",
    createResource: "إنشاء مورد حصري",
    createResourceType: "إنشاء نوع مورد",
    createStaff: "إنشاء عضو فريق",
    deactivate: "إلغاء التنشيط بأمان",
    deactivateReason: "السبب",
    deactivateResolution: "معالجة الحجوزات المستقبلية",
    deactivationCancelled: "أُلغيت التخصيصات المستقبلية وأُلغي تنشيط العنصر.",
    deactivationDeferred: "تأجل إلغاء التنشيط وبقيت التخصيصات المستقبلية محمية.",
    deactivationFailed: "لم يُطبّق التغيير. راجع الحقول وحاول مرة أخرى.",
    deactivationPending: "إلغاء التنشيط معلّق",
    deactivationReassigned: "أُعيد تعيين التخصيصات المستقبلية وأُلغي تنشيط عضو الفريق.",
    deactivationSucceeded: "أُلغي تنشيط العنصر.",
    deferDeactivation: "الإبقاء نشطًا وتأجيل إلغاء التنشيط",
    futureAllocations: "التخصيصات المستقبلية",
    identifierHint: "أدخل معرّف UUID من مساحة عمل الكتالوج.",
    internalNotes: "ملاحظات داخلية",
    invalidRequest: "راجع حقول النموذج ثم أرسل الطلب مرة أخرى.",
    inactive: "غير نشط",
    key: "المفتاح الثابت",
    locationId: "معرّف الموقع",
    locationScopeSummary:
      "لا يوسّع مسار الإدارة الأول هذا صلاحية الموقع إلى وصول يشمل المستأجر. يحتاج التعديل محدد النطاق إلى عقد خلفي مخصص.",
    locationScopeTitle: "الإدارة محددة الموقع غير متصلة بعد",
    locations: "المواقع",
    maintenance: "صيانة",
    membershipId: "معرّف العضوية (اختياري)",
    name: "الاسم",
    notAuthorized: "صلاحياتك الحالية لا تسمح بهذا التغيير.",
    offeredHours: "ساعات العمل المتاحة أسبوعيًا",
    publicBio: "النبذة العامة",
    publicName: "الاسم العام",
    reassignFuture: "إعادة تعيين التخصيصات المستقبلية وإلغاء التنشيط",
    replacementStaff: "عضو الفريق البديل",
    replacementResource: "المورد البديل",
    resourceType: "نوع المورد",
    resourceTypeId: "معرّف نوع المورد",
    resourceLocationEligibility: "أهلية الموقع",
    resourceRequirement: "متطلب مورد الخدمة",
    resourceRequired: "اشتراط نوع المورد هذا",
    revisionConflict: "تغيّر هذا السجل. حدّث الصفحة وراجع أحدث القيم ثم حاول مرة أخرى.",
    resourcesEmpty: "لا توجد موارد حصرية مهيأة.",
    resourcesTitle: "الموارد الحصرية",
    services: "الخدمات المؤهلة",
    serviceId: "معرّف الخدمة",
    setEligible: "مؤهل",
    setIneligible: "غير مؤهل",
    status: "الحالة",
    staffEmpty: "لا يوجد أعضاء فريق مهيؤون.",
    staffTitle: "الفريق",
    stepUpSummary: "أكمل التحقق الإضافي متعدد العوامل قبل إدارة بيانات الفريق.",
    stepUpTitle: "يلزم تحقق إضافي",
    submitDeactivation: "تطبيق المعالجة الآمنة",
    submitResource: "إنشاء المورد",
    submitResourceType: "إنشاء نوع المورد",
    submitStaff: "إنشاء عضو الفريق",
    saveResource: "حفظ المورد",
    saveResourceType: "حفظ نوع المورد",
    saveStaff: "حفظ عضو الفريق",
    updateEligibility: "تحديث الأهلية الدقيقة",
    updateRequirement: "تحديث المتطلب",
    saved: "حُفظ التغيير.",
    editingUnavailable:
      "يحتاج التعديل إلى بيانات النسخة الحالية. سيتاح التعديل الآمن بعد أن يعيد عقد الإدارة هذه البيانات.",
    editResource: "تعديل المورد",
    editResourceType: "تعديل نوع المورد",
    editStaff: "تعديل عضو الفريق",
    summary: "راجع الأهلية والمواقع وحالة الصيانة والتخصيصات المستقبلية المحمية.",
    title: "الفريق والموارد",
  },
};

export function getTeamResourcesMessage(locale: Locale, key: TeamResourcesMessageKey) {
  return teamResourcesCopy[locale][key];
}
