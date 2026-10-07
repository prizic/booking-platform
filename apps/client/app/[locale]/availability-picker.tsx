"use client";

import {
  parseAvailabilityV1Response,
  type AvailabilitySlotV1,
} from "@wlbp/api-contracts";
import { resolveZonedLocalDateTime, type Locale } from "@wlbp/i18n";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DatePicker,
  Field,
  FieldError,
  FieldGroup,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wlbp/ui-foundation";
import { RotateCw, Search } from "lucide-react";
import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { formatWallDateTime } from "../_lib/wall-time";
import {
  AvailabilityResults,
  type AvailabilityResultsCopy,
} from "./availability-results";
import {
  availabilityPickerReducer,
  initialAvailabilityPickerState,
  type AvailabilityPickerAction,
} from "./availability-picker-state";
import { timeZoneOptions, type TimeZoneOrigin } from "./time-zone-options";

export interface AvailabilityPickerCopy extends AvailabilityResultsCopy {
  readonly dateLabel: string;
  readonly datePlaceholder: string;
  readonly dateRequired: string;
  readonly formErrorTitle: string;
  readonly error: string;
  readonly errorTitle: string;
  readonly partySizeLabel: string;
  readonly retry: string;
  readonly search: string;
  readonly searching: string;
  readonly selectedAnnouncement: string;
  readonly summary: string;
  readonly timeZoneDeviceHint: string;
  readonly timeZoneLabel: string;
  readonly timeZoneServiceHint: string;
  readonly title: string;
  readonly unavailable: string;
}

interface AvailabilityPickerProps {
  readonly copy: AvailabilityPickerCopy;
  readonly locale: Locale;
  readonly locationId: string | null;
  readonly locationTimeZone: string;
  /** Called when a customer picks a slot, so a caller can continue the journey. */
  readonly onSlotSelected?: (slot: AvailabilitySlotV1) => void;
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

/** "GMT+3" in the page language; only computed in the browser, after hydration. */
function zoneOffset(zone: string, locale: Locale): string {
  try {
    return (
      new Intl.DateTimeFormat(locale === "ar" ? "ar-u-nu-arab" : "en", {
        timeZone: zone,
        timeZoneName: "shortOffset",
      })
        .formatToParts(new Date())
        .find((part) => part.type === "timeZoneName")?.value ?? ""
    );
  } catch {
    return "";
  }
}

function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
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
  onSlotSelected,
  serviceId,
}: AvailabilityPickerProps) {
  const [state, dispatch] = useReducer(
    availabilityPickerReducer,
    locationTimeZone,
    initialAvailabilityPickerState,
  );
  const [interactive, setInteractive] = useState(false);
  const [deviceZone, setDeviceZone] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const activeRequest = useRef<AbortController>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setDeviceZone(deviceTimeZone());
      setInteractive(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (state.failed) {
      document.querySelector<HTMLElement>("#availability-error")?.focus();
    }
  }, [state.failed]);

  useEffect(() => {
    if (dateError !== null) {
      document.querySelector<HTMLElement>("#availability-form-error")?.focus();
    }
  }, [dateError]);

  useEffect(() => () => activeRequest.current?.abort(), []);

  const zoneOptions = useMemo(
    () =>
      timeZoneOptions(locationTimeZone, deviceZone).map((option) => ({
        ...option,
        // Offsets can differ between server and browser data, so they appear
        // only once the picker is interactive.
        offset: interactive ? zoneOffset(option.zone, locale) : "",
      })),
    [deviceZone, interactive, locale, locationTimeZone],
  );
  const zoneHints: Readonly<Record<TimeZoneOrigin, string | null>> = {
    common: null,
    device: copy.timeZoneDeviceHint,
    service: copy.timeZoneServiceHint,
  };

  function changeFilter(action: AvailabilityPickerAction) {
    activeRequest.current?.abort();
    activeRequest.current = null;
    dispatch(action);
  }

  async function search(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const snapshot = Object.freeze({ ...state.filters });
    if (!serviceId || !locationId) return;
    if (!snapshot.date) {
      setDateError(copy.dateRequired);
      return;
    }
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
    onSlotSelected?.(slot);
  }

  const unavailable = serviceId === null || locationId === null;
  return (
    <Card aria-labelledby="availability-title" role="region">
      <CardHeader>
        <CardTitle id="availability-title">{copy.title}</CardTitle>
        <CardDescription>{copy.summary}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        {unavailable ? (
          <Alert tone="info">{copy.unavailable}</Alert>
        ) : (
          <form
            aria-busy={state.loading || !interactive || undefined}
            className="grid gap-5"
            onSubmit={search}
          >
            {state.failed ? (
              <Alert
                className="outline-none focus-visible:ring-[3px] focus-visible:ring-destructive/40"
                id="availability-error"
                tabIndex={-1}
                tone="danger"
              >
                <AlertTitle>{copy.errorTitle}</AlertTitle>
                <AlertDescription className="grid justify-items-start gap-3">
                  <p>{copy.error}</p>
                  <Button onClick={() => void search()} variant="outline">
                    <RotateCw aria-hidden="true" />
                    {copy.retry}
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
            {dateError === null ? null : (
              <Alert
                className="outline-none focus-visible:ring-[3px] focus-visible:ring-destructive/40"
                id="availability-form-error"
                tabIndex={-1}
                tone="danger"
              >
                <AlertTitle>{copy.formErrorTitle}</AlertTitle>
                <AlertDescription>
                  <a
                    className="font-semibold text-destructive underline underline-offset-4"
                    href="#availability-date"
                  >
                    {dateError}
                  </a>
                </AlertDescription>
              </Alert>
            )}
            <FieldGroup columns={3}>
              <Field invalid={dateError !== null}>
                <Label htmlFor="availability-date">{copy.dateLabel}</Label>
                <DatePicker
                  {...(dateError === null
                    ? {}
                    : {
                        "aria-describedby": "availability-date-error",
                        "aria-invalid": true,
                      })}
                  disabled={!interactive}
                  id="availability-date"
                  locale={locale}
                  name="date"
                  onValueChange={(value) => {
                    setDateError(null);
                    changeFilter({ field: "date", type: "filterChanged", value });
                  }}
                  placeholder={copy.datePlaceholder}
                  required
                  value={state.filters.date}
                />
                <FieldError id="availability-date-error">{dateError}</FieldError>
              </Field>
              <Field>
                <Label htmlFor="availability-time-zone">{copy.timeZoneLabel}</Label>
                <Select
                  disabled={!interactive}
                  name="timeZone"
                  onValueChange={(value) =>
                    changeFilter({ field: "timeZone", type: "filterChanged", value })
                  }
                  required
                  value={state.filters.timeZone}
                >
                  <SelectTrigger id="availability-time-zone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {zoneOptions.map((option) => {
                      const details = [option.offset, zoneHints[option.origin]]
                        .filter(Boolean)
                        .join(" · ");
                      return (
                        <SelectItem key={option.zone} value={option.zone}>
                          <bdi dir="ltr">{option.zone}</bdi>
                          {details === "" ? null : (
                            <span className="text-muted-foreground">{details}</span>
                          )}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <Label htmlFor="availability-party-size">{copy.partySizeLabel}</Label>
                <Input
                  disabled={!interactive}
                  id="availability-party-size"
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
              </Field>
            </FieldGroup>
            <Button
              className="justify-self-start"
              disabled={!interactive}
              loading={state.loading}
              loadingLabel={copy.searching}
              type="submit"
            >
              <Search aria-hidden="true" />
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
          <Alert tone="positive">
            {copy.selectedAnnouncement.replace(
              "{time}",
              formatWallDateTime(
                state.selected.startAt,
                locale,
                state.result.snapshot.timeZone,
              ),
            )}
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
