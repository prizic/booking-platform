"use client";

import { useActionState, useState } from "react";
import {
  Button,
  Checkbox,
  Field,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wlbp/ui-foundation";
import type { PermissionMetaV1, RoleV1 } from "@wlbp/api-contracts";

import { archiveRoleAction, saveRoleAction, type RoleActionResult } from "./actions";

const initial: RoleActionResult = { ok: true };

/**
 * The idempotency key this editor submits with. The server renders one fresh
 * key per render (`roles/page.tsx`), and a successful server action ships a
 * re-rendered RSC payload in the same response — the installed Next
 * `server-actions` guide states that `revalidatePath` (like `updateTag` and
 * `refresh`) re-renders the current route server-side and includes the new
 * payload in the action response, so the page reflects the change in the same
 * roundtrip. A new `requestId` prop is therefore adopted when it arrives
 * (derived from props without changing state during render). Rotating once more
 * on an observed success covers a payload that never lands: repeated submits
 * of one operation still share the DOM key and replay (`replayed: true`
 * server-side), while the next operation starts fresh. The revision travels
 * straight from props, so a refreshed revision is always submitted as-is.
 */
function useRotatingKey(requestId: string): readonly [string, () => void] {
  const [operation, setOperation] = useState({ requestId, key: requestId });
  const key = operation.requestId === requestId ? operation.key : requestId;
  return [key, () => setOperation({ requestId, key: crypto.randomUUID() })] as const;
}

/**
 * Local bilingual labels for every offerable permission (ADR-0019). Reserved
 * permissions are never offered, and anything without an entry falls back to
 * the raw key with no hint — never a silent omission of a shown grant.
 */
const permissionCopy: Readonly<
  Record<string, { en: string; ar: string; hintEn: string; hintAr: string }>
> = {
  "booking.view.own": {
    en: "View own bookings",
    ar: "عرض حجوزاته",
    hintEn: "Only bookings assigned to the member.",
    hintAr: "الحجوزات المسندة إلى العضو فقط.",
  },
  "booking.view.any": {
    en: "View all bookings",
    ar: "عرض كل الحجوزات",
    hintEn: "Every booking in the workspace.",
    hintAr: "كل حجوزات مساحة العمل.",
  },
  "booking.create_on_behalf": {
    en: "Create bookings for customers",
    ar: "إنشاء حجوزات للعملاء",
    hintEn: "Book on behalf of a customer.",
    hintAr: "الحجز نيابة عن العميل.",
  },
  "booking.approve": {
    en: "Decide booking requests",
    ar: "البت في طلبات الحجز",
    hintEn: "Accept, reject, or propose a new time.",
    hintAr: "قبول الطلبات أو رفضها أو اقتراح موعد جديد.",
  },
  "booking.reschedule": {
    en: "Reschedule bookings",
    ar: "إعادة جدولة الحجوزات",
    hintEn: "Move a booking to a new time.",
    hintAr: "نقل الحجز إلى موعد جديد.",
  },
  "booking.cancel": {
    en: "Cancel bookings",
    ar: "إلغاء الحجوزات",
    hintEn: "Cancel with a recorded reason.",
    hintAr: "الإلغاء مع سبب مسجل.",
  },
  "refund.issue": {
    en: "Issue refunds",
    ar: "إصدار المبالغ المستردة",
    hintEn: "Refund within the booking policy.",
    hintAr: "الاسترداد ضمن سياسة الحجز.",
  },
  "booking.check_in": {
    en: "Check in bookings",
    ar: "تسجيل حضور الحجوزات",
    hintEn: "Check in arrived customers.",
    hintAr: "تسجيل حضور العملاء الواصلين.",
  },
  "booking.check_in_override": {
    en: "Override check-in",
    ar: "تجاوز تسجيل الحضور",
    hintEn: "Check in outside the normal window.",
    hintAr: "تسجيل الحضور خارج النافذة المعتادة.",
  },
  "booking.mark_no_show": {
    en: "Mark no-show",
    ar: "تسجيل عدم الحضور",
    hintEn: "Record a missed booking.",
    hintAr: "تسجيل حجز فائت.",
  },
  "booking.complete": {
    en: "Complete bookings",
    ar: "إتمام الحجوزات",
    hintEn: "Mark a booking completed.",
    hintAr: "وضع علامة مكتمل على الحجز.",
  },
  "booking.correct_status": {
    en: "Correct booking status",
    ar: "تصحيح حالة الحجز",
    hintEn: "Fix a wrong lifecycle step.",
    hintAr: "تصحيح خطوة غير صحيحة في دورة الحجز.",
  },
  "catalog.edit": {
    en: "Edit catalog",
    ar: "تحرير الكتالوج",
    hintEn: "Services, locations, and prices.",
    hintAr: "الخدمات والمواقع والأسعار.",
  },
  "schedule.edit": {
    en: "Edit schedules",
    ar: "تحرير الجداول",
    hintEn: "Hours, breaks, and blackouts.",
    hintAr: "الساعات والاستراحات والإغلاقات.",
  },
  "staff.manage": {
    en: "Manage staff and resources",
    ar: "إدارة الموظفين والموارد",
    hintEn: "Invite, assign, and deactivate.",
    hintAr: "الدعوة والإسناد وإيقاف التفعيل.",
  },
  "policy.edit": {
    en: "Edit policies",
    ar: "تحرير السياسات",
    hintEn: "Cancellation and booking rules.",
    hintAr: "قواعد الإلغاء والحجز.",
  },
  "customer.pii.view": {
    en: "View customer details",
    ar: "عرض بيانات العملاء",
    hintEn: "Names and contact details.",
    hintAr: "الأسماء وبيانات التواصل.",
  },
  "customer.data.export": {
    en: "Export customer data",
    ar: "تصدير بيانات العملاء",
    hintEn: "Download a customer export.",
    hintAr: "تنزيل نسخة من بيانات عميل.",
  },
  "customer.data.export_on_behalf": {
    en: "Export data for others",
    ar: "تصدير البيانات للآخرين",
    hintEn: "Handle export requests for teammates.",
    hintAr: "معالجة طلبات التصدير نيابة عن الزملاء.",
  },
  "customer.data.correct": {
    en: "Correct customer data",
    ar: "تصحيح بيانات العملاء",
    hintEn: "Fix customer records.",
    hintAr: "تصحيح سجلات العملاء.",
  },
  "customer.data.delete": {
    en: "Delete customer data",
    ar: "حذف بيانات العملاء",
    hintEn: "Subject to legal holds and review.",
    hintAr: "يخضع للتحفظات القانونية والمراجعة.",
  },
  "customer.data.restrict": {
    en: "Restrict customer data",
    ar: "تقييد بيانات العملاء",
    hintEn: "Limit processing on request.",
    hintAr: "تقييد المعالجة عند الطلب.",
  },
  "brand.manage": {
    en: "Manage brand",
    ar: "إدارة الهوية",
    hintEn: "Name, content, and appearance.",
    hintAr: "الاسم والمحتوى والمظهر.",
  },
  "integration.manage": {
    en: "Manage integrations",
    ar: "إدارة التكاملات",
    hintEn: "Email and provider settings.",
    hintAr: "إعدادات البريد والموفرين.",
  },
  "audit.read": {
    en: "Read audit log",
    ar: "قراءة سجل التدقيق",
    hintEn: "Inspect workspace history.",
    hintAr: "الاطلاع على سجل مساحة العمل.",
  },
  "instance.request_update": {
    en: "Request platform updates",
    ar: "طلب تحديثات المنصة",
    hintEn: "Ask for an upstream update.",
    hintAr: "طلب تحديث من الإصدار الأعلى.",
  },
};

/**
 * What the editor is opening: nothing (create), a role to change, or a role to
 * copy. `role` and `source` are never both set — the contract refuses a source
 * role on an update.
 */
export interface RoleEditorTarget {
  readonly role: RoleV1 | null;
  readonly source: RoleV1 | null;
}

export function RoleEditor({
  locale,
  permissions,
  requestId,
  idPrefix,
  target = { role: null, source: null },
}: Readonly<{
  locale: "en" | "ar";
  permissions: readonly PermissionMetaV1[];
  /** The idempotency key this editor submits with; one per rendered editor. */
  requestId: string;
  /** Prefix keeping control ids unique when many editors share one page. */
  idPrefix: string;
  target?: RoleEditorTarget;
}>) {
  const ar = locale === "ar";
  const editing = target.role !== null;
  const say = (en: string, translated: string) => (ar ? translated : en);
  const existing = target.role ?? target.source;
  /** Scopes the role already carries, so a rename-only save keeps them. */
  const priorScopes = new Map(
    existing?.grants.map((grant) => [grant.permissionKey, grant.scope] as const) ?? [],
  );
  const custom =
    target.role !== null && target.role.kind === "custom" ? target.role : null;
  const mode = existing?.mode ?? "tenant";
  /**
   * What the working state below was derived from. A successful save
   * revalidates the route and the refreshed payload re-renders this mounted
   * editor with the role's current grants — but `useState` never re-initializes
   * from new props, so a stale working set would silently submit (or duplicate)
   * the pre-save grants. A changed signature therefore re-syncs the working
   * set during render, unless the operator has edited it: an unsaved draft is
   * never overwritten.
   */
  const grantsSignature =
    existing === null
      ? ""
      : `${existing.id}|${existing.mode}|${existing.revision}|${existing.grants
          .map((grant) => `${grant.permissionKey}@${grant.scope}`)
          .join(",")}`;
  const [chosenMode, setMode] = useState<"assigned" | "tenant">(mode);
  const assignedMode = chosenMode === "assigned";
  /**
   * The working permission set. Controlled (never `defaultChecked`): a mode
   * switch neither drops a selection nor resurrects an unchecked one — the
   * server refuses a selected incompatible grant instead of silently losing
   * it, and an uncheck stays absent across switches with no hidden ghost
   * field to resubmit it.
   */
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(existing?.grants.map((grant) => grant.permissionKey) ?? []),
  );
  const [baseline, setBaseline] = useState(() => ({
    signature: grantsSignature,
    edited: false,
  }));
  if (!baseline.edited && baseline.signature !== grantsSignature) {
    setBaseline({ signature: grantsSignature, edited: false });
    setMode(existing?.mode ?? "tenant");
    setSelected(new Set(existing?.grants.map((grant) => grant.permissionKey) ?? []));
  }
  const togglePermission = (permissionKey: string, next: boolean | "indeterminate") => {
    if (next === "indeterminate") return;
    setBaseline((previous) => ({ ...previous, edited: true }));
    setSelected((previous) => {
      const copy = new Set(previous);
      if (next) copy.add(permissionKey);
      else copy.delete(permissionKey);
      return copy;
    });
  };
  const [key, rotateKey] = useRotatingKey(requestId);
  const [result, action, pending] = useActionState(
    async (_state: RoleActionResult, form: FormData) => {
      const outcome = await saveRoleAction(form);
      if (outcome.ok) rotateKey();
      return outcome;
    },
    initial,
  );
  const title = editing
    ? say("Edit custom role", "تعديل دور مخصص")
    : target.source !== null
      ? say("Duplicate role", "نسخ دور")
      : say("Create custom role", "إنشاء دور مخصص");

  return (
    <form
      action={action}
      // React resets an action form after every submit — a refusal included —
      // and the native reset event reaches the reset listeners Radix Select
      // and Checkbox attach to this form, rewinding the scope and boxes to
      // their mount-time values (a declined scope switch would silently widen
      // the retried grant). Capture-phase cancellation keeps the operator's
      // draft; validation and authorization still run server-side unchanged.
      onResetCapture={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      className="grid gap-4 rounded-xl border border-border bg-card p-5"
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="requestId" value={key} />
      {target.role !== null ? (
        <>
          <input type="hidden" name="roleId" value={target.role.id} />
          <input type="hidden" name="revision" value={target.role.revision} />
        </>
      ) : null}
      {target.source !== null ? (
        <input type="hidden" name="sourceRoleId" value={target.source.id} />
      ) : null}
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Field>
          <Label htmlFor={`${idPrefix}-name-en`}>Name (English)</Label>
          <Input
            defaultValue={target.role?.kind === "custom" ? target.role.nameEn : ""}
            id={`${idPrefix}-name-en`}
            name="nameEn"
            required
            maxLength={80}
          />
        </Field>
        <Field>
          <Label htmlFor={`${idPrefix}-name-ar`}>الاسم بالعربية</Label>
          <Input
            defaultValue={target.role?.kind === "custom" ? target.role.nameAr : ""}
            dir="rtl"
            id={`${idPrefix}-name-ar`}
            name="nameAr"
            required
            maxLength={80}
          />
        </Field>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field>
          <Label htmlFor={`${idPrefix}-description-en`}>
            {say("Description (English, optional)", "الوصف بالإنجليزية (اختياري)")}
          </Label>
          <Input
            defaultValue={custom?.descriptionEn ?? ""}
            id={`${idPrefix}-description-en`}
            name="descriptionEn"
            maxLength={500}
          />
        </Field>
        <Field>
          <Label htmlFor={`${idPrefix}-description-ar`}>
            {say("Description (Arabic, optional)", "الوصف بالعربية (اختياري)")}
          </Label>
          <Input
            defaultValue={custom?.descriptionAr ?? ""}
            dir="rtl"
            id={`${idPrefix}-description-ar`}
            name="descriptionAr"
            maxLength={500}
          />
        </Field>
      </div>
      <Field>
        <Label htmlFor={`${idPrefix}-mode`}>{say("Role scope", "نطاق الدور")}</Label>
        {/* Radix Select holds no form value, so the visible trigger is paired
            with a real input the action actually reads. */}
        <input name="mode" type="hidden" value={chosenMode} />
        <Select
          onValueChange={(value: string) => {
            setBaseline((previous) => ({ ...previous, edited: true }));
            setMode(value === "assigned" ? "assigned" : "tenant");
          }}
          value={chosenMode}
        >
          <SelectTrigger
            aria-label={say("Role scope", "نطاق الدور")}
            id={`${idPrefix}-mode`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tenant">{say("All locations", "كل المواقع")}</SelectItem>
            <SelectItem value="assigned">
              {say("Assigned locations", "المواقع المخصصة")}
            </SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <fieldset className="grid gap-2">
        <legend className="font-medium">{say("Permissions", "الصلاحيات")}</legend>
        {assignedMode ? (
          <p className="text-xs text-muted-foreground">
            {say(
              "Workspace-wide permissions are unavailable for assigned-location roles.",
              "الصلاحيات على مستوى مساحة العمل غير متاحة لأدوار المواقع المخصصة.",
            )}
          </p>
        ) : null}
        {permissions
          .filter(
            (permission) =>
              !permission.reserved && permission.allowedGrantKinds.includes("direct"),
          )
          .map((permission) => {
            const copy = permissionCopy[permission.key];
            // Tenant-only permissions (no `own`/`location` scope) cannot be
            // expressed in assigned mode. Only UNSELECTED boxes are disabled,
            // so a selected one — pre-existing or newly checked before the
            // switch — stays removable; submitting it anyway is refused by
            // the server with an actionable message instead of silently
            // dropping it. No hidden permission ghost: the submitted set is
            // exactly the controlled state. The prior scope travels along so
            // a rename-only save keeps it.
            const unavailable =
              assignedMode &&
              !permission.allowedScopes.includes("own") &&
              !permission.allowedScopes.includes("location");
            const isSelected = selected.has(permission.key);
            const priorScope = priorScopes.get(permission.key);
            return (
              <div key={permission.key} className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={(next) => togglePermission(permission.key, next)}
                  disabled={unavailable && !isSelected}
                  id={`${idPrefix}-permission-${permission.key}`}
                  name="permission"
                  value={permission.key}
                />
                {priorScope !== undefined ? (
                  <input
                    type="hidden"
                    name={`scope:${permission.key}`}
                    value={priorScope}
                  />
                ) : null}
                <div className="grid gap-0.5">
                  <Label htmlFor={`${idPrefix}-permission-${permission.key}`}>
                    {copy ? (ar ? copy.ar : copy.en) : permission.key}
                  </Label>
                  {copy ? (
                    <p className="text-xs text-muted-foreground">
                      {ar ? copy.hintAr : copy.hintEn}
                    </p>
                  ) : null}
                  {unavailable && isSelected ? (
                    <p className="text-xs text-destructive">
                      {say(
                        "Remove this permission or switch back to All locations before saving.",
                        "أزل هذه الصلاحية أو عُد إلى كل المواقع قبل الحفظ.",
                      )}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
      </fieldset>
      {result.message ? (
        <p
          role={result.ok ? "status" : "alert"}
          className={result.ok ? "text-success" : "text-destructive"}
        >
          {result.message}
        </p>
      ) : null}
      <Button
        loading={pending}
        loadingLabel={say("Saving…", "جارٍ الحفظ…")}
        type="submit"
      >
        {say("Save role", "حفظ الدور")}
      </Button>
    </form>
  );
}

/**
 * Archiving is a form of its own: it names the role and the revision the list
 * was rendered from, so a stale page is refused rather than archiving whatever
 * the role became since.
 */
export function ArchiveRoleButton({
  locale,
  role,
  requestId,
}: Readonly<{ locale: "en" | "ar"; role: RoleV1; requestId: string }>) {
  const ar = locale === "ar";
  const [archiveKey, rotateArchiveKey] = useRotatingKey(requestId);
  const [archiveResult, archiveAction, archivePending] = useActionState(
    async (_state: RoleActionResult, form: FormData) => {
      const outcome = await archiveRoleAction(form);
      if (outcome.ok) rotateArchiveKey();
      return outcome;
    },
    initial,
  );
  return (
    <form action={archiveAction} className="grid gap-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="requestId" value={archiveKey} />
      <input type="hidden" name="roleId" value={role.id} />
      <input type="hidden" name="revision" value={role.revision} />
      <Button
        loading={archivePending}
        loadingLabel={ar ? "جارٍ الأرشفة…" : "Archiving…"}
        size="sm"
        type="submit"
        variant="outline"
      >
        {ar ? "أرشفة" : "Archive"}
      </Button>
      {archiveResult.message ? (
        <p
          role={archiveResult.ok ? "status" : "alert"}
          className={archiveResult.ok ? "text-success" : "text-destructive"}
        >
          {archiveResult.message}
        </p>
      ) : null}
    </form>
  );
}
