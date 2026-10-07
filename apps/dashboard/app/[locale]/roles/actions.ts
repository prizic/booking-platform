"use server";

import {
  type GrantScopeV1,
  type RoleCatalogV1,
  type RoleModeV1,
} from "@wlbp/api-contracts";
import type { Locale } from "@wlbp/i18n";
import { revalidatePath } from "next/cache";

import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";

export type RoleActionResult = Readonly<{ ok: boolean; message?: string }>;

function text(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

function locale(form: FormData): Locale {
  return text(form, "locale") === "ar" ? "ar" : "en";
}

function requestId(): string {
  return crypto.randomUUID();
}

function errorMessage(value: unknown, ar: boolean): string {
  const message = value instanceof Error ? value.message : "";
  if (message.includes("step_up_required"))
    return ar
      ? "يتطلب هذا الإجراء تحققًا إضافيًا."
      : "Recent MFA is required for this action.";
  if (message.includes("escalation_denied"))
    return ar
      ? "لا يمكنك منح صلاحيات تتجاوز صلاحياتك."
      : "You cannot grant permissions beyond your own.";
  return ar ? "تعذر حفظ الدور." : "The role could not be saved.";
}

function grants(form: FormData, catalog: RoleCatalogV1, mode: RoleModeV1) {
  const selected = new Set(form.getAll("permission").map(String));
  const scope: GrantScopeV1 = mode === "tenant" ? "tenant" : "own";
  return catalog.permissions
    .filter(
      (permission) =>
        selected.has(permission.key) &&
        !permission.reserved &&
        permission.allowedGrantKinds.includes("direct") &&
        permission.allowedScopes.includes(scope),
    )
    .map((permission) => ({
      permissionKey: permission.key,
      grantKind: "direct" as const,
      scope,
    }));
}

export async function saveRoleAction(form: FormData): Promise<RoleActionResult> {
  const currentLocale = locale(form);
  const ar = currentLocale === "ar";
  const request = await loadDashboardRequestAccess(currentLocale);
  if (
    request.source === null ||
    request.state.kind !== "ready" ||
    request.source.getRoleCatalog === undefined ||
    request.source.saveRole === undefined
  )
    return {
      ok: false,
      message: ar ? "مساحة العمل غير متاحة." : "Workspace unavailable.",
    };

  try {
    const tenantId = request.state.context.tenantId;
    const catalog = await request.source.getRoleCatalog(tenantId);
    const mode = text(form, "mode") === "assigned" ? "assigned" : "tenant";
    await request.source.saveRole({
      tenantId,
      requestId: requestId(),
      roleId: null,
      expectedRevision: null,
      sourceRoleId: text(form, "sourceRoleId") || null,
      nameEn: text(form, "nameEn"),
      nameAr: text(form, "nameAr"),
      descriptionEn: text(form, "descriptionEn") || null,
      descriptionAr: text(form, "descriptionAr") || null,
      mode,
      grants: grants(form, catalog, mode),
    });
    revalidatePath(`/${currentLocale}/roles`);
    return { ok: true, message: ar ? "تم حفظ الدور." : "Role saved." };
  } catch (error) {
    return { ok: false, message: errorMessage(error, ar) };
  }
}

export async function archiveRoleAction(form: FormData): Promise<RoleActionResult> {
  const currentLocale = locale(form);
  const ar = currentLocale === "ar";
  const request = await loadDashboardRequestAccess(currentLocale);
  if (
    request.source === null ||
    request.state.kind !== "ready" ||
    request.source.archiveRole === undefined
  )
    return {
      ok: false,
      message: ar ? "مساحة العمل غير متاحة." : "Workspace unavailable.",
    };
  try {
    await request.source.archiveRole({
      tenantId: request.state.context.tenantId,
      requestId: requestId(),
      roleId: text(form, "roleId"),
      expectedRevision: Number(text(form, "revision")),
    });
    revalidatePath(`/${currentLocale}/roles`);
    return { ok: true, message: ar ? "تمت أرشفة الدور." : "Role archived." };
  } catch (error) {
    return { ok: false, message: errorMessage(error, ar) };
  }
}
