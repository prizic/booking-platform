export function isBookingInvalidation(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  const keys = ["booking_id", "booking_revision", "location_id", "starts_at", "status"];
  return (
    // realtime.send attaches a transport UUID; older transports omit it.
    Object.keys(r).every((key) => keys.includes(key) || key === "id") &&
    (r.id === undefined ||
      (typeof r.id === "string" && /^[a-f0-9-]{36}$/iu.test(r.id))) &&
    keys.every((key) => Object.hasOwn(r, key)) &&
    typeof r.booking_id === "string" &&
    /^[a-f0-9-]{36}$/iu.test(r.booking_id) &&
    typeof r.location_id === "string" &&
    /^[a-f0-9-]{36}$/iu.test(r.location_id) &&
    typeof r.booking_revision === "number" &&
    Number.isSafeInteger(r.booking_revision) &&
    r.booking_revision > 0 &&
    typeof r.starts_at === "string" &&
    Number.isFinite(Date.parse(r.starts_at)) &&
    typeof r.status === "string" &&
    r.status.length < 40
  );
}
