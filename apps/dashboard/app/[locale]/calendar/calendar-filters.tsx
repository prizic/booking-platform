import type { Locale } from "@wlbp/i18n";
import {
  Button,
  DatePicker,
  Field,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Toolbar,
  cn,
} from "@wlbp/ui-foundation";
import Link from "next/link";
import type { OperationalChoices } from "../../_lib/operational-choices";
import { getDashboardMessage } from "../../_lib/copy";
import { workspaceMessage } from "../../_lib/workspace-copy";
import type { CalendarMode } from "./calendar-view";

/**
 * Radix Select cannot carry an empty value, so "every location/staff/service"
 * submits this sentinel. The page only accepts ids it can find among the
 * member's own choices, so the sentinel reads as "no filter" there.
 */
export const allChoicesValue = "all";

const viewKeys = {
  day: "calendarViewDay",
  week: "calendarViewWeek",
  resource: "calendarViewResource",
  list: "calendarViewList",
} as const;

export function CalendarFilters({
  locale,
  choices,
  date,
  view,
  timeZone,
  filters,
}: {
  locale: Locale;
  choices: OperationalChoices;
  date: string;
  view: CalendarMode;
  timeZone: string;
  filters: {
    locationId: string | null;
    staffId: string | null;
    serviceId: string | null;
  };
}) {
  const m = (key: Parameters<typeof getDashboardMessage>[1]) =>
    getDashboardMessage(locale, key);
  const unique = (kind: "location" | "service") => [
    ...new Map(
      choices.offers.map((o) => [
        kind === "location" ? o.locationId : o.id,
        {
          id: kind === "location" ? o.locationId : o.id,
          name: kind === "location" ? o.locationName : o.name,
        },
      ]),
    ).values(),
  ];
  const viewHref = (target: CalendarMode) =>
    `/${locale}/calendar?${new URLSearchParams({
      view: target,
      date,
      timeZone,
      ...(filters.locationId ? { location: filters.locationId } : {}),
      ...(filters.staffId ? { staff: filters.staffId } : {}),
      ...(filters.serviceId ? { service: filters.serviceId } : {}),
    })}`;
  return (
    <div className="grid gap-4">
      <nav aria-label={m("calendarViewLabel")}>
        <ul className="inline-flex w-fit flex-wrap items-center gap-1 rounded-lg bg-neutral-2 p-1">
          {(["day", "week", "resource", "list"] as const).map((target) => (
            <li key={target}>
              <Link
                href={viewHref(target)}
                aria-current={view === target ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center justify-center rounded-md px-4 text-sm font-semibold whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40",
                  "aria-[current=page]:bg-card aria-[current=page]:text-foreground aria-[current=page]:shadow-sm",
                )}
              >
                {m(viewKeys[target])}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <form method="get" aria-label={workspaceMessage(locale, "filtersLabel")}>
        <input name="view" type="hidden" value={view} />
        <Toolbar>
          <Field>
            <Label htmlFor="calendar-date">{m("calendarDateLabel")}</Label>
            <DatePicker
              id="calendar-date"
              name="date"
              locale={locale}
              defaultValue={date}
              placeholder={workspaceMessage(locale, "datePlaceholder")}
              required
            />
          </Field>
          {(["location", "staff", "service"] as const).map((kind) => (
            <Field key={kind}>
              <Label htmlFor={`calendar-${kind}`}>
                {m(
                  kind === "location"
                    ? "calendarFilterLocation"
                    : kind === "staff"
                      ? "calendarFilterStaff"
                      : "calendarFilterService",
                )}
              </Label>
              <Select
                name={kind}
                defaultValue={filters[`${kind}Id`] ?? allChoicesValue}
              >
                <SelectTrigger id={`calendar-${kind}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={allChoicesValue}>
                    {m("calendarFilterAll")}
                  </SelectItem>
                  {(kind === "staff"
                    ? [...new Map(choices.staff.map((c) => [c.id, c])).values()]
                    : unique(kind)
                  ).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ))}
          <Field>
            <Label htmlFor="calendar-time-zone">
              {workspaceMessage(locale, "timeZoneLabel")}
            </Label>
            <Select name="timeZone" defaultValue={timeZone}>
              <SelectTrigger id="calendar-time-zone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[...new Set([timeZone, ...choices.offers.map((o) => o.timeZone)])].map(
                  (zone) => (
                    <SelectItem key={zone} value={zone}>
                      <bdi>{zone}</bdi>
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </Field>
          <Button type="submit">{m("calendarFilterApply")}</Button>
        </Toolbar>
      </form>
    </div>
  );
}
