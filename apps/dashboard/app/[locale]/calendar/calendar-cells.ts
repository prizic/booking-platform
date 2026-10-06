import { calendarRange, civilDate } from "./calendar-range";
/** Start-hour placement also includes appointments already in progress at midnight. */
export function occupiesStartCell(
  startAt: string,
  endAt: string,
  day: string,
  hour: number,
  timeZone: string,
): boolean {
  const range = calendarRange(day, timeZone);
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  const midnight = new Date(range.from).getTime();
  if (start < midnight) return hour === 0 && end > midnight;
  return (
    civilDate(startAt, timeZone) === day &&
    Number(
      new Intl.DateTimeFormat("en", {
        timeZone,
        hour: "2-digit",
        hourCycle: "h23",
      }).format(new Date(startAt)),
    ) === hour
  );
}
