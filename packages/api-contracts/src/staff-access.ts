export type BuiltInStaffRole =
  "staff" | "scheduler" | "location_manager" | "tenant_admin";
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
export function parseStaffAccessWorkspaceV1(value: unknown): StaffAccessWorkspaceV1 {
  const row = object(value);
  if (row.version !== 1) throw new Error("Unsupported staff access contract");
  return {
    tenantId: id(row.tenant_id),
    roles: items(row.roles).map((value) => {
      const r = object(value);
      return {
        id: id(r.id),
        key: choice(r.key, [
          "staff",
          "scheduler",
          "location_manager",
          "tenant_admin",
        ] as const),
      };
    }),
    locations: items(row.locations).map((value) => {
      const r = object(value);
      return { id: id(r.id), name: text(r.name) };
    }),
    members: items(row.members).map((value) => {
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
    }),
    invitations: items(row.invitations).map((value) => {
      const r = object(value);
      const expiresAt = text(r.expires_at);
      if (!Number.isFinite(Date.parse(expiresAt)))
        throw new Error("Invalid invitation expiry");
      return {
        id: id(r.id),
        email: text(r.email),
        roleId: id(r.role_id),
        status: choice(r.status, [
          "pending",
          "accepted",
          "expired",
          "revoked",
        ] as const),
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
    }),
  };
}
