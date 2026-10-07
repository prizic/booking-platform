import { validCivilDate, shiftCivilDate } from "../calendar/calendar-range";
export const auditStreams = [
  "booking",
  "settings",
  "brand",
  "staff",
  "access",
  "catalog",
  "schedule",
  "integration",
] as const;
export function auditFilters(query: Record<string, string | string[] | undefined>) {
  const single = (key: string) => (typeof query[key] === "string" ? query[key] : "");
  const from = single("from"),
    to = single("to"),
    actor = single("actor");
  const stream = auditStreams.includes(
    single("stream") as (typeof auditStreams)[number],
  )
    ? single("stream")
    : null;
  let cursor: Record<string, string> | null = null;
  try {
    const raw = single("cursor");
    if (raw.length <= 500 && raw) {
      const value: unknown = JSON.parse(raw);
      if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new Error();
      const r = value as Record<string, unknown>;
      if (
        typeof r.time !== "string" ||
        !Number.isFinite(Date.parse(r.time)) ||
        typeof r.stream !== "string" ||
        !auditStreams.includes(r.stream as (typeof auditStreams)[number]) ||
        typeof r.id !== "string" ||
        !/^[a-f0-9-]{36}$/iu.test(r.id)
      )
        throw new Error();
      cursor = { time: r.time, stream: r.stream, id: r.id };
    }
  } catch {
    cursor = null;
  }
  return {
    stream,
    from: validCivilDate(from) ? `${from}T00:00:00Z` : null,
    to: validCivilDate(to) ? `${shiftCivilDate(to, 1)}T00:00:00Z` : null,
    actor: /^[a-f0-9-]{36}$/iu.test(actor) ? actor : null,
    cursor,
  };
}
