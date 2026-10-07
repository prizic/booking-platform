import { formatTimeZone, type Locale } from "@wlbp/i18n";
import { Alert, Button, EmptyState } from "@wlbp/ui-foundation";
import { CalendarX, Check } from "lucide-react";

import type {
  AvailabilityNoSlotReasonV1,
  AvailabilitySlotV1,
} from "@wlbp/api-contracts";

import { formatWallDateTime } from "../_lib/wall-time";
import { availabilitySlotIdentity } from "./availability-picker-state";

export interface AvailabilityResultsCopy {
  readonly advisory: string;
  readonly empty: string;
  readonly emptyAction: string;
  readonly locationTimeZone: string;
  readonly shownIn: string;
  readonly noSlotReasons: Readonly<Record<AvailabilityNoSlotReasonV1, string>>;
  readonly results: string;
  readonly select: string;
  readonly selected: string;
}

interface AvailabilityResultsProps {
  readonly copy: AvailabilityResultsCopy;
  readonly displayTimeZone: string;
  readonly locale: Locale;
  readonly noSlotReason: AvailabilityNoSlotReasonV1 | null;
  readonly onSelect: (slot: AvailabilitySlotV1) => void;
  readonly selectedSlot: AvailabilitySlotV1 | null;
  readonly serviceTimeZone: string;
  readonly slots: readonly AvailabilitySlotV1[];
}

export function AvailabilityResults({
  copy,
  displayTimeZone,
  locale,
  noSlotReason,
  onSelect,
  selectedSlot,
  serviceTimeZone,
  slots,
}: AvailabilityResultsProps) {
  if (slots.length === 0) {
    return (
      <EmptyState
        icon={<CalendarX aria-hidden="true" />}
        title={noSlotReason === null ? copy.empty : copy.noSlotReasons[noSlotReason]}
        description={copy.emptyAction}
      />
    );
  }

  return (
    <section aria-labelledby="availability-results-title" className="grid gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 id="availability-results-title" className="text-base font-semibold">
          {copy.results}
        </h3>
        {/* The zone is stated once for the whole list, not after every time. */}
        <p className="text-sm text-muted-foreground">
          {copy.shownIn}: {formatTimeZone(slots[0]!.startAt, locale, displayTimeZone)}
          {serviceTimeZone === displayTimeZone ? null : (
            <>
              {" · "}
              {copy.locationTimeZone}: <bdi dir="ltr">{serviceTimeZone}</bdi>
            </>
          )}
        </p>
      </div>
      <Alert tone="warning">{copy.advisory}</Alert>
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {slots.map((slot) => {
          const selected =
            selectedSlot !== null &&
            availabilitySlotIdentity(slot) === availabilitySlotIdentity(selectedSlot);
          return (
            <li
              key={availabilitySlotIdentity(slot)}
              data-selected={selected || undefined}
              className="flex items-center justify-between gap-3 rounded-lg border bg-card py-2 ps-4 pe-2 transition-colors data-[selected]:border-primary data-[selected]:bg-primary-soft"
            >
              <time
                className="text-sm font-medium [font-variant-numeric:tabular-nums]"
                dateTime={slot.startAt}
              >
                {formatWallDateTime(slot.startAt, locale, displayTimeZone)}
              </time>
              <Button
                aria-pressed={selected}
                onClick={() => onSelect(slot)}
                variant={selected ? "default" : "outline"}
              >
                {selected ? <Check aria-hidden="true" /> : null}
                {selected ? copy.selected : copy.select}
              </Button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
