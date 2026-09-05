import type { Locale } from "@wlbp/i18n";

export type TeamResourcesMessageKey =
  | "active"
  | "addResource"
  | "addStaff"
  | "backToWorkspace"
  | "backendUnavailable"
  | "cancelFuture"
  | "createEditUnavailable"
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
  | "inactive"
  | "locationScopeSummary"
  | "locationScopeTitle"
  | "locations"
  | "maintenance"
  | "reassignFuture"
  | "replacementStaff"
  | "resourceType"
  | "resourcesEmpty"
  | "resourcesTitle"
  | "services"
  | "staffEmpty"
  | "staffTitle"
  | "stepUpSummary"
  | "stepUpTitle"
  | "submitDeactivation"
  | "summary"
  | "title";

export const teamResourcesCopy: Record<
  Locale,
  Record<TeamResourcesMessageKey, string>
> = {
  en: {
    active: "Active",
    addResource: "Add resource",
    addStaff: "Add team member",
    backToWorkspace: "Back to workspace",
    backendUnavailable: "Team and resource data is temporarily unavailable.",
    cancelFuture: "Cancel future allocations and deactivate",
    createEditUnavailable:
      "Creating, editing, and deactivation stay unavailable until revision-safe scoped management APIs are connected.",
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
    inactive: "Inactive",
    locationScopeSummary:
      "This first management tracer does not widen location authority into tenant-wide access. Scoped editing needs its dedicated backend contract.",
    locationScopeTitle: "Location-scoped management is not connected yet",
    locations: "Locations",
    maintenance: "Maintenance",
    reassignFuture: "Reassign future allocations and deactivate",
    replacementStaff: "Replacement team member",
    resourceType: "Resource type",
    resourcesEmpty: "No exclusive resources are configured.",
    resourcesTitle: "Exclusive resources",
    services: "Eligible services",
    staffEmpty: "No team members are configured.",
    staffTitle: "Team",
    stepUpSummary: "Complete the required MFA step-up before managing team data.",
    stepUpTitle: "Additional verification required",
    submitDeactivation: "Apply safe resolution",
    summary:
      "Review eligibility, locations, maintenance state, and protected future allocations.",
    title: "Team and resources",
  },
  ar: {
    active: "نشط",
    addResource: "إضافة مورد",
    addStaff: "إضافة عضو فريق",
    backToWorkspace: "العودة إلى مساحة العمل",
    backendUnavailable: "بيانات الفريق والموارد غير متاحة مؤقتًا.",
    cancelFuture: "إلغاء التخصيصات المستقبلية وإلغاء التنشيط",
    createEditUnavailable:
      "يظل الإنشاء والتعديل وإلغاء التنشيط غير متاح حتى توصيل واجهات إدارة محددة النطاق وآمنة من تعارض النسخ.",
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
    inactive: "غير نشط",
    locationScopeSummary:
      "لا يوسّع مسار الإدارة الأول هذا صلاحية الموقع إلى وصول يشمل المستأجر. يحتاج التعديل محدد النطاق إلى عقد خلفي مخصص.",
    locationScopeTitle: "الإدارة محددة الموقع غير متصلة بعد",
    locations: "المواقع",
    maintenance: "صيانة",
    reassignFuture: "إعادة تعيين التخصيصات المستقبلية وإلغاء التنشيط",
    replacementStaff: "عضو الفريق البديل",
    resourceType: "نوع المورد",
    resourcesEmpty: "لا توجد موارد حصرية مهيأة.",
    resourcesTitle: "الموارد الحصرية",
    services: "الخدمات المؤهلة",
    staffEmpty: "لا يوجد أعضاء فريق مهيؤون.",
    staffTitle: "الفريق",
    stepUpSummary: "أكمل التحقق الإضافي متعدد العوامل قبل إدارة بيانات الفريق.",
    stepUpTitle: "يلزم تحقق إضافي",
    submitDeactivation: "تطبيق المعالجة الآمنة",
    summary: "راجع الأهلية والمواقع وحالة الصيانة والتخصيصات المستقبلية المحمية.",
    title: "الفريق والموارد",
  },
};

export function getTeamResourcesMessage(locale: Locale, key: TeamResourcesMessageKey) {
  return teamResourcesCopy[locale][key];
}
