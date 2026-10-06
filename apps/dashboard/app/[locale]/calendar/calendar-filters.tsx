import type { Locale } from "@wlbp/i18n";
import type { OperationalChoices } from "../../_lib/operational-choices";
import { getDashboardMessage } from "../../_lib/copy";
import type { CalendarMode } from "./calendar-view";
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
  return (
    <form method="get" className="workspace-filter-bar">
      <fieldset>
        <legend>{m("calendarViewLabel")}</legend>
        {(["day", "week", "resource", "list"] as const).map((v) => (
          <label key={v}>
            <input name="view" type="radio" value={v} defaultChecked={view === v} />
            {m(
              v === "day"
                ? "calendarViewDay"
                : v === "week"
                  ? "calendarViewWeek"
                  : v === "resource"
                    ? "calendarViewResource"
                    : "calendarViewList",
            )}
          </label>
        ))}
      </fieldset>
      <label>
        {m("calendarDateLabel")}
        <input name="date" type="date" defaultValue={date} required />
      </label>
      {(["location", "staff", "service"] as const).map((kind) => (
        <label key={kind}>
          {m(
            kind === "location"
              ? "calendarFilterLocation"
              : kind === "staff"
                ? "calendarFilterStaff"
                : "calendarFilterService",
          )}
          <select name={kind} defaultValue={filters[`${kind}Id`] ?? ""}>
            <option value="">{m("calendarFilterAll")}</option>
            {(kind === "staff"
              ? [...new Map(choices.staff.map((c) => [c.id, c])).values()]
              : unique(kind)
            ).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      ))}
      <label>
        {locale === "ar" ? "المنطقة الزمنية" : "Timezone"}
        <select name="timeZone" defaultValue={timeZone}>
          {[...new Set([timeZone, ...choices.offers.map((o) => o.timeZone)])].map(
            (zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ),
          )}
        </select>
      </label>
      <button type="submit">{m("calendarFilterApply")}</button>
    </form>
  );
}
