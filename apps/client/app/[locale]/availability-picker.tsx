"use client";

import {
  parseAvailabilityV1Response,
  type AvailabilitySlotV1,
} from "@wlbp/api-contracts";
import { formatDateTime, resolveZonedLocalDateTime, type Locale } from "@wlbp/i18n";
import { Button, ErrorSummary, StatusMessage, Surface } from "@wlbp/ui-foundation";
import { useEffect, useReducer, useRef, type FormEvent } from "react";

import {
  AvailabilityResults,
  type AvailabilityResultsCopy,
} from "./availability-results";
import {
  availabilityPickerReducer,
  initialAvailabilityPickerState,
  type AvailabilityPickerAction,
} from "./availability-picker-state";

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
  const [state, dispatch] = useReducer(
    availabilityPickerReducer,
    locationTimeZone,
    initialAvailabilityPickerState,
  );
  const requestSequence = useRef(0);
  const activeRequest = useRef<AbortController>(null);

  useEffect(() => {
    if (state.failed) {
      document.querySelector<HTMLElement>("#availability-error")?.focus();
    }
  }, [state.failed]);

  useEffect(() => () => activeRequest.current?.abort(), []);

  function changeFilter(action: AvailabilityPickerAction) {
    activeRequest.current?.abort();
    activeRequest.current = null;
    dispatch(action);
  }

  async function search(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const snapshot = Object.freeze({ ...state.filters });
    if (!serviceId || !locationId || !snapshot.date) return;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const requestId = ++requestSequence.current;
    dispatch({ requestId, snapshot, type: "submitted" });
    try {
      const query = new URLSearchParams({
        endBefore: localMidnight(addCalendarDays(snapshot.date, 7), snapshot.timeZone),
        locale,
        locationId,
        partySize: String(snapshot.partySize),
        serviceId,
        startAfter: localMidnight(snapshot.date, snapshot.timeZone),
        timeZone: snapshot.timeZone,
      });
      const response = await fetch(`/api/availability?${query}`, {
        credentials: "omit",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Availability request failed");
      dispatch({
        requestId,
        response: parseAvailabilityV1Response(await response.json()),
        type: "resolved",
      });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        dispatch({ requestId, type: "rejected" });
      }
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
    }
  }

  function selectSlot(slot: AvailabilitySlotV1) {
    dispatch({ slot, type: "selected" });
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
        <form aria-busy={state.loading || undefined} onSubmit={search}>
          {state.failed ? (
            <ErrorSummary focusTarget id="availability-error" title={copy.errorTitle}>
              <p>{copy.error}</p>
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
                onChange={(event) =>
                  changeFilter({
                    field: "date",
                    type: "filterChanged",
                    value: event.currentTarget.value,
                  })
                }
                required
                type="date"
                value={state.filters.date}
              />
            </label>
            <label>
              <span>{copy.timeZoneLabel}</span>
              <input
                autoComplete="off"
                dir="ltr"
                name="timeZone"
                onChange={(event) =>
                  changeFilter({
                    field: "timeZone",
                    type: "filterChanged",
                    value: event.currentTarget.value,
                  })
                }
                required
                value={state.filters.timeZone}
              />
            </label>
            <label>
              <span>{copy.partySizeLabel}</span>
              <input
                inputMode="numeric"
                max={50}
                min={1}
                name="partySize"
                onChange={(event) =>
                  changeFilter({
                    field: "partySize",
                    type: "filterChanged",
                    value: event.currentTarget.valueAsNumber,
                  })
                }
                required
                type="number"
                value={state.filters.partySize}
              />
            </label>
          </div>
          <Button loading={state.loading} loadingLabel={copy.searching} type="submit">
            {copy.search}
          </Button>
        </form>
      )}
      {state.result ? (
        <AvailabilityResults
          copy={copy}
          displayTimeZone={state.result.response.displayTimeZone}
          locale={locale}
          noSlotReason={state.result.response.noSlotReason}
          onSelect={selectSlot}
          selectedSlot={state.selected ?? null}
          serviceTimeZone={state.result.response.locationTimeZone}
          slots={state.result.response.slots}
        />
      ) : null}
      {state.selected && state.result ? (
        <StatusMessage tone="positive">
          {copy.selectedAnnouncement.replace(
            "{time}",
            formatDateTime(
              state.selected.startAt,
              locale,
              state.result.snapshot.timeZone,
            ),
          )}
        </StatusMessage>
      ) : null}
    </Surface>
  );
}
