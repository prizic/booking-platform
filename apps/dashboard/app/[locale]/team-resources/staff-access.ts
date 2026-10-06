import type { Locale } from "@wlbp/i18n";
import type { BuiltInStaffRole } from "@wlbp/api-contracts";

const copy = {
  en: {
    title: "Login access",
    hint: "Login access and staff availability are separate. Revoking access ends workspace permission; it does not change future allocations.",
    invite: "Invite staff",
    email: "Email",
    role: "Built-in role",
    locations: "Assigned locations",
    locationHint:
      "Location managers need at least one location. Tenant-wide roles keep their tenant scope.",
    save: "Save access",
    revoke: "Revoke access",
    confirm: "I understand that this removes workspace access.",
    resend: "Resend invitation",
    revokeInvitation: "Revoke invitation",
    pending: "Pending",
    accepted: "Accepted",
    expired: "Expired",
    revoked: "Revoked",
    active: "Active",
    suspended: "Suspended",
    queued: "Queued",
    sending: "Sending",
    sent: "Accepted by email provider",
    failed: "Delivery failed",
    superseded: "Superseded",
    unconfigured: "Delivery not configured",
    working: "Saving…",
    saved: "Access change saved.",
    invalid: "Check the fields and try again.",
    revision_conflict:
      "Access changed since you opened it. Reload and review before saving.",
    not_authorized: "You cannot manage login access.",
    unavailable: "Login access is unavailable. Try again shortly.",
    last_administrator_required:
      "Keep at least one active administrator. Add another administrator before removing this access.",
    step_up_required: "Verify your authenticator before changing administrator access.",
    idempotency_conflict:
      "This attempt was already used for different values. Reload and review.",
    invitation_not_pending:
      "This invitation is no longer pending. Reload its current status.",
    member_already_active:
      "This account already has active access. Edit the membership instead.",
    empty: "No invitations.",
    staff: "Staff",
    scheduler: "Scheduler",
    location_manager: "Location manager",
    tenant_admin: "Administrator",
    account: "Staff account",
    noAccount: "No login account",
    currentAccount: "Current linked account",
  },
  ar: {
    title: "صلاحية الدخول",
    hint: "صلاحية الدخول وتوفر الموظف منفصلان. إلغاء الدخول ينهي صلاحية مساحة العمل ولا يغيّر الحجوزات المستقبلية.",
    invite: "دعوة موظف",
    email: "البريد الإلكتروني",
    role: "الدور المعتمد",
    locations: "المواقع المعيّنة",
    locationHint:
      "يحتاج مدير الموقع إلى موقع واحد على الأقل. تظل الأدوار العامة ضمن نطاق المنشأة.",
    save: "حفظ الصلاحية",
    revoke: "إلغاء صلاحية الدخول",
    confirm: "أفهم أن هذا يلغي الدخول إلى مساحة العمل.",
    resend: "إعادة إرسال الدعوة",
    revokeInvitation: "إلغاء الدعوة",
    pending: "بانتظار القبول",
    accepted: "مقبولة",
    expired: "منتهية",
    revoked: "ملغاة",
    active: "نشطة",
    suspended: "معلّقة",
    queued: "في قائمة الإرسال",
    sending: "جارٍ الإرسال",
    sent: "قبلها مزوّد البريد",
    failed: "فشل الإرسال",
    superseded: "استُبدلت",
    unconfigured: "الإرسال غير مهيّأ",
    working: "جارٍ الحفظ…",
    saved: "حُفظ تغيير الصلاحية.",
    invalid: "تحقق من الحقول وحاول مجددًا.",
    revision_conflict: "تغيّرت الصلاحية منذ فتح الصفحة. أعد التحميل وراجعها قبل الحفظ.",
    not_authorized: "لا يمكنك إدارة صلاحية الدخول.",
    unavailable: "إدارة الدخول غير متاحة. حاول بعد قليل.",
    last_administrator_required:
      "احتفظ بمسؤول نشط واحد على الأقل. أضف مسؤولًا آخر قبل إلغاء هذه الصلاحية.",
    step_up_required: "تحقق بتطبيق المصادقة قبل تغيير صلاحية المسؤول.",
    idempotency_conflict: "استُخدمت هذه المحاولة بقيم مختلفة. أعد التحميل وراجعها.",
    invitation_not_pending: "لم تعد الدعوة بانتظار القبول. أعد تحميل حالتها الحالية.",
    member_already_active: "للحساب صلاحية نشطة بالفعل. عدّل العضوية بدلًا من دعوته.",
    empty: "لا توجد دعوات.",
    staff: "موظف",
    scheduler: "منسّق الحجوزات",
    location_manager: "مدير موقع",
    tenant_admin: "مسؤول",
    account: "حساب الموظف",
    noAccount: "دون حساب دخول",
    currentAccount: "الحساب المرتبط حاليًا",
  },
} as const;
export type StaffAccessMessage = keyof typeof copy.en;
export const staffAccessMessage = (locale: Locale, key: StaffAccessMessage) =>
  copy[locale][key];
export const staffRoleName = (locale: Locale, role: BuiltInStaffRole) =>
  copy[locale][role];
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
export function parseStaffAccessCommand(form: FormData) {
  const action = form.get("operation");
  const requestId = form.get("requestId");
  if (
    typeof requestId !== "string" ||
    !uuid.test(requestId) ||
    typeof action !== "string" ||
    ![
      "invite",
      "resend",
      "revoke_invitation",
      "edit_membership",
      "revoke_membership",
    ].includes(action)
  )
    return null;
  const targetId = form.get("targetId");
  const roleId = form.get("roleId");
  const expected = form.get("expectedRevision");
  const locationIds = form.getAll("locationIds");
  const email = form.get("email");
  if (
    locationIds.length > 100 ||
    locationIds.some((id) => typeof id !== "string" || !uuid.test(id))
  )
    return null;
  if (
    action !== "invite" &&
    (typeof targetId !== "string" ||
      !uuid.test(targetId) ||
      typeof expected !== "string" ||
      !/^[1-9][0-9]*$/u.test(expected) ||
      !Number.isSafeInteger(Number(expected)))
  )
    return null;
  if (
    ["invite", "edit_membership"].includes(action) &&
    (typeof roleId !== "string" || !uuid.test(roleId))
  )
    return null;
  if (
    action === "invite" &&
    (typeof email !== "string" ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email))
  )
    return null;
  if (action.startsWith("revoke") && form.get("confirm") !== "yes") return null;
  return {
    action,
    requestId,
    targetId: typeof targetId === "string" && uuid.test(targetId) ? targetId : null,
    roleId: typeof roleId === "string" && uuid.test(roleId) ? roleId : null,
    expectedRevision:
      typeof expected === "string" && expected !== "" ? Number(expected) : null,
    locationIds: locationIds as string[],
    email: typeof email === "string" ? email.trim().toLowerCase() : null,
  };
}
