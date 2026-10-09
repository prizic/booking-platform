"use server";

import {
  grantScopeAllowedInMode,
  parseRoleMutationErrorV1,
  type GrantScopeV1,
  type RoleCatalogV1,
  type RoleGrantInputV1,
  type RoleModeV1,
  type RoleMutationErrorCodeV1,
} from "@wlbp/api-contracts";
import type { Locale } from "@wlbp/i18n";
import { revalidatePath } from "next/cache";

import { loadDashboardRequestAccess } from "../../_lib/dashboard-server";
import { DashboardRpcError } from "../../_lib/dashboard-data-source";

export type RoleActionResult = Readonly<{ ok: boolean; message?: string }>;

function text(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

function locale(form: FormData): Locale {
  return text(form, "locale") === "ar" ? "ar" : "en";
}

const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;

function invalidRequestMessage(ar: boolean): string {
  return ar
    ? "طلب الدور غير مكتمل. أعد التحميل وحاول مرة أخرى."
    : "This role request is incomplete. Reload and try again.";
}

/**
 * The idempotency key the form was rendered with. Every editor is rendered
 * with its own key (see `roles/page.tsx`), so a repeated submit replays one
 * mutation while a fresh render starts a new one. A present-but-malformed key
 * fails closed; an absent key (older render, unit harness) falls back to a
 * fresh one.
 */
function attemptId(form: FormData): string | null {
  const raw = text(form, "requestId");
  if (raw === "") return crypto.randomUUID();
  return uuidPattern.test(raw) ? raw : null;
}

/**
 * The database publishes one stable string per refusal (see `docs/roles.md`),
 * and `DashboardRpcError` carries it in `stableMessage`; `message` holds only
 * the SQLSTATE. Branching on `message` therefore never matched, and every
 * refusal read as the generic "could not be saved".
 */
function stableRefusal(error: unknown): RoleMutationErrorCodeV1 | null {
  if (!(error instanceof DashboardRpcError)) return null;
  return parseRoleMutationErrorV1({ message: error.stableMessage })?.code ?? null;
}

function errorMessage(value: unknown, ar: boolean): string {
  const say = (en: string, translated: string) => (ar ? translated : en);
  switch (stableRefusal(value)) {
    case "step_up_required":
      return say(
        "Recent MFA is required for this action.",
        "يتطلب هذا الإجراء تحققًا إضافيًا.",
      );
    case "escalation_denied":
      return say(
        "You cannot grant permissions beyond your own.",
        "لا يمكنك منح صلاحيات تتجاوز صلاحياتك.",
      );
    case "role_locked":
      return say(
        "Built-in roles cannot be changed. Duplicate it instead.",
        "لا يمكن تغيير الأدوار المضمنة. انسخ الدور بدلًا من ذلك.",
      );
    case "role_in_use":
      return say(
        "This role is still assigned to members or a pending invitation.",
        "لا يزال هذا الدور مُسندًا إلى أعضاء أو دعوة قيد الانتظار.",
      );
    case "role_scope_in_use":
      return say(
        "A member on this role has no location, so it cannot become location-scoped.",
        "عضو بهذا الدور بلا موقع، لذا لا يمكن جعل النطاق خاصًا بالمواقع.",
      );
    case "last_administrator_required":
      return say(
        "The workspace must keep at least one administrator.",
        "يجب أن تحتفظ مساحة العمل بمسؤول واحد على الأقل.",
      );
    case "revision_conflict":
      return say(
        "Someone else changed this role. Reload and try again.",
        "قام شخص آخر بتغيير هذا الدور. أعد التحميل وحاول مرة أخرى.",
      );
    case "idempotency_conflict":
      return say(
        "This request was already submitted with different values. Reload and try again.",
        "تم إرسال هذا الطلب سابقًا بقيم مختلفة. أعد التحميل وحاول مرة أخرى.",
      );
    case "role_name_taken":
      return say(
        "Another active role already uses this name.",
        "يستخدم دور نشط آخر هذا الاسم.",
      );
    case "role_archived":
      return say("This role is already archived.", "هذا الدور مؤرشف بالفعل.");
    case "permission_reserved":
    case "grant_not_allowed":
    case "scope_mode_mismatch":
      return say(
        "That combination of permissions and scope is not allowed.",
        "تركيبة الصلاحيات والنطاق هذه غير مسموح بها.",
      );
    case "invalid_request":
      return say(
        "This role request is invalid. Reload and try again.",
        "طلب الدور غير صالح. أعد التحميل وحاول مرة أخرى.",
      );
    case "not_authorized":
      return say("You are not allowed to manage roles.", "غير مصرح لك بإدارة الأدوار.");
    case "role_key_immutable":
      return say(
        "Role keys cannot be changed. Duplicate it instead.",
        "لا يمكن تغيير مفاتيح الأدوار. انسخ الدور بدلًا من ذلك.",
      );
    default:
      return say("The role could not be saved.", "تعذر حفظ الدور.");
  }
}

function workspaceScopeMessage(ar: boolean, keys: readonly string[]): string {
  return ar
    ? `هذه الصلاحيات على مستوى مساحة العمل ولا يمكن استخدامها مع نطاق المواقع المخصصة: ${keys.join(", ")}. أزلها أو بدّل إلى كل المواقع.`
    : `These permissions are workspace-wide and cannot be used with the Assigned locations scope: ${keys.join(", ")}. Remove them or switch to All locations.`;
}

function choosePermissionMessage(ar: boolean): string {
  return ar
    ? "اختر صلاحية واحدة على الأقل قبل الحفظ."
    : "Choose at least one permission before saving.";
}

type RoleGrants = Readonly<{
  grants: readonly RoleGrantInputV1[];
  /**
   * Selected permissions no scope can express in this mode (tenant-only keys
   * while `assigned`). These fail the whole save: persisting the rest would
   * report success while silently dropping the operator's selection.
   */
  incompatible: readonly string[];
}>;

/**
 * One scope per permission, never one scope for all grants. In BOTH modes a
 * carried-over scope the catalog still allows in this mode is kept — so an
 * edit that only renames never narrows or broadens an existing grant (tenant
 * mode allows `own` as well as `tenant`; see `grantScopeAllowedInMode`).
 * Otherwise the narrowest default the mode expresses: `tenant` before `own`
 * in tenant mode, `own` before `location` in assigned mode. A forged or
 * carried-over tenant-only selection is reported, not filtered.
 */
function grants(form: FormData, catalog: RoleCatalogV1, mode: RoleModeV1): RoleGrants {
  const selected = new Set(form.getAll("permission").map(String));
  const grants: RoleGrantInputV1[] = [];
  const incompatible: string[] = [];
  for (const permission of catalog.permissions) {
    if (
      !selected.has(permission.key) ||
      permission.reserved ||
      !permission.allowedGrantKinds.includes("direct")
    )
      continue;
    const hint = text(form, `scope:${permission.key}`);
    if (
      hint !== "" &&
      (permission.allowedScopes as readonly string[]).includes(hint) &&
      grantScopeAllowedInMode(mode, hint as GrantScopeV1)
    ) {
      grants.push({
        permissionKey: permission.key,
        grantKind: "direct",
        scope: hint as GrantScopeV1,
      });
    } else if (mode === "tenant") {
      if (permission.allowedScopes.includes("tenant")) {
        grants.push({
          permissionKey: permission.key,
          grantKind: "direct",
          scope: "tenant",
        });
      } else if (permission.allowedScopes.includes("own")) {
        grants.push({
          permissionKey: permission.key,
          grantKind: "direct",
          scope: "own",
        });
      } else {
        incompatible.push(permission.key);
      }
    } else if (permission.allowedScopes.includes("own")) {
      grants.push({ permissionKey: permission.key, grantKind: "direct", scope: "own" });
    } else if (permission.allowedScopes.includes("location")) {
      grants.push({
        permissionKey: permission.key,
        grantKind: "direct",
        scope: "location",
      });
    } else {
      incompatible.push(permission.key);
    }
  }
  return { grants, incompatible };
}

type RoleTarget =
  | { readonly kind: "create" }
  | {
      readonly kind: "update";
      readonly roleId: string;
      readonly expectedRevision: number;
    }
  | { readonly kind: "invalid" };

/**
 * `buildSaveRoleV1Request` requires the role id and the revision together, and
 * the database treats a missing `p_role_id` as "create". A partial target —
 * an id without a revision, a revision without an id, or a malformed either —
 * therefore fails closed here instead of accidentally creating a new role.
 * The form carries whichever the editor rendered, so a stale tab sends a
 * revision the database no longer holds and is refused rather than
 * overwriting.
 */
function roleTarget(form: FormData): RoleTarget {
  const roleId = text(form, "roleId");
  const revisionText = text(form, "revision");
  if (roleId === "" && revisionText === "") return { kind: "create" };
  const revision = Number(revisionText);
  if (!uuidPattern.test(roleId) || !Number.isInteger(revision) || revision < 1)
    return { kind: "invalid" };
  return { kind: "update", roleId, expectedRevision: revision };
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

  const target = roleTarget(form);
  if (target.kind === "invalid")
    return { ok: false, message: invalidRequestMessage(ar) };
  const key = attemptId(form);
  if (key === null) return { ok: false, message: invalidRequestMessage(ar) };
  const rawSource = text(form, "sourceRoleId");
  if (rawSource !== "" && !uuidPattern.test(rawSource))
    return { ok: false, message: invalidRequestMessage(ar) };

  try {
    const tenantId = request.state.context.tenantId;
    const catalog = await request.source.getRoleCatalog(tenantId);
    const mode = text(form, "mode") === "assigned" ? "assigned" : "tenant";
    const { grants: grantList, incompatible } = grants(form, catalog, mode);
    if (incompatible.length > 0)
      return { ok: false, message: workspaceScopeMessage(ar, incompatible) };
    if (grantList.length === 0)
      return { ok: false, message: choosePermissionMessage(ar) };
    // `p_source_role_id` only records where the copy came from: the grants are
    // always the ones the editor submitted, exactly as for a create.
    await request.source.saveRole({
      tenantId,
      requestId: key,
      roleId: target.kind === "update" ? target.roleId : null,
      expectedRevision: target.kind === "update" ? target.expectedRevision : null,
      sourceRoleId: target.kind === "create" ? rawSource || null : null,
      nameEn: text(form, "nameEn"),
      nameAr: text(form, "nameAr"),
      descriptionEn: text(form, "descriptionEn") || null,
      descriptionAr: text(form, "descriptionAr") || null,
      mode,
      grants: grantList,
    });
    revalidatePath(`/${currentLocale}/roles`);
    return {
      ok: true,
      message: ar
        ? target.kind === "create"
          ? "تم حفظ الدور."
          : "تم تحديث الدور."
        : target.kind === "create"
          ? "Role saved."
          : "Role updated.",
    };
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
  const roleId = text(form, "roleId");
  const expectedRevision = Number(text(form, "revision"));
  if (
    !uuidPattern.test(roleId) ||
    !Number.isInteger(expectedRevision) ||
    expectedRevision < 1
  )
    return { ok: false, message: invalidRequestMessage(ar) };
  const key = attemptId(form);
  if (key === null) return { ok: false, message: invalidRequestMessage(ar) };
  try {
    await request.source.archiveRole({
      tenantId: request.state.context.tenantId,
      requestId: key,
      roleId,
      expectedRevision,
    });
    revalidatePath(`/${currentLocale}/roles`);
    return { ok: true, message: ar ? "تمت أرشفة الدور." : "Role archived." };
  } catch (error) {
    return { ok: false, message: errorMessage(error, ar) };
  }
}
