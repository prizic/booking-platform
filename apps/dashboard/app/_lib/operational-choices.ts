export interface OperationalChoices {
  readonly offers: readonly {
    readonly id: string;
    readonly name: string;
    readonly locationId: string;
    readonly locationName: string;
    readonly timeZone: string;
    readonly paymentMode: "none" | "deposit" | "full";
    readonly approvalRequired: boolean;
    readonly canCreate: boolean;
  }[];
  readonly staff: readonly {
    readonly id: string;
    readonly name: string;
    readonly locationId: string;
  }[];
  readonly resources: readonly {
    readonly id: string;
    readonly name: string;
    readonly locationId: string;
  }[];
}
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Invalid operational choices");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value) throw new Error("Invalid choice text");
  return value;
}
function id(value: unknown): string {
  const v = text(value);
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(v))
    throw new Error("Invalid choice identifier");
  return v;
}
export function parseOperationalChoices(value: unknown): OperationalChoices {
  const r = record(value);
  for (const key of ["offers", "staff", "resources"])
    if (!Array.isArray(r[key]) || (r[key] as unknown[]).length > 10000)
      throw new Error("Invalid choice list");
  const choices = (raw: unknown) =>
    (raw as unknown[]).map((v) => {
      const row = record(v);
      return { id: id(row.id), name: text(row.name), locationId: id(row.location_id) };
    });
  return {
    staff: choices(r.staff),
    resources: choices(r.resources),
    offers: (r.offers as unknown[]).map((v) => {
      const row = record(v);
      if (
        !["none", "deposit", "full"].includes(String(row.payment_mode)) ||
        typeof row.can_create !== "boolean" ||
        typeof row.approval_required !== "boolean"
      )
        throw new Error("Invalid offer");
      return {
        ...choices([row])[0]!,
        locationName: text(row.location_name),
        timeZone: text(row.time_zone),
        paymentMode: row.payment_mode as "none" | "deposit" | "full",
        approvalRequired: row.approval_required,
        canCreate: row.can_create,
      };
    }),
  };
}
