"use client";

import {
  parseAvailabilityV1Response,
  type AvailabilitySlotV1,
  type AvailabilityV1Response,
} from "@wlbp/api-contracts";
import { formatDateTime, resolveZonedLocalDateTime, type Locale } from "@wlbp/i18n";
import { Button, ErrorSummary, StatusMessage, Surface } from "@wlbp/ui-foundation";
import { useEffect, useState, type FormEvent } from "react";

import {
  AvailabilityResults,
  type AvailabilityResultsCopy,
} from "./availability-results";

export interface AvailabilityPickerCopy extends AvailabilityResultsCopy {
  readonly dateLabel: string;
  readonly error: string;
  readonly errorTitle: string;
  readonly partySizeLabel: string;
  readonly retry: string;
  readonly search: string;
  readonly searching: string;
  readonly selectedAnnouncement: string;
  readonly summary: string;
  readonly timeZoneLabel: string;
  readonly title: string;
  readonly unavailable: string;
}

interface AvailabilityPickerProps {
  readonly copy: AvailabilityPickerCopy;
  readonly locale: Locale;
  readonly locationId: string | null;
  readonly locationTimeZone: string;
  readonly serviceId: string | null;
}

function localMidnight(localDate: string, timeZone: string): string {
  const [year, month, day] = localDate.split("-").map(Number);
  const resolution = resolveZonedLocalDateTime(
    { year: year!, month: month!, day: day!, hour: 0, minute: 0 },
    timeZone,
  );
  if (resolution.kind === "gap") throw new Error("Invalid local date");
  return resolution.instants[0];
}

function addCalendarDays(localDate: string, days: number): string {
  const [year, month, day] = localDate.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day! + days));
  return [
    date.getUTCFullYear().toString().padStart(4, "0"),
    (date.getUTCMonth() + 1).toString().padStart(2, "0"),
    date.getUTCDate().toString().padStart(2, "0"),
  ].join("-");
}

export function AvailabilityPicker({
  copy,
  locale,
  locationId,
  locationTimeZone,
  serviceId,
}: AvailabilityPickerProps) {
  const [date, setDate] = useState("");
  const [timeZone, setTimeZone] = useState(locationTimeZone);
  const [partySize, setPartySize] = useState(1);
  const [result, setResult] = useState<AvailabilityV1Response>();
  const [selected, setSelected] = useState<AvailabilitySlotV1>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (error) document.querySelector<HTMLElement>("#availability-error")?.focus();
  }, [error]);

  async function search(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!serviceId || !locationId || !date) return;
    setLoading(true);
    setError(undefined);
    setSelected(undefined);
    try {
      const query = new URLSearchParams({
        endBefore: localMidnight(addCalendarDays(date, 7), timeZone),
        locale,
        locationId,
        partySize: String(partySize),
        serviceId,
        startAfter: localMidnight(date, timeZone),
        timeZone,
      });
      const response = await fetch(`/api/availability?${query}`, {
        credentials: "omit",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("Availability request failed");
      setResult(parseAvailabilityV1Response(await response.json()));
    } catch {
      setResult(undefined);
      setError(copy.error);
    } finally {
      setLoading(false);
    }
  }

  function selectSlot(slot: AvailabilitySlotV1) {
    setSelected(slot);
  }

  const unavailable = serviceId === null || locationId === null;
  return (
    <Surface
      as="section"
      className="availability-picker"
      labelledBy="availability-title"
    >
      <div className="availability-picker__heading">
        <h2 id="availability-title">{copy.title}</h2>
        <p>{copy.summary}</p>
      </div>
      {unavailable ? (
        <p>{copy.unavailable}</p>
      ) : (
        <form aria-busy={loading || undefined} onSubmit={search}>
          {error ? (
            <ErrorSummary focusTarget id="availability-error" title={copy.errorTitle}>
              <p>{error}</p>
              <Button onClick={() => void search()} variant="secondary">
                {copy.retry}
              </Button>
            </ErrorSummary>
          ) : null}
          <div className="availability-filters">
            <label>
              <span>{copy.dateLabel}</span>
              <input
                name="date"
                onChange={(event) => setDate(event.currentTarget.value)}
                required
                type="date"
                value={date}
              />
            </label>
            <label>
              <span>{copy.timeZoneLabel}</span>
              <input
                autoComplete="off"
                dir="ltr"
                name="timeZone"
                onChange={(event) => setTimeZone(event.currentTarget.value)}
                required
                value={timeZone}
              />
            </label>
            <label>
              <span>{copy.partySizeLabel}</span>
              <input
                inputMode="numeric"
                max={50}
                min={1}
                name="partySize"
                onChange={(event) => setPartySize(event.currentTarget.valueAsNumber)}
                required
                type="number"
                value={partySize}
              />
            </label>
          </div>
          <Button loading={loading} loadingLabel={copy.searching} type="submit">
            {copy.search}
          </Button>
        </form>
      )}
      {result ? (
        <AvailabilityResults
          copy={copy}
          displayTimeZone={result.displayTimeZone}
          locale={locale}
          noSlotReason={result.noSlotReason}
          onSelect={selectSlot}
          selectedStartAt={selected?.startAt ?? null}
          serviceTimeZone={result.locationTimeZone}
          slots={result.slots}
        />
      ) : null}
      {selected ? (
        <StatusMessage tone="positive">
          {copy.selectedAnnouncement.replace(
            "{time}",
            formatDateTime(selected.startAt, locale, timeZone),
          )}
        </StatusMessage>
      ) : null}
    </Surface>
  );
}
