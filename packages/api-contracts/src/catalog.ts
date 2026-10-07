export type CatalogKindV1 = "service" | "category" | "location";
export interface CatalogMetadataV1 {
  readonly key: string;
  readonly category_id?: string | null;
  readonly location_ids?: readonly string[];
  readonly assignment_mode?:
    "fixed_staff" | "any_available" | "customer_choice" | "round_robin";
  readonly fixed_staff_id?: string | null;
  readonly resource_type_id?: string | null;
  readonly time_zone?: string;
  readonly sort_order?: number;
  readonly retire?: boolean;
}
export interface CatalogEntityV1 {
  readonly id: string;
  readonly kind: CatalogKindV1;
  readonly revision: number;
  readonly state: "draft" | "published" | "retired";
  readonly metadata: CatalogMetadataV1;
  readonly name_en: string;
  readonly name_ar: string;
  readonly description_en: string;
  readonly description_ar: string;
  readonly address_en: string;
  readonly address_ar: string;
  readonly duration_minutes: number;
  readonly buffer_before_minutes: number;
  readonly buffer_after_minutes: number;
  readonly price_minor: number;
  readonly currency: string;
  readonly tax_rate_bps: number;
  readonly payment_mode: "none" | "deposit" | "full";
  readonly booking_mode: "appointment" | "exclusive_resource";
  readonly approval_required: boolean;
  readonly policy: Readonly<Record<string, unknown>>;
  readonly policy_ar: Readonly<Record<string, unknown>>;
  readonly intake_schema: Readonly<Record<string, unknown>>;
  readonly intake_schema_ar: Readonly<Record<string, unknown>>;
}
export interface CatalogWorkspaceV1 {
  readonly tenantId: string;
  readonly canPublish: boolean;
  readonly entities: readonly CatalogEntityV1[];
  readonly staff: readonly { id: string; name: string }[];
  readonly resourceTypes: readonly { id: string; name: string }[];
}
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Invalid catalog contract");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("Invalid catalog text");
  return value;
}
function id(value: unknown): string {
  const v = text(value);
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(v))
    throw new Error("Invalid catalog identifier");
  return v;
}
function ids(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 10000)
    throw new Error("Invalid catalog collection");
  return value.map(id);
}
function integer(value: unknown, minimum = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum)
    throw new Error("Invalid catalog number");
  return value;
}
function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T))
    throw new Error("Invalid catalog state");
  return value as T;
}
function choiceList(value: unknown): { id: string; name: string }[] {
  if (!Array.isArray(value) || value.length > 10000)
    throw new Error("Invalid catalog choices");
  return value.map((entry) => {
    const r = record(entry);
    return { id: id(r.id), name: text(r.name) };
  });
}
export function parseCatalogWorkspaceV1(value: unknown): CatalogWorkspaceV1 {
  const r = record(value);
  if (
    r.version !== 1 ||
    typeof r.can_publish !== "boolean" ||
    !Array.isArray(r.entities) ||
    r.entities.length > 10000
  )
    throw new Error("Unsupported catalog workspace");
  return {
    tenantId: id(r.tenant_id),
    canPublish: r.can_publish,
    staff: choiceList(r.staff),
    resourceTypes: choiceList(r.resource_types),
    entities: r.entities.map((value) => {
      const e = record(value);
      const m = record(e.metadata);
      const kind = oneOf(e.kind, ["service", "category", "location"] as const);
      if (typeof e.approval_required !== "boolean")
        throw new Error("Invalid catalog approval mode");
      const metadata: CatalogMetadataV1 = {
        key: text(m.key),
        ...(kind === "service"
          ? {
              category_id: m.category_id == null ? null : id(m.category_id),
              location_ids: ids(m.location_ids),
              assignment_mode: oneOf(m.assignment_mode, [
                "fixed_staff",
                "any_available",
                "customer_choice",
                "round_robin",
              ] as const),
              fixed_staff_id: m.fixed_staff_id == null ? null : id(m.fixed_staff_id),
              resource_type_id:
                m.resource_type_id == null ? null : id(m.resource_type_id),
            }
          : {}),
        ...(kind === "location" ? { time_zone: text(m.time_zone) } : {}),
        ...(kind === "category" ? { sort_order: integer(m.sort_order) } : {}),
        ...(m.retire === true ? { retire: true } : {}),
      };
      return {
        id: id(e.id),
        kind,
        revision: integer(e.revision),
        state: oneOf(e.state, ["draft", "published", "retired"] as const),
        metadata,
        name_en: text(e.name_en),
        name_ar: text(e.name_ar),
        description_en: text(e.description_en),
        description_ar: text(e.description_ar),
        address_en: text(e.address_en),
        address_ar: text(e.address_ar),
        duration_minutes: integer(e.duration_minutes, 1),
        buffer_before_minutes: integer(e.buffer_before_minutes),
        buffer_after_minutes: integer(e.buffer_after_minutes),
        price_minor: integer(e.price_minor),
        currency: text(e.currency),
        tax_rate_bps: integer(e.tax_rate_bps),
        payment_mode: oneOf(e.payment_mode, ["none", "deposit", "full"] as const),
        booking_mode: oneOf(e.booking_mode, [
          "appointment",
          "exclusive_resource",
        ] as const),
        approval_required: e.approval_required,
        policy: record(e.policy),
        policy_ar: record(e.policy_ar),
        intake_schema: record(e.intake_schema),
        intake_schema_ar: record(e.intake_schema_ar),
      };
    }),
  };
}
