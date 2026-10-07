"use client";

import {
  parseAvailabilityV1Response,
  type AvailabilitySlotV1,
} from "@wlbp/api-contracts";
import type { Locale } from "@wlbp/i18n";
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
  FieldGroup,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  formErrorMessage,
  useZodForm,
} from "@wlbp/ui-foundation";
import { useQuery } from "@tanstack/react-query";
import { RotateCw, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { formatWallDateTime } from "../_lib/wall-time";
import {
  AvailabilityResults,
  type AvailabilityResultsCopy,
} from "./availability-results";
import {
  availabilityQueryKey,
  availabilitySearchParams,
  type AvailabilityQuerySnapshot,
} from "./availability-picker-state";
import {
  availabilityDateRequired,
  availabilitySearchSchema,
} from "./availability-schema";
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

/** Each searchable field and the control its summary link moves focus to. */
const fieldControls = [
  ["date", "availability-date"],
  ["timeZone", "availability-time-zone"],
  ["partySize", "availability-party-size"],
] as const;

export function AvailabilityPicker({
  copy,
  locale,
  locationId,
  locationTimeZone,
  onSlotSelected,
  serviceId,
}: AvailabilityPickerProps) {
  const [interactive, setInteractive] = useState(false);
  const [deviceZone, setDeviceZone] = useState<string | null>(null);
  // The filters of the search being shown. Changing any filter clears it, so
  // results and a selection never outlive the search they belong to.
  const [submitted, setSubmitted] = useState<AvailabilityQuerySnapshot | null>(null);
  const [selected, setSelected] = useState<AvailabilitySlotV1 | null>(null);
  const [summaryFocus, setSummaryFocus] = useState(0);
  const focusedSummary = useRef(0);
  const formMessages = useMemo(
    () => ({ [availabilityDateRequired]: copy.dateRequired }),
    [copy.dateRequired],
  );

  const form = useZodForm(availabilitySearchSchema, {
    defaultValues: { date: "", partySize: "1", timeZone: locationTimeZone },
    // The error summary takes focus instead, then links to each field.
    shouldFocusError: false,
  });

  const target =
    serviceId === null || locationId === null
      ? null
      : { locale, locationId, serviceId };
  const availability = useQuery({
    enabled: target !== null && submitted !== null,
    queryKey:
      target !== null && submitted !== null
        ? availabilityQueryKey(target, submitted)
        : ["availability", "idle"],
    queryFn: async ({ signal }) => {
      const query = availabilitySearchParams(target!, submitted!);
      const response = await fetch(`/api/availability?${query}`, {
        credentials: "omit",
        headers: { Accept: "application/json" },
        signal,
      });
      if (!response.ok) throw new Error("Availability request failed");
      return parseAvailabilityV1Response(await response.json());
    },
    // Advisory times: never retried or refreshed behind the customer's back.
    // "Try again" and a new search are the only ways to fetch again.
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 0,
  });

  const searching = submitted !== null && availability.isFetching;
  const failed = submitted !== null && !searching && availability.status === "error";
  const response =
    submitted !== null && !searching && availability.status === "success"
      ? availability.data
      : undefined;

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setDeviceZone(deviceTimeZone());
      setInteractive(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (failed) document.querySelector<HTMLElement>("#availability-error")?.focus();
  }, [failed]);

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

  function clearSearch() {
    setSubmitted(null);
    setSelected(null);
  }

  const search = form.handleSubmit(
    (values) => {
      const snapshot = Object.freeze({
        date: values.date,
        partySize: values.partySize,
        timeZone: values.timeZone,
      });
      setSelected(null);
      const unchanged =
        submitted !== null &&
        submitted.date === snapshot.date &&
        submitted.partySize === snapshot.partySize &&
        submitted.timeZone === snapshot.timeZone;
      // Searching again for the same filters asks the server again.
      if (unchanged) void availability.refetch();
      else setSubmitted(snapshot);
    },
    () => setSummaryFocus((count) => count + 1),
  );

  function selectSlot(slot: AvailabilitySlotV1) {
    setSelected(slot);
    onSlotSelected?.(slot);
  }

  const { errors } = form.formState;
  const problems = fieldControls.flatMap(([field, controlId]) => {
    const text = formErrorMessage(errors[field]?.message, locale, formMessages);
    return text === undefined ? [] : [{ controlId, text }];
  });
  const summaryShown = problems.length > 0;
  // Each refused search moves focus to the summary once, as soon as the
  // summary is rendered (field errors can arrive a render after the submit).
  useEffect(() => {
    if (summaryShown && summaryFocus > focusedSummary.current) {
      focusedSummary.current = summaryFocus;
      document.querySelector<HTMLElement>("#availability-form-error")?.focus();
    }
  }, [summaryFocus, summaryShown]);

  return (
    <Card aria-labelledby="availability-title" role="region">
      <CardHeader>
        <CardTitle id="availability-title">{copy.title}</CardTitle>
        <CardDescription>{copy.summary}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        {target === null ? (
          <Alert tone="info">{copy.unavailable}</Alert>
        ) : (
          <Form form={form} locale={locale} messages={formMessages}>
            <form
              aria-busy={searching || !interactive || undefined}
              className="grid gap-5"
              noValidate
              onSubmit={(event) => void search(event)}
            >
              {failed ? (
                <Alert
                  className="outline-none focus-visible:ring-[3px] focus-visible:ring-destructive/40"
                  id="availability-error"
                  tabIndex={-1}
                  tone="danger"
                >
                  <AlertTitle>{copy.errorTitle}</AlertTitle>
                  <AlertDescription className="grid justify-items-start gap-3">
                    <p>{copy.error}</p>
                    <Button
                      onClick={() => void availability.refetch()}
                      variant="outline"
                    >
                      <RotateCw aria-hidden="true" />
                      {copy.retry}
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : null}
              {problems.length === 0 ? null : (
                <Alert
                  className="outline-none focus-visible:ring-[3px] focus-visible:ring-destructive/40"
                  id="availability-form-error"
                  tabIndex={-1}
                  tone="danger"
                >
                  <AlertTitle>{copy.formErrorTitle}</AlertTitle>
                  <AlertDescription>
                    <ul className="grid gap-1">
                      {problems.map((problem) => (
                        <li key={problem.controlId}>
                          <a
                            className="font-semibold text-destructive underline underline-offset-4"
                            href={`#${problem.controlId}`}
                          >
                            {problem.text}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
              <FieldGroup columns={3}>
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="availability-date">
                        {copy.dateLabel}
                      </FormLabel>
                      <FormControl>
                        <DatePicker
                          disabled={!interactive}
                          id="availability-date"
                          locale={locale}
                          name="date"
                          onValueChange={(value) => {
                            clearSearch();
                            field.onChange(value);
                          }}
                          placeholder={copy.datePlaceholder}
                          required
                          value={field.value}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="timeZone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="availability-time-zone">
                        {copy.timeZoneLabel}
                      </FormLabel>
                      <Select
                        disabled={!interactive}
                        name="timeZone"
                        onValueChange={(value) => {
                          clearSearch();
                          field.onChange(value);
                        }}
                        required
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger id="availability-time-zone">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-72">
                          {zoneOptions.map((option) => {
                            const details = [option.offset, zoneHints[option.origin]]
                              .filter(Boolean)
                              .join(" · ");
                            return (
                              <SelectItem key={option.zone} value={option.zone}>
                                <bdi dir="ltr">{option.zone}</bdi>
                                {details === "" ? null : (
                                  <span className="text-muted-foreground">
                                    {details}
                                  </span>
                                )}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="partySize"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="availability-party-size">
                        {copy.partySizeLabel}
                      </FormLabel>
                      <FormControl>
                        <Input
                          disabled={!interactive}
                          id="availability-party-size"
                          inputMode="numeric"
                          max={50}
                          min={1}
                          name="partySize"
                          onBlur={field.onBlur}
                          onChange={(event) => {
                            clearSearch();
                            field.onChange(event.currentTarget.value);
                          }}
                          ref={field.ref}
                          required
                          type="number"
                          value={String(field.value ?? "")}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </FieldGroup>
              <Button
                className="justify-self-start"
                disabled={!interactive}
                loading={searching}
                loadingLabel={copy.searching}
                type="submit"
              >
                <Search aria-hidden="true" />
                {copy.search}
              </Button>
            </form>
          </Form>
        )}
        {response && submitted ? (
          <AvailabilityResults
            copy={copy}
            displayTimeZone={response.displayTimeZone}
            locale={locale}
            noSlotReason={response.noSlotReason}
            onSelect={selectSlot}
            selectedSlot={selected}
            serviceTimeZone={response.locationTimeZone}
            slots={response.slots}
          />
        ) : null}
        {selected && response && submitted ? (
          <Alert tone="positive">
            {copy.selectedAnnouncement.replace(
              "{time}",
              formatWallDateTime(selected.startAt, locale, submitted.timeZone),
            )}
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
