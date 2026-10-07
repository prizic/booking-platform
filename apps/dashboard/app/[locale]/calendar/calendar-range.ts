import { canonicalizeTimeZone, resolveZonedLocalDateTime } from "@wlbp/i18n";
export function civilDate(instant: string | Date, timeZone: string): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: canonicalizeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (kind: string) => p.find((part) => part.type === kind)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function validCivilDate(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(day)) return false;
  const d = new Date(`${day}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === day;
}
export function shiftCivilDate(day: string, count: number): string {
  if (!validCivilDate(day) || !Number.isInteger(count))
    throw new RangeError("Invalid civil date");
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + count);
  return d.toISOString().slice(0, 10);
}
function boundary(day: string, timeZone: string): string {
  const [year, month, date] = day.split("-").map(Number);
  for (let minute = 0; minute < 1440; minute++) {
    const r = resolveZonedLocalDateTime(
      {
        year: year!,
        month: month!,
        day: date!,
        hour: Math.floor(minute / 60),
        minute: minute % 60,
        second: 0,
      },
      timeZone,
    );
    if (r.kind !== "gap") return r.instants[0];
  }
  throw new RangeError("Skipped civil date");
}
export function calendarRange(
  day: string,
  timeZone: string,
  days = 1,
): { from: string; to: string } {
  if (!validCivilDate(day) || !Number.isInteger(days) || days < 1 || days > 7)
    throw new RangeError("Invalid calendar range");
  const zone = canonicalizeTimeZone(timeZone);
  return { from: boundary(day, zone), to: boundary(shiftCivilDate(day, days), zone) };
}
