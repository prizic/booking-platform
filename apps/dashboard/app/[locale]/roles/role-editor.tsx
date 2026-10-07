"use client";

import { useActionState } from "react";
import { Button, Field } from "@wlbp/ui-foundation";
import type { PermissionMetaV1 } from "@wlbp/api-contracts";

import { saveRoleAction, type RoleActionResult } from "./actions";

const initial: RoleActionResult = { ok: true };

export function RoleEditor({
  locale,
  permissions,
}: Readonly<{ locale: "en" | "ar"; permissions: readonly PermissionMetaV1[] }>) {
  const [result, action, pending] = useActionState(
    (_state: RoleActionResult, form: FormData) => saveRoleAction(form),
    initial,
  );
  const ar = locale === "ar";
  return (
    <form
      action={action}
      className="grid gap-4 rounded-xl border border-border bg-card p-5"
    >
      <input type="hidden" name="locale" value={locale} />
      <h2 className="text-lg font-semibold">
        {ar ? "إنشاء دور مخصص" : "Create custom role"}
      </h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Field>
          <label htmlFor="role-name-en">Name (English)</label>
          <input
            id="role-name-en"
            name="nameEn"
            required
            maxLength={80}
            className="input"
          />
        </Field>
        <Field>
          <label htmlFor="role-name-ar">الاسم بالعربية</label>
          <input
            id="role-name-ar"
            name="nameAr"
            required
            maxLength={80}
            className="input"
            dir="rtl"
          />
        </Field>
      </div>
      <Field>
        <label htmlFor="role-mode">{ar ? "نطاق الدور" : "Role scope"}</label>
        <select id="role-mode" name="mode" defaultValue="tenant" className="input">
          <option value="tenant">{ar ? "كل المواقع" : "All locations"}</option>
          <option value="assigned">
            {ar ? "المواقع المخصصة" : "Assigned locations"}
          </option>
        </select>
      </Field>
      <fieldset className="grid gap-2">
        <legend className="font-medium">{ar ? "الصلاحيات" : "Permissions"}</legend>
        {permissions
          .filter(
            (permission) =>
              !permission.reserved && permission.allowedGrantKinds.includes("direct"),
          )
          .map((permission) => (
            <label key={permission.key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="permission" value={permission.key} />
              <span>{permission.key}</span>
            </label>
          ))}
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
        type="submit"
        loading={pending}
        loadingLabel={ar ? "جارٍ الحفظ…" : "Saving…"}
      >
        {ar ? "حفظ الدور" : "Save role"}
      </Button>
    </form>
  );
}
