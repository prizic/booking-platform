import { parseCurrencyMinorUnits } from "@wlbp/i18n";
import type { CatalogEntityV1, CatalogKindV1 } from "@wlbp/api-contracts";

export function catalogDraftDocument(
  kind: CatalogKindV1,
  form: FormData,
  base: CatalogEntityV1 | undefined,
  fullAccess: boolean,
): Record<string, unknown> | null {
  const document: Record<string, unknown> = base
    ? { ...base }
    : {
        metadata: {},
        name_en: "",
        name_ar: "",
        description_en: "",
        description_ar: "",
        address_en: "",
        address_ar: "",
        duration_minutes: 30,
        buffer_before_minutes: 0,
        buffer_after_minutes: 0,
        price_minor: 0,
        currency: "USD",
        tax_rate_bps: 0,
        payment_mode: "none",
        booking_mode: "appointment",
        approval_required: false,
        policy: {},
        policy_ar: {},
        intake_schema: { fields: [] },
        intake_schema_ar: { fields: [] },
      };
  delete document.id;
  delete document.kind;
  delete document.revision;
  delete document.state;
  for (const key of ["name_en", "name_ar", "description_en", "description_ar"]) {
    const value = form.get(key);
    if (
      typeof value !== "string" ||
      value.length > (key.startsWith("name") ? 160 : 2000) ||
      (key.startsWith("name") && !value.trim())
    )
      return null;
    document[key] = key.startsWith("name") ? value.trim() : value;
  }
  if (!fullAccess) return base ? document : null;
  const key = form.get("key");
  if (
    typeof key !== "string" ||
    key.length > 100 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(key)
  )
    return null;
  const metadata: Record<string, unknown> = {
    ...base?.metadata,
    key,
    ...(form.get("retire") === "yes" ? { retire: true } : { retire: false }),
  };
  document.metadata = metadata;
  const integer = (name: string, min: number, max: number): number | null => {
    const value = form.get(name);
    if (typeof value !== "string" || !/^\d+$/u.test(value)) return null;
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= min && number <= max
      ? number
      : null;
  };
  if (kind === "category") {
    const order = integer("sort_order", 0, 100000);
    if (order === null) return null;
    metadata.sort_order = order;
  }
  if (kind === "location") {
    const zone = form.get("time_zone");
    if (typeof zone !== "string" || zone.length > 100) return null;
    try {
      new Intl.DateTimeFormat("en", { timeZone: zone }).format();
    } catch {
      return null;
    }
    metadata.time_zone = zone;
    for (const key of ["address_en", "address_ar"]) {
      const value = form.get(key);
      if (typeof value !== "string" || value.length > 2000) return null;
      document[key] = value;
    }
  }
  if (kind === "service") {
    const currency = form.get("currency");
    const price = form.get("price");
    if (currency !== "USD" || typeof price !== "string") return null;
    const amount = parseCurrencyMinorUnits(price, currency);
    if (amount === null) return null;
    document.price_minor = amount;
    document.currency = currency;
    for (const [key, min, max] of [
      ["duration_minutes", 1, 1440],
      ["buffer_before_minutes", 0, 1440],
      ["buffer_after_minutes", 0, 1440],
      ["tax_rate_bps", 0, 3000],
    ] as const) {
      const value = integer(key, min, max);
      if (value === null) return null;
      document[key] = value;
    }
    const payment = form.get("payment_mode");
    const booking = form.get("booking_mode");
    const assignment = form.get("assignment_mode");
    if (
      typeof payment !== "string" ||
      !["none", "deposit", "full"].includes(payment) ||
      typeof booking !== "string" ||
      !["appointment", "exclusive_resource"].includes(booking) ||
      typeof assignment !== "string" ||
      !["any_available", "fixed_staff", "customer_choice", "round_robin"].includes(
        assignment,
      )
    )
      return null;
    document.payment_mode = payment;
    document.booking_mode = booking;
    document.approval_required = form.get("approval_required") === "yes";
    metadata.assignment_mode = assignment;
    const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
    for (const name of ["category_id", "fixed_staff_id", "resource_type_id"]) {
      const value = form.get(name);
      if (typeof value !== "string" || (value && !uuid.test(value))) return null;
      metadata[name] = value || null;
    }
    if (assignment !== "fixed_staff") metadata.fixed_staff_id = null;
    const locations = form.getAll("location_ids");
    if (
      !locations.length ||
      locations.length > 100 ||
      locations.some((value) => typeof value !== "string" || !uuid.test(value))
    )
      return null;
    metadata.location_ids = locations;
    const consentVersion = form.get("consent_version");
    if (
      typeof consentVersion !== "string" ||
      !consentVersion.trim() ||
      consentVersion.length > 40
    )
      return null;
    const deposit = integer("deposit_percent_bps", 0, 10000);
    if (deposit === null) return null;
    for (const locale of ["en", "ar"] as const) {
      const consent = form.get(`consent_${locale}`);
      if (typeof consent !== "string" || !consent.trim() || consent.length > 10000)
        return null;
      document[locale === "en" ? "policy" : "policy_ar"] = {
        ...(locale === "en" ? base?.policy : base?.policy_ar),
        consent_text: consent,
        consent_version: consentVersion,
        deposit_percent_bps: deposit,
      };
      delete (
        document[locale === "en" ? "policy" : "policy_ar"] as Record<string, unknown>
      ).deposit_minor_units;
    }
    const count = integer("intake_count", 0, 20);
    if (count === null) return null;
    const en: Record<string, unknown>[] = [];
    const ar: Record<string, unknown>[] = [];
    const keys = new Set<string>();
    for (let index = 0; index < count; index++) {
      const key = form.get(`intake_key.${index}`);
      const labelEn = form.get(`intake_en.${index}`);
      const labelAr = form.get(`intake_ar.${index}`);
      if (
        typeof key !== "string" ||
        !/^[a-z][a-z0-9_]{0,63}$/u.test(key) ||
        keys.has(key) ||
        typeof labelEn !== "string" ||
        !labelEn.trim() ||
        labelEn.length > 500 ||
        typeof labelAr !== "string" ||
        !labelAr.trim() ||
        labelAr.length > 500
      )
        return null;
      keys.add(key);
      const required = form.get(`intake_required.${index}`) === "yes";
      const previous = (schema: Record<string, unknown> | undefined) =>
        Array.isArray(schema?.fields)
          ? (schema.fields.find(
              (field: unknown) =>
                typeof field === "object" &&
                field !== null &&
                "key" in field &&
                field.key === key,
            ) as Record<string, unknown> | undefined)
          : undefined;
      en.push({
        ...previous(base?.intake_schema),
        key,
        label: labelEn,
        required,
        maxLength: previous(base?.intake_schema)?.maxLength ?? 2000,
      });
      ar.push({
        ...previous(base?.intake_schema_ar),
        key,
        label: labelAr,
        required,
        maxLength: previous(base?.intake_schema_ar)?.maxLength ?? 2000,
      });
    }
    document.intake_schema = { ...base?.intake_schema, fields: en };
    document.intake_schema_ar = { ...base?.intake_schema_ar, fields: ar };
  }
  return document;
}

export function catalogPriceInput(minor: number): string {
  if (!Number.isSafeInteger(minor) || minor < 0) throw new Error("Invalid price");
  const amount = BigInt(minor);
  return `${amount / 100n}.${String(amount % 100n).padStart(2, "0")}`;
}
