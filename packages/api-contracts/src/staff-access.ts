import {
  builtInRoleKeys,
  customRoleKeyPattern,
  roleModesV1,
  roleNameMaxLengthV1,
  type BuiltInRoleKey,
  type RoleModeV1,
} from "./roles.js";

/** Built-in role keys; kept for localized built-in labels. */
export type BuiltInStaffRole = BuiltInRoleKey;
export interface StaffAccessMemberV1 {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly roleId: string;
  readonly status: "active" | "suspended" | "revoked";
  readonly revision: number;
  readonly locationIds: readonly string[];
}
export interface StaffAccessInvitationV1 {
  readonly id: string;
  readonly email: string;
  readonly roleId: string;
  readonly status: "pending" | "accepted" | "expired" | "revoked";
  readonly revision: number;
  readonly expiresAt: string;
  readonly locationIds: readonly string[];
  readonly deliveryStatus:
    "queued" | "sending" | "sent" | "failed" | "superseded" | "unconfigured";
}
interface StaffRoleBaseV2 {
  readonly id: string;
  readonly mode: RoleModeV1;
  /** Server-computed: the current actor may assign this role. */
  readonly assignable: boolean;
}
export type StaffRoleV2 =
  | (StaffRoleBaseV2 & { readonly kind: "builtin"; readonly key: BuiltInRoleKey })
  | (StaffRoleBaseV2 & {
      readonly kind: "custom";
      readonly key: string;
      readonly nameEn: string;
      readonly nameAr: string;
      readonly archivedAt: string | null;
    });
export interface StaffAccessWorkspaceV2 {
  readonly tenantId: string;
  readonly roles: readonly StaffRoleV2[];
  readonly locations: readonly { id: string; name: string }[];
  readonly members: readonly StaffAccessMemberV1[];
  readonly invitations: readonly StaffAccessInvitationV1[];
}
export interface StaffAccessWorkspaceV1 {
  readonly tenantId: string;
  readonly roles: readonly { id: string; key: BuiltInStaffRole }[];
  readonly locations: readonly { id: string; name: string }[];
  readonly members: readonly StaffAccessMemberV1[];
  readonly invitations: readonly StaffAccessInvitationV1[];
}
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Invalid staff access contract");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || value.length > 1024)
    throw new Error("Invalid staff access contract");
  return value;
}
function id(value: unknown): string {
  const result = text(value);
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(result))
    throw new Error("Invalid staff access identifier");
  return result;
}
function items(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 10000)
    throw new Error("Invalid staff access collection");
  return value;
}
function revision(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
    throw new Error("Invalid staff access revision");
  return value;
}
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  if (typeof value !== "string" || !choices.includes(value as T))
    throw new Error("Invalid staff access state");
  return value as T;
}
function parseMember(value: unknown): StaffAccessMemberV1 {
  const r = object(value);
  return {
    id: id(r.id),
    name: text(r.name),
    email: text(r.email),
    roleId: id(r.role_id),
    status: choice(r.status, ["active", "suspended", "revoked"] as const),
    revision: revision(r.revision),
    locationIds: items(r.location_ids).map(id),
  };
}
function parseInvitation(value: unknown): StaffAccessInvitationV1 {
  const r = object(value);
  const expiresAt = text(r.expires_at);
  if (!Number.isFinite(Date.parse(expiresAt)))
    throw new Error("Invalid invitation expiry");
  return {
    id: id(r.id),
    email: text(r.email),
    roleId: id(r.role_id),
    status: choice(r.status, ["pending", "accepted", "expired", "revoked"] as const),
    revision: revision(r.revision),
    expiresAt,
    locationIds: items(r.location_ids).map(id),
    deliveryStatus: choice(r.delivery_status, [
      "queued",
      "sending",
      "sent",
      "failed",
      "superseded",
      "unconfigured",
    ] as const),
  };
}
function parseLocation(value: unknown): { id: string; name: string } {
  const r = object(value);
  return { id: id(r.id), name: text(r.name) };
}
export function parseStaffAccessWorkspaceV1(value: unknown): StaffAccessWorkspaceV1 {
  const row = object(value);
  if (row.version !== 1) throw new Error("Unsupported staff access contract");
  return {
    tenantId: id(row.tenant_id),
    roles: items(row.roles).map((value) => {
      const r = object(value);
      return { id: id(r.id), key: choice(r.key, builtInRoleKeys) };
    }),
    locations: items(row.locations).map(parseLocation),
    members: items(row.members).map(parseMember),
    invitations: items(row.invitations).map(parseInvitation),
  };
}
function exactKeys(row: Record<string, unknown>, keys: readonly string[]): void {
  const actual = Object.keys(row).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  )
    throw new Error("Invalid staff access contract");
}
function roleName(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    value.length > roleNameMaxLengthV1
  )
    throw new Error("Invalid staff access role name");
  return value;
}
function parseRoleV2(value: unknown): StaffRoleV2 {
  const r = object(value);
  exactKeys(r, [
    "id",
    "key",
    "is_builtin",
    "name_en",
    "name_ar",
    "location_scope_mode",
    "archived_at",
    "assignable",
  ]);
  if (typeof r.is_builtin !== "boolean" || typeof r.assignable !== "boolean")
    throw new Error("Invalid staff access role");
  const base = {
    id: id(r.id),
    mode: choice(r.location_scope_mode, roleModesV1),
    assignable: r.assignable,
  };
  if (r.is_builtin) {
    if (r.name_en !== null || r.name_ar !== null || r.archived_at !== null)
      throw new Error("Invalid built-in staff access role");
    return { kind: "builtin", key: choice(r.key, builtInRoleKeys), ...base };
  }
  if (typeof r.key !== "string" || !customRoleKeyPattern.test(r.key))
    throw new Error("Invalid custom staff access role");
  let archivedAt: string | null = null;
  if (r.archived_at !== null) {
    archivedAt = text(r.archived_at);
    if (!Number.isFinite(Date.parse(archivedAt)))
      throw new Error("Invalid staff access role archive time");
  }
  return {
    kind: "custom",
    key: r.key,
    nameEn: roleName(r.name_en),
    nameAr: roleName(r.name_ar),
    archivedAt,
    ...base,
  };
}
/**
 * Version 2 lists built-in and custom roles. Archived and non-assignable roles
 * are returned so existing members still show their role; the UI must not
 * offer them as choices. The server re-checks every assignment.
 */
export function parseStaffAccessWorkspaceV2(value: unknown): StaffAccessWorkspaceV2 {
  const row = object(value);
  if (row.version !== 2) throw new Error("Unsupported staff access contract");
  const roles = items(row.roles).map(parseRoleV2);
  if (new Set(roles.map((role) => role.id)).size !== roles.length)
    throw new Error("Duplicate staff access role");
  return {
    tenantId: id(row.tenant_id),
    roles,
    locations: items(row.locations).map(parseLocation),
    members: items(row.members).map(parseMember),
    invitations: items(row.invitations).map(parseInvitation),
  };
}
